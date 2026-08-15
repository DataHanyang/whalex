import { describe, expect, it } from "vitest";
import { ContextManager } from "../src/agent/ContextManager.js";
import { resolveModelInfo } from "@whalex/shared";

describe("ContextManager", () => {
  const model = resolveModelInfo("deepseek-v4-flash");

  it("estimates more tokens for CJK than ASCII of equal length", () => {
    const ascii = ContextManager.estimateTokens("a".repeat(100));
    const cjk = ContextManager.estimateTokens("가".repeat(100));
    expect(cjk).toBeGreaterThan(ascii);
  });

  it("uses API usage as ground truth for the window", () => {
    const cm = new ContextManager(model);
    cm.addPending("some pending text");
    cm.recordUsage({ promptTokens: 5000, completionTokens: 200, cachedPromptTokens: 4000 });
    expect(cm.contextTokens()).toBe(5200);
    const snap = cm.snapshot();
    expect(snap.inputTokens).toBe(5000);
    expect(snap.outputTokens).toBe(200);
    expect(snap.cachedInputTokens).toBe(4000);
  });

  it("flags compaction past 75% of the window", () => {
    const cm = new ContextManager(model);
    cm.recordUsage({ promptTokens: Math.floor(model.contextWindow * 0.8), completionTokens: 0, cachedPromptTokens: 0 });
    expect(cm.needsCompaction()).toBe(true);
  });

  it("does not flag compaction well under the window", () => {
    const cm = new ContextManager(model);
    cm.recordUsage({ promptTokens: 1000, completionTokens: 0, cachedPromptTokens: 0 });
    expect(cm.needsCompaction()).toBe(false);
  });

  it("reset clears the window estimate", () => {
    const cm = new ContextManager(model);
    cm.recordUsage({ promptTokens: 90000, completionTokens: 0, cachedPromptTokens: 0 });
    cm.reset();
    expect(cm.contextTokens()).toBe(0);
  });
});
