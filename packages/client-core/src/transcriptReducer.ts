import type { AgentEvent, TranscriptItem } from "@whalex/shared";
import type { ClientSessionState, FoldContext, FoldSignal } from "./types.js";

export function emptyClientState(): ClientSessionState {
  return {
    transcript: [],
    status: "idle",
    usage: null,
    todos: [],
    pendingPermissions: [],
    pendingQuestion: null,
    planPending: false,
    lastError: null,
    artifacts: [],
    subagents: {},
    workflows: {},
    turnStartedAt: null,
    lastTurnMs: null,
    superCode: false,
  };
}

/**
 * Fold one already-routed agent event into the shared client state. Pure:
 * the caller has decided the event belongs to the active session; anything
 * UI-specific comes back as a signal for the host store to act on.
 */
export function foldEnvelope(
  s: ClientSessionState,
  ev: AgentEvent,
  ctx: FoldContext,
): { state: ClientSessionState; signals: FoldSignal[] } {
  const signals: FoldSignal[] = [];
  let state = s;

  switch (ev.type) {
    case "message-start":
      state = {
        ...s,
        transcript: [
          ...s.transcript,
          {
            kind: "assistant",
            id: ev.messageId,
            text: "",
            reasoning: "",
            streaming: true,
            interrupted: false,
            ts: ctx.now(),
          },
        ],
      };
      break;
    case "text-delta":
    case "reasoning-delta": {
      const transcript = [...s.transcript];
      for (let i = transcript.length - 1; i >= 0; i--) {
        const item = transcript[i];
        if (item && item.kind === "assistant" && item.id === ev.messageId) {
          transcript[i] =
            ev.type === "text-delta"
              ? { ...item, text: item.text + ev.delta }
              : { ...item, reasoning: item.reasoning + ev.delta };
          break;
        }
      }
      state = { ...s, transcript };
      break;
    }
    case "tool-start":
      state = {
        ...s,
        transcript: [
          ...s.transcript,
          {
            kind: "tool",
            id: ev.toolCallId,
            toolName: ev.toolName,
            args: ev.args,
            state: "running",
            output: "",
            durationMs: 0,
            ts: ctx.now(),
          },
        ],
      };
      break;
    case "tool-result":
      state = {
        ...s,
        transcript: s.transcript.map((item) =>
          item.kind === "tool" && item.id === ev.toolCallId
            ? {
                ...item,
                state: ev.ok ? "ok" : item.state === "running" ? "error" : item.state,
                output: ev.output,
                durationMs: ev.durationMs,
              }
            : item,
        ),
      };
      break;
    case "file-edit":
      state = {
        ...s,
        transcript: s.transcript.map((item) =>
          item.kind === "tool" && item.id === ev.toolCallId
            ? { ...item, diff: { path: ev.path, oldText: ev.oldText, newText: ev.newText } }
            : item,
        ),
      };
      break;
    case "todo-update":
      state = { ...s, todos: ev.todos };
      break;
    case "artifact":
      state = {
        ...s,
        planPending: ev.kind === "plan" ? true : s.planPending,
        artifacts: [
          ...s.artifacts.filter((a) => a.artifactId !== ev.artifactId),
          {
            artifactId: ev.artifactId,
            title: ev.title,
            kind: ev.kind,
            path: ev.path,
            url: ev.url,
            content: ev.content,
            language: ev.language,
          },
        ],
        transcript: [
          ...s.transcript,
          {
            kind: "artifact",
            id: ev.artifactId,
            artifactId: ev.artifactId,
            title: ev.title,
            artifactKind: ev.kind,
            ts: ctx.now(),
          },
        ],
      };
      signals.push({ type: "artifact-added", artifactId: ev.artifactId });
      break;
    case "subagent-start":
      state = {
        ...s,
        subagents: {
          ...s.subagents,
          [ev.agentRunId]: {
            agentType: ev.agentType,
            label: ev.label,
            state: "running",
            toolCount: 0,
            tokens: 0,
            lastActivity: "",
          },
        },
      };
      break;
    case "subagent-update": {
      const prev = s.subagents[ev.agentRunId] ?? {
        agentType: "general",
        label: "",
        state: "running",
        toolCount: 0,
        tokens: 0,
        lastActivity: "",
      };
      state = {
        ...s,
        subagents: {
          ...s.subagents,
          [ev.agentRunId]: {
            ...prev,
            state: ev.state,
            toolCount: ev.toolCount,
            tokens: ev.tokens,
            lastActivity: ev.lastActivity,
          },
        },
      };
      break;
    }
    case "workflow-update":
      state = {
        ...s,
        workflows: { ...s.workflows, [ev.workflow.workflowId]: ev.workflow },
        transcript: s.transcript.some(
          (t) => t.kind === "workflow" && t.workflowId === ev.workflow.workflowId,
        )
          ? s.transcript
          : [
              ...s.transcript,
              {
                kind: "workflow",
                id: ev.workflow.workflowId,
                workflowId: ev.workflow.workflowId,
                name: ev.workflow.name,
                ts: ctx.now(),
              },
            ],
      };
      break;
    case "compaction":
      state = {
        ...s,
        transcript: [
          ...s.transcript,
          {
            kind: "compaction",
            id: `compaction-${ctx.now()}`,
            beforePct: ev.beforePct,
            afterPct: ev.afterPct,
            ts: ctx.now(),
          },
        ],
      };
      break;
    case "supercode":
      state = { ...s, superCode: ev.on };
      signals.push({ type: "supercode", on: ev.on });
      break;

    case "control-changed":
      // Pure signal: mode/model/goal live in the host stores, not here.
      signals.push({
        type: "control",
        ...(ev.mode !== undefined ? { mode: ev.mode } : {}),
        ...(ev.model !== undefined ? { model: ev.model } : {}),
        ...(ev.goalMode !== undefined ? { goalMode: ev.goalMode } : {}),
      });
      break;

    case "browser-navigated": {
      const tabs = ev.tabs ?? (ev.url ? [{ id: "tab1", url: ev.url, title: ev.title }] : []);
      const activeTabId = ev.activeTabId ?? tabs.at(-1)?.id ?? null;
      signals.push({ type: "browser-navigated", tabs, activeTabId });
      break;
    }
    case "goal-update":
      state = {
        ...s,
        transcript: [
          ...s.transcript,
          {
            kind: "error",
            id: `goal-${ctx.now()}`,
            code: ev.done ? "goal-done" : "goal-continue",
            message: ctx.formatGoal(ev),
            ts: ctx.now(),
          },
        ],
      };
      break;
    case "permission-request":
      // Queue, never replace: an overwritten request is an agent that waits
      // for an answer no one can give.
      state = {
        ...s,
        pendingPermissions: s.pendingPermissions.some((p) => p.id === ev.request.id)
          ? s.pendingPermissions
          : [...s.pendingPermissions, ev.request],
      };
      break;
    case "question-request":
      state = { ...s, pendingQuestion: ev.request };
      break;
    case "permission-resolved":
      state = {
        ...s,
        pendingPermissions: s.pendingPermissions.filter((p) => p.id !== ev.requestId),
      };
      break;
    case "usage":
      state = { ...s, usage: ev.usage };
      break;
    case "steer-delivered": {
      const ids = new Set(ev.messageIds);
      state = {
        ...s,
        transcript: s.transcript.map((t) =>
          t.kind === "user" && ids.has(t.id) ? { ...t, delivery: "read" as const } : t,
        ),
      };
      break;
    }
    case "status":
      state = { ...s, status: ev.state };
      break;
    case "error":
      state = {
        ...s,
        lastError: { code: ev.code, message: ev.message },
        transcript: [
          ...s.transcript,
          {
            kind: "error",
            id: `err-${ctx.now()}`,
            code: ev.code,
            message: ev.message,
            ts: ctx.now(),
          },
        ],
      };
      break;
    case "done":
      state = {
        ...s,
        status: "idle",
        pendingPermissions: [],
        // An open question card is moot once the turn ends (abort/error) —
        // main clears its copy on done too; leaving ours up strands the card.
        pendingQuestion: null,
        turnStartedAt: null,
        lastTurnMs: s.turnStartedAt ? ctx.now() - s.turnStartedAt : s.lastTurnMs,
        transcript: s.transcript.map((item): TranscriptItem =>
          item.kind === "assistant" && item.streaming
            ? { ...item, streaming: false, interrupted: ev.stopReason === "aborted" }
            : item,
        ),
      };
      signals.push({ type: "turn-finished" });
      break;
    default:
      break;
  }

  return { state, signals };
}
