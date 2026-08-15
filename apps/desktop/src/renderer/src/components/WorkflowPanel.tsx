import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { useSessionStore } from "../stores/sessionStore";

const STATE_DOT: Record<string, string> = {
  pending: "bg-faint",
  running: "bg-accent",
  done: "bg-ok",
  error: "bg-danger",
};

/** Live SuperCode progress tree: phases → agents, with token/cost counters. */
export function WorkflowPanel({ workflowId }: { workflowId: string }) {
  const { t } = useTranslation();
  const workflow = useSessionStore((s) => s.workflow);
  const [open, setOpen] = useState(true);
  if (!workflow || workflow.workflowId !== workflowId) return null;

  const byPhase = new Map<string, typeof workflow.agents>();
  for (const a of workflow.agents) {
    const list = byPhase.get(a.phase) ?? [];
    list.push(a);
    byPhase.set(a.phase, list);
  }
  const phases = workflow.phases.length ? workflow.phases : [...byPhase.keys()];
  const running = workflow.agents.filter((a) => a.state === "running").length;
  const done = workflow.agents.filter((a) => a.state === "done").length;

  return (
    <div className="my-2 rounded-lg border border-accent/40 bg-accent-soft/40 text-[13px]">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Sparkles size={14} className="text-accent" />
        <span className="font-medium">SuperCode: {workflow.name}</span>
        <span className="text-[11.5px] text-muted">
          {t("workflow.done", { done, total: workflow.agents.length })}
          {running > 0 && t("workflow.running", { count: running })}
        </span>
        <div className="flex-1" />
        {(workflow.state === "running" || workflow.state === "planning") && (
          <Loader2 size={13} className="animate-spin text-accent" />
        )}
        <span className="text-[11px] text-faint">
          {workflow.totalTokens.toLocaleString()} tok
          {workflow.costUsd > 0 && ` · $${workflow.costUsd.toFixed(4)}`}
        </span>
      </button>
      {open && (
        <div className="border-t border-accent/30 px-3 py-2">
          {phases.map((phase) => (
            <div key={phase || "_"} className="mb-2 last:mb-0">
              {phase && <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{phase}</div>}
              {(byPhase.get(phase) ?? []).map((a) => (
                <div key={a.id} className="flex items-center gap-2 py-0.5">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATE_DOT[a.state]}`} />
                  <span className="truncate text-[12px]">{a.label}</span>
                  <div className="flex-1" />
                  {a.tokens > 0 && <span className="text-[10.5px] text-faint">{a.tokens} tok</span>}
                  {a.durationMs > 0 && (
                    <span className="text-[10.5px] text-faint">{(a.durationMs / 1000).toFixed(0)}s</span>
                  )}
                </div>
              ))}
            </div>
          ))}
          {workflow.log.length > 0 && (
            <div className="mt-2 border-t border-accent/30 pt-1.5 text-[11px] text-muted">
              {workflow.log.slice(-3).map((l, i) => (
                <div key={i} className="truncate">
                  {l}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
