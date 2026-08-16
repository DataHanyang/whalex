import { Redactor } from "../privacy/Redactor.js";
import OpenAI, { APIError } from "openai";
import { resolveModelInfo, type ModelInfo } from "@whalex/shared";
import {
  ProviderError,
  type ChatRequest,
  type ProviderClient,
  type ProviderDelta,
} from "./Provider.js";

export interface OpenAICompatOptions {
  baseUrl: string;
  apiKey: string | null;
  defaultHeaders?: Record<string, string>;
}

/**
 * Single provider implementation for every OpenAI-compatible endpoint we
 * target: DeepSeek (BYOK), custom endpoints (Ollama/OpenRouter), and later
 * the hosted Whalex Cloud proxy. Only the base URL and auth differ.
 */
export class OpenAICompatProvider implements ProviderClient {
  /**
   * Masks secret-shaped strings (keys, tokens, private keys) in every
   * outbound message. On by default; Settings → General can turn it off.
   * Session-stable placeholders keep the conversation coherent.
   */
  redactSecrets = true;
  private redactor = new Redactor();

  private client: OpenAI;

  constructor(opts: OpenAICompatOptions) {
    this.client = new OpenAI({
      baseURL: opts.baseUrl,
      // The SDK requires a string; keyless endpoints (Ollama) accept anything.
      apiKey: opts.apiKey ?? "sk-no-key",
      defaultHeaders: opts.defaultHeaders,
      maxRetries: 2,
    });
  }

  async *streamChat(req: ChatRequest): AsyncIterable<ProviderDelta> {
    // Retry the initial request on transient rate limits before streaming
    // begins. Once bytes are flowing a mid-stream failure is surfaced as-is.
    let stream;
    const maxAttempts = 3;
    for (let attempt = 1; ; attempt++) {
      try {
        stream = await this.client.chat.completions.create(
          {
            model: req.model,
            messages: (this.redactSecrets
              ? this.redactor.redactMessages(req.messages)
              : req.messages) as never,
            tools: req.tools && req.tools.length > 0 ? (req.tools as never) : undefined,
            temperature: req.temperature,
            max_tokens: req.maxTokens,
            stream: true,
            stream_options: { include_usage: true },
            // Only sent when the caller asked for it: providers that don't know
            // the field reject the whole request rather than ignoring it. Not
            // in the SDK's type for every model, so it goes in as an extra.
            ...((req.reasoningEffort
              ? { reasoning_effort: req.reasoningEffort }
              : {}) as Record<string, unknown>),
          },
          { signal: req.signal },
        );
        break;
      } catch (err) {
        const pe = classifyError(err);
        if (pe.code === "rate_limit" && attempt < maxAttempts && !req.signal.aborted) {
          const delay = pe.retryAfterMs ?? Math.min(8000, 500 * 2 ** attempt);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw pe;
      }
    }

    let finishReason: "stop" | "tool_calls" | "length" = "stop";
    let usage: {
      promptTokens: number;
      completionTokens: number;
      cachedPromptTokens: number;
    } | null = null;

    try {
      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        const delta = choice?.delta as
          | { content?: string | null; reasoning_content?: string | null; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> }
          | undefined;

        if (delta?.reasoning_content) {
          yield { type: "reasoning", text: delta.reasoning_content };
        }
        if (delta?.content) {
          yield { type: "text", text: delta.content };
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            yield {
              type: "tool_call_delta",
              index: tc.index,
              id: tc.id,
              name: tc.function?.name,
              argsFragment: tc.function?.arguments ?? "",
            };
          }
        }
        if (choice?.finish_reason) {
          if (choice.finish_reason === "tool_calls") finishReason = "tool_calls";
          else if (choice.finish_reason === "length") finishReason = "length";
        }
        if (chunk.usage) {
          const cached =
            (chunk.usage as { prompt_cache_hit_tokens?: number }).prompt_cache_hit_tokens ??
            (chunk.usage.prompt_tokens_details as { cached_tokens?: number } | undefined)
              ?.cached_tokens ??
            0;
          usage = {
            promptTokens: chunk.usage.prompt_tokens ?? 0,
            completionTokens: chunk.usage.completion_tokens ?? 0,
            cachedPromptTokens: cached,
          };
        }
      }
    } catch (err) {
      throw classifyError(err);
    }

    yield { type: "finish", reason: finishReason, usage };
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await this.client.models.list();
      const ids = res.data.map((m) => m.id);
      return ids.map(resolveModelInfo);
    } catch (err) {
      throw classifyError(err);
    }
  }
}

export function classifyError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message))) {
    return new ProviderError("aborted", "Request aborted");
  }
  if (err instanceof APIError) {
    const status = err.status;
    const msg = err.message || `API error ${status}`;
    if (status === 401 || status === 403) return new ProviderError("invalid_key", msg);
    if (status === 402) return new ProviderError("insufficient_balance", msg);
    if (status === 429) {
      const retryAfter = Number(err.headers?.["retry-after"]);
      return new ProviderError(
        "rate_limit",
        msg,
        Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined,
      );
    }
    if (status === 400 && /context|length|token/i.test(msg)) {
      return new ProviderError("context_overflow", msg);
    }
    if (status === undefined) return new ProviderError("network", msg);
    return new ProviderError("unknown", msg);
  }
  if (err instanceof Error && /fetch|network|ECONN|ETIMEDOUT|ENOTFOUND/i.test(err.message)) {
    return new ProviderError("network", err.message);
  }
  return new ProviderError("unknown", err instanceof Error ? err.message : String(err));
}
