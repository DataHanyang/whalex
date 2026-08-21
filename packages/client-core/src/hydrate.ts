import type { IpcResponse, Todo, TranscriptItem, WorkflowState } from "@whalex/shared";
import type { ClientSessionState } from "./types.js";

/**
 * Everything a session:start response determines about the shared client
 * state. Turn timing (turnStartedAt/lastTurnMs) is deliberately absent —
 * switching sessions has never reset it, and a reattach can't know when the
 * running turn started.
 */
export type HydratedState = Omit<ClientSessionState, "turnStartedAt" | "lastTurnMs">;

/**
 * Build the initial client state from a session:start response — the shared
 * reattach path. The live snapshot outranks the persisted transcript: the
 * streaming bubble and still-unread steered messages aren't on disk yet, and
 * an in-flight workflow has fresher state in the snapshot.
 */
export function hydrateSession(
  res: IpcResponse<"session:start">,
  ctx: { now(): number },
): HydratedState {
  // Re-derive planPending from the resumed transcript: a plan artifact with
  // no later user message is still awaiting the user's decision.
  const lastPlanIdx = res.transcript.reduce(
    (acc, t, i) => (t.kind === "artifact" && t.artifactKind === "plan" ? i : acc),
    -1,
  );
  const laterUserMsg =
    lastPlanIdx >= 0 && res.transcript.slice(lastPlanIdx + 1).some((t) => t.kind === "user");

  // Workflow panels: the persisted trees first, then the live ones on top.
  const workflows: Record<string, WorkflowState> = {};
  for (const item of res.transcript) {
    if (item.kind === "workflow" && item.state) workflows[item.workflowId] = item.state;
  }
  for (const wf of res.live?.workflows ?? []) workflows[wf.workflowId] = wf;

  // Todos are written to the session file as they change, so the pill comes
  // back from the last record even for a session reloaded from disk.
  const lastTodos = res.transcript.reduce<Todo[]>(
    (acc, t) => (t.kind === "todos" ? t.todos : acc),
    [],
  );

  // Still-unread messages are not on disk yet; re-hang them after the
  // persisted transcript, in the order they were typed.
  const pending: TranscriptItem[] = (res.live?.pendingSteer ?? []).map((p) => ({
    kind: "user" as const,
    id: p.id,
    text: p.text,
    ts: p.ts,
    delivery: "pending" as const,
  }));
  // The bubble still streaming in main isn't in the transcript yet; re-hang
  // it under the same id so later deltas continue it.
  const transcript = res.live?.streaming
    ? [
        ...res.transcript,
        {
          kind: "assistant" as const,
          id: res.live.streaming.messageId,
          text: res.live.streaming.text,
          reasoning: res.live.streaming.reasoning,
          streaming: true,
          interrupted: false,
          ts: ctx.now(),
        },
        ...pending,
      ]
    : [...res.transcript, ...pending];

  return {
    transcript,
    status: res.live?.status ?? (res.running ? "thinking" : "idle"),
    usage: res.live?.usage ?? null,
    todos: res.live?.todos ?? lastTodos,
    pendingPermissions: res.live?.permissionRequests ?? [],
    pendingQuestion: res.live?.questionRequest ?? null,
    planPending: lastPlanIdx >= 0 && !laterUserMsg,
    lastError: null,
    artifacts: [],
    subagents: {},
    workflows,
    superCode: res.superCode ?? false,
  };
}
