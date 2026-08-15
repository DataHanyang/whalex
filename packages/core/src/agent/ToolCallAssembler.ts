import type { ProviderDelta, ProviderUsage } from "../providers/Provider.js";

export interface AssembledToolCall {
  id: string;
  name: string;
  argsJson: string;
}

export interface AssembledTurn {
  text: string;
  reasoning: string;
  toolCalls: AssembledToolCall[];
  finishReason: "stop" | "tool_calls" | "length";
  usage: ProviderUsage | null;
}

/**
 * Accumulates streamed deltas into a complete assistant turn. Tool call
 * fragments arrive keyed by index — id and name first, then argument JSON
 * in pieces — and multiple calls can interleave.
 */
export class ToolCallAssembler {
  private text = "";
  private reasoning = "";
  private calls = new Map<number, { id: string; name: string; args: string }>();
  private finishReason: "stop" | "tool_calls" | "length" = "stop";
  private usage: ProviderUsage | null = null;

  push(delta: ProviderDelta): void {
    switch (delta.type) {
      case "text":
        this.text += delta.text;
        break;
      case "reasoning":
        this.reasoning += delta.text;
        break;
      case "tool_call_delta": {
        let call = this.calls.get(delta.index);
        if (!call) {
          call = { id: "", name: "", args: "" };
          this.calls.set(delta.index, call);
        }
        if (delta.id) call.id = delta.id;
        if (delta.name) call.name += delta.name;
        call.args += delta.argsFragment;
        break;
      }
      case "finish":
        this.finishReason = delta.reason;
        this.usage = delta.usage;
        break;
    }
  }

  result(): AssembledTurn {
    const toolCalls = [...this.calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([i, c]) => ({
        id: c.id || `call_${i}`,
        name: c.name,
        argsJson: c.args,
      }))
      .filter((c) => c.name.length > 0);
    return {
      text: this.text,
      reasoning: this.reasoning,
      toolCalls,
      finishReason: this.finishReason,
      usage: this.usage,
    };
  }
}
