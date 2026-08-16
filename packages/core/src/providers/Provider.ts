import type { ModelInfo } from "@whalex/shared";

export type ToolCallPart = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCallPart[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolSpec = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  temperature?: number;
  maxTokens?: number;
  /** "none" | "low" | "medium" | "high" — omitted when the model has no thinking mode. */
  reasoningEffort?: string;
  signal: AbortSignal;
}

export type ProviderUsage = {
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens: number;
};

export type ProviderDelta =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool_call_delta";
      index: number;
      id?: string;
      name?: string;
      argsFragment: string;
    }
  | {
      type: "finish";
      reason: "stop" | "tool_calls" | "length";
      usage: ProviderUsage | null;
    };

export interface ProviderClient {
  streamChat(req: ChatRequest): AsyncIterable<ProviderDelta>;
  listModels(): Promise<ModelInfo[]>;
}

/**
 * Resolves a secret reference (e.g. "deepseek-api-key") to the actual key.
 * Electron main backs this with safeStorage; the CLI backs it with env vars.
 * Core never sees where keys live.
 */
export type SecretResolver = (ref: string) => Promise<string | null>;

/** Classified provider/agent failure, mapped to AgentErrorCode by the loop. */
export class ProviderError extends Error {
  constructor(
    readonly code:
      | "rate_limit"
      | "invalid_key"
      | "insufficient_balance"
      | "network"
      | "aborted"
      | "context_overflow"
      | "unknown",
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
