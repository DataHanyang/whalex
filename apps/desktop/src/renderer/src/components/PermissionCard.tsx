import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ShieldQuestion } from "lucide-react";
import type { PermissionRequest } from "@whalex/shared";
import { useSessionStore } from "../stores/sessionStore";
import { DiffView } from "./DiffView";

/**
 * Inline approval card. Enter = allow once, Esc = deny; "Always allow"
 * persists a rule scoped by main (e.g. `execute(npm *)`).
 */
export function PermissionCard({ request }: { request: PermissionRequest }) {
  const { t } = useTranslation();
  const respond = useSessionStore((s) => s.respondPermission);
  const [showArgs, setShowArgs] = useState(false);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Only treat Enter/Esc as approve/deny when no editable control owns
      // the keystroke — typing in a settings input, the address bar or a
      // textarea must never approve a tool.
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void respond({ id: request.id, behavior: "allow", scope: "once" });
      } else if (e.key === "Escape") {
        e.preventDefault();
        void respond({ id: request.id, behavior: "deny", scope: "once" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request.id, respond]);

  return (
    <div className="my-2 rounded-lg border border-warn/50 bg-warn-soft p-3">
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <ShieldQuestion size={16} className="text-warn" />
        {t("permission.title")}
      </div>
      <div className="mt-1.5 font-mono text-[12.5px]">{request.summary}</div>

      {request.diff && (
        <DiffView
          path={request.diff.path}
          oldText={request.diff.oldText}
          newText={request.diff.newText}
        />
      )}

      <button
        onClick={() => setShowArgs(!showArgs)}
        className="mt-1 flex items-center gap-1 text-[11.5px] text-muted hover:text-text"
      >
        <ChevronDown size={11} className={showArgs ? "" : "-rotate-90"} />
        {t("permission.args")}
      </button>
      {showArgs && (
        <pre className="mt-1 max-h-40 overflow-auto rounded bg-code-bg p-2 font-mono text-[11.5px] text-muted">
          {JSON.stringify(request.args, null, 2)}
        </pre>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <button
          onClick={() => void respond({ id: request.id, behavior: "allow", scope: "once" })}
          className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent-hover"
        >
          {t("permission.allowOnce")} <span className="opacity-60">⏎</span>
        </button>
        <div className="relative">
          <button
            onClick={() => setShowRules(!showRules)}
            className="rounded-md border border-border-strong px-3 py-1.5 text-[12.5px] hover:bg-surface-2"
          >
            {t("permission.allowAlways")} ▾
          </button>
          {showRules && (
            <div className="absolute bottom-full left-0 z-10 mb-1 min-w-56 rounded-md border border-border bg-surface py-1 shadow-lg">
              {request.suggestedRules.map((rule) => (
                <button
                  key={rule}
                  onClick={() =>
                    void respond({ id: request.id, behavior: "allow", scope: "always", rule })
                  }
                  className="block w-full px-3 py-1.5 text-left font-mono text-[12px] hover:bg-accent-soft"
                >
                  {rule}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => void respond({ id: request.id, behavior: "deny", scope: "once" })}
          className="rounded-md border border-border-strong px-3 py-1.5 text-[12.5px] text-danger hover:bg-danger-soft"
        >
          {t("permission.deny")} <span className="opacity-60">Esc</span>
        </button>
      </div>
    </div>
  );
}
