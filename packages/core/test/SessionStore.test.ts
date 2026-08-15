import { describe, expect, it } from "vitest";
import { SessionStore } from "../src/session/SessionStore.js";

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

  it("rebuilds a resumable transcript", () => {
    const s = SessionStore.createEphemeral("C:/proj");
    s.append({ type: "user", id: "u1", text: "make a thing", ts: 1 });
    s.append({ type: "assistant", id: "a1", text: "done", reasoning: "", toolCalls: [], ts: 2 });
    const t = s.transcript();
    expect(t[0]).toMatchObject({ kind: "user", text: "make a thing" });
    expect(t.find((i) => i.kind === "assistant")).toMatchObject({ text: "done" });
  });
});
