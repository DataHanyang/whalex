import fs from "node:fs";
import path from "node:path";
import { resolveModelInfo, type UsageWarning } from "@whalex/shared";
import { whalexHome } from "@whalex/core";
import type { SettingsManager } from "./settings.js";

interface Bucket {
  input: number;
  output: number;
  cachedInput: number;
  usd: number;
}
interface DayBucket extends Bucket {
  byModel: Record<string, Bucket>;
}
interface LedgerFile {
  days: Record<string, DayBucket>;
  /** One-shot warning flags (e.g. "d80:2026-08-19") so alerts fire once. */
  warned: Record<string, boolean>;
}

const KEEP_DAYS = 90;

/**
 * Local spend ledger. DeepSeek has a balance API but no usage API, so every
 * request's token usage (reported in-stream by the provider) is accumulated
 * here, priced by the model table, and persisted to ~/.whalex/usage.json.
 * Spend limits from Settings are checked on every write.
 */
export class UsageLedger {
  private file = path.join(whalexHome(), "usage.json");
  private data: LedgerFile;
  private saveTimer: NodeJS.Timeout | null = null;
  onWarning?: (w: UsageWarning) => void;

  constructor(private settings: SettingsManager) {
    this.data = this.load();
  }

  private load(): LedgerFile {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<LedgerFile>;
      return { days: raw.days ?? {}, warned: raw.warned ?? {} };
    } catch {
      return { days: {}, warned: {} };
    }
  }

  record(info: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    cachedPromptTokens: number;
  }): void {
    const pricing = resolveModelInfo(info.model).pricing;
    const usd = pricing
      ? ((info.promptTokens - info.cachedPromptTokens) * pricing.input +
          info.cachedPromptTokens * (pricing.cachedInput ?? pricing.input) +
          info.completionTokens * pricing.output) /
        1_000_000
      : 0;
    const day = (this.data.days[localDate()] ??= emptyDay());
    const model = (day.byModel[info.model] ??= emptyBucket());
    for (const b of [day, model]) {
      b.input += info.promptTokens;
      b.output += info.completionTokens;
      b.cachedInput += info.cachedPromptTokens;
      b.usd += usd;
    }
    this.prune();
    this.scheduleSave();
    this.checkSpendLimits();
  }

  todayUsd(): number {
    return this.data.days[localDate()]?.usd ?? 0;
  }

  monthUsd(): number {
    const month = localDate().slice(0, 7);
    return Object.entries(this.data.days)
      .filter(([d]) => d.startsWith(month))
      .reduce((sum, [, b]) => sum + b.usd, 0);
  }

  summary(days: number): {
    days: Array<{ date: string; usd: number; input: number; output: number; cachedInput: number }>;
    todayUsd: number;
    monthUsd: number;
    byModel: Record<string, Bucket>;
  } {
    const out: Array<{ date: string } & Bucket> = [];
    const byModel: Record<string, Bucket> = {};
    for (let i = days - 1; i >= 0; i--) {
      const date = localDate(-i);
      const b = this.data.days[date];
      out.push({
        date,
        usd: b?.usd ?? 0,
        input: b?.input ?? 0,
        output: b?.output ?? 0,
        cachedInput: b?.cachedInput ?? 0,
      });
      for (const [model, mb] of Object.entries(b?.byModel ?? {})) {
        const acc = (byModel[model] ??= emptyBucket());
        acc.input += mb.input;
        acc.output += mb.output;
        acc.cachedInput += mb.cachedInput;
        acc.usd += mb.usd;
      }
    }
    return { days: out, todayUsd: this.todayUsd(), monthUsd: this.monthUsd(), byModel };
  }

  /** Non-null when a hard-stop limit is fully spent — blocks new turns. */
  hardStopReason(): UsageWarning | null {
    const limits = this.settings.get().usageLimits;
    if (!limits.hardStop) return null;
    if (limits.dailyUsd > 0 && this.todayUsd() >= limits.dailyUsd) {
      return { kind: "daily", pct: 100, usd: this.todayUsd(), limit: limits.dailyUsd };
    }
    if (limits.monthlyUsd > 0 && this.monthUsd() >= limits.monthlyUsd) {
      return { kind: "monthly", pct: 100, usd: this.monthUsd(), limit: limits.monthlyUsd };
    }
    return null;
  }

  /** Called with a freshly fetched account balance; warns once per day. */
  checkBalance(total: number): void {
    const threshold = this.settings.get().usageLimits.lowBalance;
    if (threshold <= 0 || total >= threshold) return;
    this.warnOnce(`bal:${localDate()}`, { kind: "balance", usd: total, limit: threshold });
  }

  /** Flush pending writes synchronously (app shutdown). */
  flush(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data), "utf8");
    } catch {
      // Losing usage stats must never break the app.
    }
  }

  private checkSpendLimits(): void {
    const limits = this.settings.get().usageLimits;
    const date = localDate();
    const month = date.slice(0, 7);
    const checks: Array<{ kind: "daily" | "monthly"; usd: number; limit: number; key: string }> = [
      { kind: "daily", usd: this.todayUsd(), limit: limits.dailyUsd, key: date },
      { kind: "monthly", usd: this.monthUsd(), limit: limits.monthlyUsd, key: month },
    ];
    for (const c of checks) {
      if (c.limit <= 0) continue;
      const pct = (c.usd / c.limit) * 100;
      if (pct >= 100) {
        this.warnOnce(`${c.kind}100:${c.key}`, { kind: c.kind, pct: 100, usd: c.usd, limit: c.limit });
      } else if (pct >= limits.warnAtPct) {
        this.warnOnce(`${c.kind}${limits.warnAtPct}:${c.key}`, {
          kind: c.kind,
          pct: Math.round(pct),
          usd: c.usd,
          limit: c.limit,
        });
      }
    }
  }

  private warnOnce(key: string, warning: UsageWarning): void {
    if (this.data.warned[key]) return;
    this.data.warned[key] = true;
    this.scheduleSave();
    this.onWarning?.(warning);
  }

  private prune(): void {
    const cutoff = localDate(-KEEP_DAYS);
    for (const d of Object.keys(this.data.days)) {
      if (d < cutoff) delete this.data.days[d];
    }
    // Warning flags for pruned periods are dead weight too.
    for (const k of Object.keys(this.data.warned)) {
      const period = k.slice(k.indexOf(":") + 1);
      if (period < cutoff.slice(0, period.length)) delete this.data.warned[k];
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 1500);
  }
}

function emptyBucket(): Bucket {
  return { input: 0, output: 0, cachedInput: 0, usd: 0 };
}
function emptyDay(): DayBucket {
  return { ...emptyBucket(), byModel: {} };
}

/** Local-timezone YYYY-MM-DD, optionally offset by whole days. */
function localDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
