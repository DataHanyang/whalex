import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, RefreshCw, X } from "lucide-react";
import { useUiStore } from "../stores/uiStore";
import { whalex } from "../lib/ipc";

/** Bottom-right update notification. Dismissable; snoozes the current version. */
export function UpdateToast() {
  const { t } = useTranslation();
  const status = useUiStore((s) => s.updateStatus);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const show =
    (status.state === "available" && status.version !== dismissed) ||
    status.state === "downloading" ||
    status.state === "downloaded";
  if (!show) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-72 rounded-xl border border-border bg-surface p-3 shadow-2xl">
      <div className="flex items-start gap-2">
        <RefreshCw size={16} className="mt-0.5 text-accent" />
        <div className="min-w-0 flex-1">
          {status.state === "available" && (
            <>
              <div className="text-[13px] font-medium">
                {t("update.available", { version: status.version })}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => void whalex.invoke("update:download", undefined)}
                  className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover"
                >
                  <Download size={12} /> {t("update.download")}
                </button>
                <button
                  onClick={() => setDismissed(status.version ?? null)}
                  className="rounded-md px-2 py-1 text-[12px] text-muted hover:bg-surface-2"
                >
                  {t("update.later")}
                </button>
              </div>
            </>
          )}
          {status.state === "downloading" && (
            <>
              <div className="text-[13px] font-medium">{t("update.downloading", { percent: status.percent })}</div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent" style={{ width: `${status.percent ?? 0}%` }} />
              </div>
            </>
          )}
          {status.state === "downloaded" && (
            <>
              <div className="text-[13px] font-medium">{t("update.ready")}</div>
              <button
                onClick={() => void whalex.invoke("update:install", undefined)}
                className="mt-2 rounded-md bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover"
              >
                {t("update.restart")}
              </button>
            </>
          )}
        </div>
        <button onClick={() => setDismissed(status.version ?? "x")} className="text-faint hover:text-text">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
