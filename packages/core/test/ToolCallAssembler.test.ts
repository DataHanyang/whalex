import { describe, expect, it } from "vitest";
import { ToolCallAssembler } from "../src/agent/ToolCallAssembler.js";

describe("ToolCallAssembler", () => {
  it("accumulates streamed text and finish", () => {
    const a = new ToolCallAssembler();
    a.push({ type: "text", text: "Hel" });
    a.push({ type: "text", text: "lo" });
    a.push({ type: "finish", reason: "stop", usage: null });
    const r = a.result();
    expect(r.text).toBe("Hello");
    expect(r.toolCalls).toHaveLength(0);
    expect(r.finishReason).toBe("stop");
  });

  it("assembles a tool call from fragments keyed by index", () => {
    const a = new ToolCallAssembler();
    a.push({ type: "tool_call_delta", index: 0, id: "call_1", name: "read", argsFragment: '{"pa' });
    a.push({ type: "tool_call_delta", index: 0, argsFragment: 'th":"a.ts"}' });
    a.push({ type: "finish", reason: "tool_calls", usage: null });
    const r = a.result();
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0]).toMatchObject({ id: "call_1", name: "read", argsJson: '{"path":"a.ts"}' });
  });

  it("assembles multiple interleaved tool calls in index order", () => {
    const a = new ToolCallAssembler();
    a.push({ type: "tool_call_delta", index: 1, id: "b", name: "glob", argsFragment: "{}" });
    a.push({ type: "tool_call_delta", index: 0, id: "a", name: "grep", argsFragment: "{}" });
    const r = a.result();
    expect(r.toolCalls.map((c) => c.name)).toEqual(["grep", "glob"]);
  });

  it("captures reasoning separately and never mixes it into text", () => {
    const a = new ToolCallAssembler();
    a.push({ type: "reasoning", text: "thinking..." });
    a.push({ type: "text", text: "answer" });
    const r = a.result();
    expect(r.reasoning).toBe("thinking...");
    expect(r.text).toBe("answer");
  });

  it("drops tool calls that never received a name", () => {
    const a = new ToolCallAssembler();
    a.push({ type: "tool_call_delta", index: 0, argsFragment: "{}" });
    expect(a.result().toolCalls).toHaveLength(0);
  });
});
