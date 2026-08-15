import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import { useSessionStore } from "../stores/sessionStore";

function formatDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.floor(s % 60)}s`;
}

/** Live elapsed timer while a turn runs; final duration once it completes. */
function ElapsedTime() {
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
      <span className="flex items-center gap-1" title="마지막 응답 소요 시간">
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
      {runningAgents > 0 && <span className="text-accent">에이전트 {runningAgents}개 실행 중</span>}
      {status !== "idle" && (
        <span className="flex items-center gap-1.5 text-accent">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          {t(`status.${status}`)}
        </span>
      )}
      <div className="flex-1" />
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
