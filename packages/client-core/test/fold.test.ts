import { describe, expect, it } from "vitest";
import type { AgentEvent, IpcResponse } from "@whalex/shared";
import {
  emptyClientState,
  foldEnvelope,
  hydrateSession,
  type ClientSessionState,
  type FoldContext,
  type FoldSignal,
} from "../src/index.js";

const ctx: FoldContext = {
  now: () => 1_000_000,
  formatGoal: (ev) => `goal ${ev.iteration}/${ev.maxIterations}${ev.done ? " done" : ""}`,
};

/** Fold a sequence, collecting signals. */
function run(
  events: AgentEvent[],
  initial: ClientSessionState = emptyClientState(),
): { state: ClientSessionState; signals: FoldSignal[] } {
  let state = initial;
  const signals: FoldSignal[] = [];
  for (const ev of events) {
    const out = foldEnvelope(state, ev, ctx);
    state = out.state;
    signals.push(...out.signals);
  }
  return { state, signals };
}

describe("foldEnvelope", () => {
  it("streams an assistant message and closes it on done", () => {
    const { state, signals } = run([
      { type: "message-start", messageId: "m1" },
      { type: "text-delta", messageId: "m1", delta: "Hel" },
      { type: "text-delta", messageId: "m1", delta: "lo" },
      { type: "reasoning-delta", messageId: "m1", delta: "hmm" },
      { type: "done", stopReason: "stop" },
    ]);
    expect(state.transcript).toHaveLength(1);
    expect(state.transcript[0]).toMatchObject({
      kind: "assistant",
      text: "Hello",
      reasoning: "hmm",
      streaming: false,
      interrupted: false,
    });
    expect(state.status).toBe("idle");
    expect(signals).toContainEqual({ type: "turn-finished" });
  });

  it("marks the streaming bubble interrupted on abort", () => {
    const { state } = run([
      { type: "message-start", messageId: "m1" },
      { type: "text-delta", messageId: "m1", delta: "partial" },
      { type: "done", stopReason: "aborted" },
    ]);
    expect(state.transcript[0]).toMatchObject({ streaming: false, interrupted: true });
  });

  it("tracks a tool call through start, file-edit, and result", () => {
    const { state } = run([
      { type: "tool-start", toolCallId: "t1", toolName: "write_file", args: { path: "a.ts" } },
      { type: "file-edit", toolCallId: "t1", path: "a.ts", oldText: "x", newText: "y" },
      { type: "tool-result", toolCallId: "t1", ok: true, output: "done", durationMs: 42 },
    ]);
    expect(state.transcript[0]).toMatchObject({
      kind: "tool",
      state: "ok",
      output: "done",
      durationMs: 42,
      diff: { path: "a.ts", oldText: "x", newText: "y" },
    });
  });

  it("queues permission requests without replacing, and clears on resolve/done", () => {
    const req = (id: string) =>
      ({
        type: "permission-request",
        request: {
          id,
          sessionId: "s",
          toolCallId: "t",
          toolName: "bash",
          kind: "execute",
          summary: "run",
          args: {},
          suggestedRules: [],
        },
      }) as AgentEvent;
    let { state } = run([req("p1"), req("p2"), req("p1")]);
    expect(state.pendingPermissions.map((p) => p.id)).toEqual(["p1", "p2"]);
    ({ state } = run([{ type: "permission-resolved", requestId: "p1" }], state));
    expect(state.pendingPermissions.map((p) => p.id)).toEqual(["p2"]);
    ({ state } = run([{ type: "done", stopReason: "stop" }], state));
    expect(state.pendingPermissions).toEqual([]);
    expect(state.pendingQuestion).toBeNull();
  });

  it("artifact events set planPending for plans and emit artifact-added", () => {
    const { state, signals } = run([
      {
        type: "artifact",
        artifactId: "a1",
        title: "Plan",
        kind: "plan",
        content: "…",
      } as AgentEvent,
    ]);
    expect(state.planPending).toBe(true);
    expect(state.artifacts).toHaveLength(1);
    expect(state.transcript[0]).toMatchObject({ kind: "artifact", artifactKind: "plan" });
    expect(signals).toContainEqual({ type: "artifact-added", artifactId: "a1" });
  });

  it("supercode and browser events surface as signals, not state mutations", () => {
    const { state, signals } = run([
      { type: "supercode", on: true },
      {
        type: "browser-navigated",
        url: "https://x.test",
        title: "X",
      } as AgentEvent,
    ]);
    expect(state.superCode).toBe(true);
    expect(signals).toContainEqual({ type: "supercode", on: true });
    expect(signals).toContainEqual({
      type: "browser-navigated",
      tabs: [{ id: "tab1", url: "https://x.test", title: "X" }],
      activeTabId: "tab1",
    });
  });

  it("steer-delivered flips pending user messages to read", () => {
    const initial: ClientSessionState = {
      ...emptyClientState(),
      transcript: [
        { kind: "user", id: "u1", text: "hi", ts: 1, delivery: "pending" },
        { kind: "user", id: "u2", text: "yo", ts: 2, delivery: "pending" },
      ],
    };
    const { state } = run([{ type: "steer-delivered", messageIds: ["u1"] }], initial);
    expect(state.transcript[0]).toMatchObject({ delivery: "read" });
    expect(state.transcript[1]).toMatchObject({ delivery: "pending" });
  });

  it("errors land in both lastError and the transcript; goal updates use the formatter", () => {
    const { state } = run([
      { type: "error", code: "provider", message: "boom" },
      { type: "goal-update", iteration: 2, maxIterations: 5, done: false, remaining: "more" },
    ]);
    expect(state.lastError).toEqual({ code: "provider", message: "boom" });
    expect(state.transcript.map((t) => t.kind)).toEqual(["error", "error"]);
    expect(state.transcript[1]).toMatchObject({ message: "goal 2/5" });
  });

  it("measures turn duration from turnStartedAt", () => {
    const initial = { ...emptyClientState(), turnStartedAt: 999_000 };
    const { state } = run([{ type: "done", stopReason: "stop" }], initial);
    expect(state.lastTurnMs).toBe(1_000);
    expect(state.turnStartedAt).toBeNull();
  });
});

