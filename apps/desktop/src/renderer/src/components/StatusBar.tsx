import { useTranslation } from "react-i18next";
import { useSessionStore } from "../stores/sessionStore";

export function StatusBar() {
  const { t } = useTranslation();
  const usage = useSessionStore((s) => s.usage);
  const status = useSessionStore((s) => s.status);
  const model = useSessionStore((s) => s.model);
  const cwd = useSessionStore((s) => s.cwd);

  return (
    <div className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-surface px-4 text-[11px] text-faint">
      <span className="max-w-72 truncate" title={cwd ?? ""}>
        {cwd}
      </span>
      <span className="font-mono">{model}</span>
      {status !== "idle" && (
        <span className="flex items-center gap-1.5 text-accent">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          {t(`status.${status}`)}
        </span>
      )}
      <div className="flex-1" />
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
