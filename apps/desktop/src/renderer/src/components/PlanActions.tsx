import { useTranslation } from "react-i18next";
import { CheckCircle2, ClipboardList, PencilLine, XCircle } from "lucide-react";
import { useSessionStore } from "../stores/sessionStore";
import { useUiStore } from "../stores/uiStore";

/**
 * The decision bar for a presented plan. It sits where the interview card
 * does — right above the composer — while the plan itself stays readable in
 * the side panel. Revise hands the cursor straight to the composer so the
 * user can say what to change.
 */
export function PlanActions() {
  const { t } = useTranslation();
  const send = useSessionStore((s) => s.send);
  const superCode = useSessionStore((s) => s.superCode);
  const setPermissionMode = useSessionStore((s) => s.setPermissionMode);
  const closeArtifact = useSessionStore((s) => s.closeArtifact);
  const clear = useSessionStore((s) => s.clearPlanPending);
  const setComposerDraft = useUiStore((s) => s.setComposerDraft);

  return (
    <div className="my-2 rounded-xl border border-accent/40 bg-accent-soft/40 p-3">
      <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-accent">
        <ClipboardList size={14} />
        {t("plan.ready")}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            clear();
            // SuperCode forces plan mode only for the planning stage; once the
            // plan is accepted the run continues in Auto so the fleet moves at
            // full speed (destructive commands still hard-stop for approval).
            setPermissionMode(superCode ? "bypassPermissions" : "default");
            void send("I accept the plan. Exit plan mode and implement it now.");
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-white hover:opacity-90"
        >
          <CheckCircle2 size={14} />
          {t("plan.accept")}
        </button>
        <button
          onClick={() => {
            clear();
            setComposerDraft(t("plan.revisePrefix"));
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-muted hover:bg-surface-2"
        >
          <PencilLine size={14} />
          {t("plan.revise")}
        </button>
        <button
          onClick={() => {
            clear();
            closeArtifact();
            void send("The plan is rejected. Do not proceed with it.");
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-danger/40 bg-surface px-3 py-2 text-[13px] text-danger hover:bg-danger/10"
        >
          <XCircle size={14} />
          {t("plan.reject")}
        </button>
      </div>
    </div>
  );
}