describe("hydrateSession", () => {
  const base: IpcResponse<"session:start"> = {
    sessionId: "s1",
    cwd: "C:/p",
    transcript: [],
  };

  it("re-hangs the streaming bubble and pending steers after the transcript", () => {
    const state = hydrateSession(
      {
        ...base,
        running: true,
        transcript: [{ kind: "user", id: "u1", text: "go", ts: 1 }],
        live: {
          status: "streaming",
          streaming: { messageId: "m9", text: "half", reasoning: "r" },
          workflows: [],
          todos: null,
          usage: null,
          permissionRequests: [],
          questionRequest: null,
          pendingSteer: [{ id: "u2", text: "and this", ts: 5 }],
        },
      },
      ctx,
    );
    expect(state.transcript.map((t) => t.id)).toEqual(["u1", "m9", "u2"]);
    expect(state.transcript[1]).toMatchObject({ text: "half", streaming: true });
    expect(state.transcript[2]).toMatchObject({ delivery: "pending" });
    expect(state.status).toBe("streaming");
  });

  it("re-derives planPending: pending until a later user message answers it", () => {
    const plan = {
      kind: "artifact" as const,
      id: "a1",
      artifactId: "a1",
      title: "Plan",
      artifactKind: "plan",
      ts: 1,
    };
    const user = { kind: "user" as const, id: "u1", text: "accepted", ts: 2 };
    expect(hydrateSession({ ...base, transcript: [plan] }, ctx).planPending).toBe(true);
    expect(hydrateSession({ ...base, transcript: [plan, user] }, ctx).planPending).toBe(false);
  });

  it("restores todos from the transcript and prefers live workflows over persisted", () => {
    const wfOld = { workflowId: "w1", name: "wf", phase: "running", agents: [] };
    const wfLive = { ...wfOld, phase: "done" };
    const state = hydrateSession(
      {
        ...base,
        transcript: [
          { kind: "todos", id: "td", todos: [{ text: "a", done: false }], ts: 1 },
          { kind: "workflow", id: "w1", workflowId: "w1", name: "wf", state: wfOld, ts: 2 },
        ] as never,
        live: {
          status: null,
          streaming: null,
          workflows: [wfLive] as never,
          todos: null,
          usage: null,
          permissionRequests: [],
          questionRequest: null,
          pendingSteer: [],
        },
      },
      ctx,
    );
    expect(state.todos).toEqual([{ text: "a", done: false }]);
    expect(state.workflows.w1).toMatchObject({ phase: "done" });
  });

  it("falls back to thinking/idle from running when there is no live snapshot", () => {
    expect(hydrateSession({ ...base, running: true }, ctx).status).toBe("thinking");
    expect(hydrateSession({ ...base, running: false }, ctx).status).toBe("idle");
  });
});
