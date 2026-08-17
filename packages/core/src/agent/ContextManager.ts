import type { ModelInfo, UsageInfo } from "@whalex/shared";
import type { ProviderUsage } from "../providers/Provider.js";

/**
 * Tracks token usage and context pressure. The previous response's
 * prompt_tokens is ground truth for what's in the window; new content since
 * then is estimated with a cheap heuristic (Korean/CJK ≈ 1.5 chars/token,
 * ASCII ≈ 4 chars/token). No local tokenizer matches DeepSeek exactly, and
 * the estimate self-corrects on every API response.
 */
export class ContextManager {
  private lastPromptTokens = 0;
  private lastCompletionTokens = 0;
  private pendingEstimate = 0;
  private totalInput = 0;
  private totalOutput = 0;
  private totalCachedInput = 0;

  constructor(private model: ModelInfo) {}

  setModel(model: ModelInfo): void {
    this.model = model;
  }

  /** Restore cumulative totals when resuming a session (cost/usage meter). */
  restoreTotals(t: { inputTokens: number; outputTokens: number; cachedInputTokens: number }): void {
    this.totalInput = t.inputTokens;
    this.totalOutput = t.outputTokens;
    this.totalCachedInput = t.cachedInputTokens;
  }

  static estimateTokens(text: string): number {
    let ascii = 0;
    let wide = 0;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) < 128) ascii++;
      else wide++;
    }
    return Math.ceil(ascii / 4 + wide / 1.5);
  }

  /** Call when content is appended to the conversation between API calls. */
  addPending(text: string): void {
    this.pendingEstimate += ContextManager.estimateTokens(text);
  }

  recordUsage(usage: ProviderUsage | null): void {
    if (!usage) return;
    this.lastPromptTokens = usage.promptTokens;
    this.lastCompletionTokens = usage.completionTokens;
    this.pendingEstimate = 0;
    this.totalInput += usage.promptTokens;
    this.totalOutput += usage.completionTokens;
    this.totalCachedInput += usage.cachedPromptTokens;
  }

  /** After a compaction the window is small again; the next response corrects it. */
  reset(): void {
    this.lastPromptTokens = 0;
    this.lastCompletionTokens = 0;
    this.pendingEstimate = 0;
  }

  contextTokens(): number {
    return this.lastPromptTokens + this.lastCompletionTokens + this.pendingEstimate;
  }

  contextPct(): number {
    return Math.min(100, Math.round((this.contextTokens() / this.model.contextWindow) * 100));
  }

  needsCompaction(): boolean {
    return this.contextTokens() > this.model.contextWindow * 0.75;
  }

  snapshot(): UsageInfo {
    const pricing = this.model.pricing;
    const costUsd = pricing
      ? ((this.totalInput - this.totalCachedInput) * pricing.input +
          this.totalCachedInput * (pricing.cachedInput ?? pricing.input) +
          this.totalOutput * pricing.output) /
        1_000_000
      : 0;
    return {
      inputTokens: this.totalInput,
      outputTokens: this.totalOutput,
      cachedInputTokens: this.totalCachedInput,
      contextTokens: this.contextTokens(),
      contextPct: this.contextPct(),
      costUsd,
    };
  }
}
