import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, TriangleAlert, X } from "lucide-react";
import { useSessionStore } from "../stores/sessionStore";
import { useUiStore } from "../stores/uiStore";
import { whalex } from "../lib/ipc";

/** Today's ledger spend; refreshed lazily so the bar stays cheap. */
function TodaySpend() {
  const { t } = useTranslation();
  const openSettings = useUiStore((s) => s.openSettings);
  const [usd, setUsd] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      void whalex
        .invoke("usage:summary", { days: 1 })
        .then((s) => alive && setUsd(s.todayUsd))
        .catch(() => {});
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  if (usd === null || usd === 0) return null;
  return (
    <button
      onClick={() => openSettings("usage")}
      className="hover:text-text"
      title={t("statusbar.todayTip")}
    >
      {t("statusbar.today", { usd: usd.toFixed(2) })}
    </button>
  );
}

/** Spend-limit alert pushed from main; sticky until dismissed. */
function UsageWarningChip() {
  const { t } = useTranslation();
  const warning = useUiStore((s) => s.usageWarning);
  const dismiss = useUiStore((s) => s.dismissUsageWarning);
  const openSettings = useUiStore((s) => s.openSettings);
  if (!warning) return null;
  const label =
    warning.kind === "balance"
      ? t("usage.warn.balance", { usd: warning.usd.toFixed(2) })
      : t(`usage.warn.${warning.kind}`, { pct: warning.pct, limit: warning.limit.toFixed(2) });
  return (
    <span className="flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-warn">
      <TriangleAlert size={11} />
      <button onClick={() => openSettings("usage")} className="hover:underline">
        {label}
      </button>
      <button onClick={dismiss} aria-label={t("common.cancel")} className="hover:text-text">
        <X size={10} />
      </button>
    </span>
  );
}

function formatDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.floor(s % 60)}s`;
}

/** Live elapsed timer while a turn runs; final duration once it completes. */
function ElapsedTime() {
  const { t } = useTranslation();
  const status = useSessionStore((s) => s.status);
  const turnStartedAt = useSessionStore((s) => s.turnStartedAt);
  const lastTurnMs = useSessionStore((s) => s.lastTurnMs);
  const [now, setNow] = useState(Date.now());

  const running = status !== "idle" && turnStartedAt !== null;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [running]);

  if (running && turnStartedAt) {
    return (
      <span className="flex items-center gap-1 text-accent">
        <Clock size={11} />
        {formatDuration(now - turnStartedAt)}
      </span>
    );
  }
  if (lastTurnMs !== null) {
    return (
      <span className="flex items-center gap-1" title={t("statusbar.lastDuration")}>
        <Clock size={11} />
        {formatDuration(lastTurnMs)}
      </span>
    );
  }
  return null;
}

export function StatusBar() {
  const { t } = useTranslation();
  const usage = useSessionStore((s) => s.usage);
  const status = useSessionStore((s) => s.status);
  const model = useSessionStore((s) => s.model);
  const cwd = useSessionStore((s) => s.cwd);
  const superCode = useSessionStore((s) => s.superCode);
  const subagents = useSessionStore((s) => s.subagents);
  const runningAgents = Object.values(subagents).filter((a) => a.state === "running").length;

  return (
    <div className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-surface px-4 text-[11px] text-faint">
      <span className="max-w-72 truncate" title={cwd ?? ""}>
        {cwd}
      </span>
      <span className="font-mono">{model}</span>
      {superCode && <span className="text-accent">SuperCode</span>}
      {runningAgents > 0 && (
        <span className="text-accent">{t("statusbar.agentsRunning", { count: runningAgents })}</span>
      )}
      {status !== "idle" && (
        <span className="flex items-center gap-1.5 text-accent">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          {t(`status.${status}`)}
        </span>
      )}
      <div className="flex-1" />
      <UsageWarningChip />
      <TodaySpend />
      <ElapsedTime />
      {usage && (
        <>
          <span>
            {t("statusbar.tokens")} ↑{usage.inputTokens.toLocaleString()} ↓
            {usage.outputTokens.toLocaleString()}
          </span>
          <span className="flex items-center gap-1.5">
            {t("statusbar.context")}
            <span className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
              <span
                className={`block h-full rounded-full ${
                  usage.contextPct > 75 ? "bg-warn" : "bg-accent"
                }`}
                style={{ width: `${usage.contextPct}%` }}
              />
            </span>
            {usage.contextPct}%
          </span>
          {usage.costUsd > 0 && <span>${usage.costUsd.toFixed(4)}</span>}
        </>
      )}
    </div>
  );
}
