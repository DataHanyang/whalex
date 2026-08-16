import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bot, Check, ChevronDown, ChevronRight, Loader2, Sparkles, X } from "lucide-react";
import { useSessionStore } from "../stores/sessionStore";

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
          {phases.map((phase, pi) => (
            <div key={phase || "_"} className="mb-3 last:mb-1">
              {phase && (
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent-soft text-[9px] font-bold text-accent">
                    {pi + 1}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">{phase}</span>
                  <span className="h-px flex-1 bg-accent/20" />
                </div>
              )}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5">
                {(byPhase.get(phase) ?? []).map((a) => (
                  <div
                    key={a.id}
                    className={`rounded-lg border bg-surface px-2.5 py-2 ${
                      a.state === "running"
                        ? "agent-running"
                        : a.state === "done"
                          ? "border-ok/40"
                          : a.state === "error"
                            ? "border-danger/50"
                            : "border-border opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          a.state === "running"
                            ? "bg-accent-soft text-accent"
                            : a.state === "done"
                              ? "bg-ok/15 text-ok"
                              : a.state === "error"
                                ? "bg-danger/15 text-danger"
                                : "bg-surface-2 text-faint"
                        }`}
                      >
                        {a.state === "running" ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : a.state === "done" ? (
                          <Check size={11} />
                        ) : a.state === "error" ? (
                          <X size={11} />
                        ) : (
                          <Bot size={11} />
                        )}
                      </span>
                      <span className="truncate text-[11.5px] font-medium">{a.label}</span>
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] tabular-nums text-faint">
                      <span>{a.tokens > 0 ? `${a.tokens.toLocaleString()} tok` : " "}</span>
                      <span>{a.durationMs > 0 ? `${(a.durationMs / 1000).toFixed(0)}s` : ""}</span>
                    </div>
                  </div>
                ))}
              </div>
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
