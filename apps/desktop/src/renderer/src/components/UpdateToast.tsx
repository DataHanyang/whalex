import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { useUiStore } from "../stores/uiStore";
import { whalex } from "../lib/ipc";

/**
 * Update toast anchored above the sidebar's Settings button. Owns the whole
 * flow: available → updating (progress) → downloaded → automatic
 * restart-install, with a confirm step when sessions are still working so an
 * auto-restart never silently kills a running turn. Dismissing snoozes the
 * version; a downloaded update still installs on the next normal quit.
 */
export function UpdateToast() {
  const { t } = useTranslation();
  const status = useUiStore((s) => s.updateStatus);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runningCount, setRunningCount] = useState<number | null>(null);
  const installKicked = useRef(false);

  // Download finished → count working sessions; none → restart right away.
  useEffect(() => {
    if (status.state !== "downloaded" || installKicked.current) return;
    void (async () => {
      const sessions = await whalex.invoke("session:list", {});
      const running = sessions.filter((s) => s.running).length;
      if (running === 0) {
        installKicked.current = true;
        setRunningCount(0);
        void whalex.invoke("update:install", undefined);
      } else {
        setRunningCount(running);
      }
    })();
  }, [status.state]);

  const startUpdate = () => {
    if (busy) return;
    setBusy(true);
    void whalex.invoke("update:download", undefined);
  };

  const installAnyway = () => {
    if (installKicked.current) return;
    installKicked.current = true;
    setRunningCount(0);
    void whalex.invoke("update:install", undefined);
  };

  const dismiss = () => {
    setBusy(false);
    setDismissed(status.version ?? "x");
  };

  const failed = status.state === "error" && busy;
  const show =
    (status.state === "available" && status.version !== dismissed) ||
    status.state === "downloading" ||
    (status.state === "downloaded" && status.version !== dismissed) ||
    failed;
  if (!show) return null;

  const confirming = status.state === "downloaded" && (runningCount ?? 0) > 0;
  const closable = status.state === "available" || confirming || failed;

  return (
    <div className="fixed bottom-12 left-2 z-40 w-64 rounded-xl border border-border bg-surface p-3 shadow-2xl">
      <div className="flex items-start gap-2">
        {confirming ? (
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
        ) : (
          <RefreshCw
            size={16}
            className={`mt-0.5 shrink-0 text-accent ${status.state === "downloading" ? "animate-spin" : ""}`}
          />
        )}
        <div className="min-w-0 flex-1">
          {status.state === "available" && (
            <>
              <div className="text-[13px] font-medium">
                {t("update.available", { version: status.version })}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={startUpdate}
                  disabled={busy}
                  className="rounded-md bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-60"
                >
                  {busy ? t("update.starting") : t("update.download")}
                </button>
                <button
                  onClick={dismiss}
                  disabled={busy}
                  className="rounded-md px-2 py-1 text-[12px] text-muted hover:bg-surface-2 disabled:opacity-60"
                >
                  {t("update.later")}
                </button>
              </div>
            </>
          )}
          {status.state === "downloading" && (
            <>
              <div className="text-[13px] font-medium">
                {t("update.downloading", { percent: status.percent ?? 0 })}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${status.percent ?? 0}%` }}
                />
              </div>
            </>
          )}
          {status.state === "downloaded" && !confirming && (
            <div className="text-[13px] font-medium">{t("update.restarting")}</div>
          )}
          {confirming && (
            <>
              <div className="text-[13px] font-medium">{t("update.ready")}</div>
              <div className="mt-1.5 text-[12px] leading-relaxed text-muted">
                {t("update.confirmBusy", { count: runningCount ?? 0 })}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={installAnyway}
                  className="rounded-md bg-danger px-2.5 py-1 text-[12px] font-medium text-white hover:opacity-90"
                >
                  {t("update.confirmYes")}
                </button>
                <button
                  onClick={dismiss}
                  className="rounded-md px-2 py-1 text-[12px] text-muted hover:bg-surface-2"
                >
                  {t("update.later")}
                </button>
              </div>
            </>
          )}
          {failed && (
            <div className="text-[12.5px] text-danger">
              {t("settings.update.error", { error: status.error })}
            </div>
          )}
        </div>
        {closable && (
          <button onClick={dismiss} className="shrink-0 text-faint hover:text-text">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
