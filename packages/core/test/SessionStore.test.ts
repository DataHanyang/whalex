import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "../src/session/SessionStore.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "whalex-store-"));

describe("SessionStore", () => {
  it("builds OpenAI-format messages and drops reasoning", () => {
    const s = SessionStore.createEphemeral("C:/proj");
    s.append({ type: "user", id: "u1", text: "hi", ts: 1 });
    s.append({
      type: "assistant",
      id: "a1",
      text: "hello",
      reasoning: "secret reasoning",
      toolCalls: [{ id: "c1", name: "read", argsJson: '{"path":"a"}' }],
      ts: 2,
    });
    s.append({
      type: "tool_result",
      toolCallId: "c1",
      toolName: "read",
      args: {},
      ok: true,
      output: "contents",
      durationMs: 3,
      ts: 3,
    });
    const msgs = s.messages();
    expect(msgs[0]).toEqual({ role: "user", content: "hi" });
    expect(msgs[1].role).toBe("assistant");
    // reasoning must not leak into the wire format (DeepSeek 400s on it).
    expect(JSON.stringify(msgs)).not.toContain("secret reasoning");
    expect(msgs[1]).toMatchObject({ content: "hello" });
    expect(msgs[2]).toEqual({ role: "tool", tool_call_id: "c1", content: "contents" });
  });

  it("replaces pre-compaction history with the summary", () => {
    const s = SessionStore.createEphemeral("C:/proj");
    s.append({ type: "user", id: "u1", text: "old message", ts: 1 });
    s.append({ type: "assistant", id: "a1", text: "old reply", reasoning: "", toolCalls: [], ts: 2 });
    s.appendCompaction("SUMMARY: user asked X, did Y", 80, 20);
    s.append({ type: "user", id: "u2", text: "new message", ts: 4 });
    const msgs = s.messages();
    const joined = JSON.stringify(msgs);
    expect(joined).toContain("SUMMARY: user asked X");
    expect(joined).toContain("new message");
    expect(joined).not.toContain("old message");
  });

  it("persists and restores cumulative usage totals", () => {
    const s = SessionStore.createEphemeral("C:/proj");
    expect(s.lastUsageTotals()).toBeNull();
    s.recordUsageTotals({ inputTokens: 1000, outputTokens: 200, cachedInputTokens: 50 });
    s.recordUsageTotals({ inputTokens: 3000, outputTokens: 600, cachedInputTokens: 120 });
    // The most recent totals win on resume.
    expect(s.lastUsageTotals()).toEqual({
      inputTokens: 3000,
      outputTokens: 600,
      cachedInputTokens: 120,
    });
  });

  it("keeps usage records out of the wire message list", () => {
    const s = SessionStore.createEphemeral("C:/proj");
    s.append({ type: "user", id: "u1", text: "hi", ts: 1 });
    s.recordUsageTotals({ inputTokens: 10, outputTokens: 2, cachedInputTokens: 0 });
    // A usage record carries no tool_call_id and must not become a message.
    expect(s.messages()).toEqual([{ role: "user", content: "hi" }]);
  });

  it("rebuilds a resumable transcript", () => {
    const s = SessionStore.createEphemeral("C:/proj");
    s.append({ type: "user", id: "u1", text: "make a thing", ts: 1 });
    s.append({ type: "assistant", id: "a1", text: "done", reasoning: "", toolCalls: [], ts: 2 });
    const t = s.transcript();
    expect(t[0]).toMatchObject({ kind: "user", text: "make a thing" });
    expect(t.find((i) => i.kind === "assistant")).toMatchObject({ text: "done" });
  });

  it("folds a workflow's start and final-tree records into one item", () => {
    const s = SessionStore.createEphemeral("C:/proj");
    s.append({ type: "user", id: "u1", text: "supercode this", ts: 1 });
    s.append({ type: "workflow", workflowId: "w1", name: "review", ts: 2 });
    s.append({ type: "assistant", id: "a1", text: "working", reasoning: "", toolCalls: [], ts: 3 });
    s.append({
      type: "workflow",
      workflowId: "w1",
      name: "review",
      state: {
        workflowId: "w1",
        name: "review",
        state: "done",
        phases: ["Find"],
        agents: [{ id: "g1", label: "find:bugs", phase: "Find", state: "done", tokens: 10, durationMs: 5 }],
        totalTokens: 10,
        costUsd: 0,
        log: [],
      },
      ts: 4,
    });
    const workflows = s.transcript().filter((i) => i.kind === "workflow");
    // One panel, carrying the tree — not a second empty one at the end.
    expect(workflows).toHaveLength(1);
    expect(workflows[0]).toMatchObject({ workflowId: "w1", ts: 2 });
    expect(workflows[0]).toHaveProperty("state.state", "done");
    // It stays where the run actually started, before the assistant reply.
    const kinds = s.transcript().map((i) => i.kind);
    expect(kinds).toEqual(["user", "workflow", "assistant"]);
  });

  it("restores a workflow tree from disk on resume", async () => {
    const s = SessionStore.create(tmp);
    s.append({ type: "workflow", workflowId: "w1", name: "audit", ts: 1 });
    s.append({
      type: "workflow",
      workflowId: "w1",
      name: "audit",
      state: {
        workflowId: "w1",
        name: "audit",
        state: "done",
        phases: ["Find", "Verify"],
        agents: [{ id: "g1", label: "find", phase: "Find", state: "done", tokens: 7, durationMs: 2 }],
        totalTokens: 7,
        costUsd: 0.01,
        log: ["2 found"],
      },
      ts: 2,
    });
    const reloaded = await SessionStore.load(tmp, s.sessionId);
    const item = reloaded?.transcript().find((i) => i.kind === "workflow");
    // The whole tree survives the JSONL round-trip, not just the id and name.
    expect(item).toMatchObject({
      workflowId: "w1",
      state: { state: "done", phases: ["Find", "Verify"], totalTokens: 7, costUsd: 0.01 },
    });
    await SessionStore.delete(tmp, s.sessionId);
  });
});
