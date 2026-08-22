import { Notification, app } from "electron";
import { resolveSystemLanguage, type Routine } from "@whalex/shared";
import type { AgentHost } from "./AgentHost.js";
import type { SettingsManager } from "./settings.js";

const CHECK_MS = 30_000;

/**
 * Fires saved routines on schedule. Poll-based: every 30s it re-reads
 * settings and runs whatever became due — nothing to reschedule when routines
 * are edited, and launching the app after downtime runs at most one catch-up
 * per routine (the due check compares lastRunAt against the most recent
 * scheduled slot, not every missed one).
 */
export class RoutineManager {
  private timer: NodeJS.Timeout | null = null;
  /** routineId → sessionId of the run in flight (overlap guard). */
  private active = new Map<string, string>();

  constructor(
    private settings: SettingsManager,
    private host: AgentHost,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), CHECK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Manual "run now" from Settings — ignores the schedule and enabled flag. */
  async runNow(id: string): Promise<{ ok: boolean; error?: string }> {
    const routine = this.settings.get().routines.find((r) => r.id === id);
    if (!routine) return { ok: false, error: "Routine not found." };
    const running = this.active.get(routine.id);
    if (running && this.host.isSessionRunning(running)) {
      return { ok: false, error: "This routine is already running." };
    }
    try {
      await this.fire(routine);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    for (const routine of this.settings.get().routines) {
      if (!routine.enabled) continue;
      const running = this.active.get(routine.id);
      if (running && this.host.isSessionRunning(running)) continue;
      if (!this.isDue(routine, now)) continue;
      try {
        await this.fire(routine);
      } catch {
        // A broken cwd or provider must not kill the scheduler loop; the
        // routine keeps its lastRunAt bump so it doesn't retry every 30s.
      }
    }
  }

  private isDue(routine: Routine, now: number): boolean {
    const sched = routine.schedule;
    const last = routine.lastRunAt ?? 0;
    switch (sched.kind) {
      case "interval":
        // First sighting starts the clock instead of firing immediately.
        if (!last) {
          this.patch(routine.id, { lastRunAt: now });
          return false;
        }
        return now - last >= sched.minutes * 60_000;
      case "daily":
      case "weekly":
        // First sighting starts the clock, as with intervals: a routine saved
        // at 14:00 for 09:00 is meant for tomorrow morning, not for right now.
        // Stamping `now` still lets one saved before today's slot fire today.
        if (!last) {
          this.patch(routine.id, { lastRunAt: now });
          return false;
        }
        if (sched.kind === "weekly" && new Date(now).getDay() !== sched.weekday) return false;
        return dueAt(todayAt(sched.time, now), last, now);
      case "once":
        return !last && now >= sched.at;
      case "manual":
        // No clock trigger — only "Run now" fires a manual routine.
        return false;
    }
  }

  private async fire(routine: Routine): Promise<void> {
    // Mark before starting so a start() failure can't retrigger every tick;
    // one-shot routines switch off for good.
    this.patch(routine.id, {
      lastRunAt: Date.now(),
      ...(routine.schedule.kind === "once" ? { enabled: false } : {}),
    });
    const { sessionId } = await this.host.runRoutine(routine, this.settings.get().defaultModel);
    this.active.set(routine.id, sessionId);
    this.patch(routine.id, { lastSessionId: sessionId });
    this.notifyStarted(routine.name);
  }

  private patch(id: string, patch: Partial<Routine>): void {
    const routines = this.settings
      .get()
      .routines.map((r) => (r.id === id ? { ...r, ...patch } : r));
    this.settings.update({ routines });
  }

  /** OS toast so an unattended run doesn't happen invisibly. */
  private notifyStarted(name: string): void {
    if (!Notification.isSupported()) return;
    let lang = this.settings.get().language;
    if (lang === "system") {
      lang = resolveSystemLanguage(app.getLocale());
    }
    const TEXT: Record<string, string> = {
      en: "Routine started",
      ko: "루틴을 시작했습니다",
      zh: "例行任务已开始",
      ja: "ルーチンを開始しました",
      fr: "Routine démarrée",
      "zh-TW": "排程已開始",
      de: "Routine gestartet",
      ru: "Рутина запущена",
      vi: "Đã bắt đầu lịch chạy",
      th: "เริ่มงานตามเวลาแล้ว",
      id: "Rutinitas dimulai",
    };
    new Notification({ title: name, body: TEXT[lang] ?? TEXT.en }).show();
  }
}

function todayAt(hhmm: string, now: number): number {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(now);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.getTime();
}

function dueAt(target: number, last: number, now: number): boolean {
  return now >= target && last < target;
}
