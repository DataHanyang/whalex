import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/agent/SystemPrompt.js";

describe("buildSystemPrompt", () => {
  const cwd = path.join(os.tmpdir(), "whalex-prompt-test");

  it("includes the Safety section by default", async () => {
    const p = await buildSystemPrompt(cwd);
    expect(p).toContain("# Safety");
    expect(p).toContain("Be careful with destructive commands");
    expect(p).not.toContain("# Directness");
  });

  it("drops Safety and adds Directness in uncensored mode", async () => {
    const p = await buildSystemPrompt(cwd, { uncensored: true });
    expect(p).not.toContain("# Safety");
    expect(p).toContain("# Directness");
    expect(p).toContain("Answer the user's request directly and completely");
  });
});
