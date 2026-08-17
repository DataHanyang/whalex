import { describe, expect, it } from "vitest";
import { compactSession } from "../src/agent/Compactor.js";
import { SessionStore } from "../src/session/SessionStore.js";
import type { ChatRequest, ProviderClient, ProviderDelta } from "../src/providers/Provider.js";

/** Captures the transcript it was asked to summarize and returns a fixed brief. */
class CapturingProvider implements ProviderClient {
  lastUserContent = "";
  async *streamChat(req: ChatRequest): AsyncIterable<ProviderDelta> {
    this.lastUserContent = req.messages.find((m) => m.role === "user")?.content ?? "";
    yield { type: "text", text: "BRIEF: the compacted summary" };
    yield { type: "finish", reason: "stop", usage: null };
  }
  async listModels() {
    return [];
  }
}

describe("compactSession", () => {
  it("excludes rewound records from the summary input", async () => {
    const s = SessionStore.createEphemeral("C:/proj");
    s.append({ type: "user", id: "u1", text: "KEEP this instruction", ts: 1 });
    s.append({ type: "assistant", id: "a1", text: "ok", reasoning: "", toolCalls: [], ts: 2 });
    const boundary = s.effectiveRecords().length;
    s.append({ type: "user", id: "u2", text: "DISCARDED secret request", ts: 3 });
    s.append({ type: "assistant", id: "a2", text: "leaked", reasoning: "", toolCalls: [], ts: 4 });
    // The user rewound past the discarded turn.
    s.rewindTo(boundary);

    const provider = new CapturingProvider();
    const res = await compactSession(provider, s, "deepseek-v4-flash", new AbortController().signal);
    expect(res.ok).toBe(true);
    expect(res.summary).toContain("BRIEF");
    // Rewound content must not resurface via the summary input.
    expect(provider.lastUserContent).toContain("KEEP this instruction");
    expect(provider.lastUserContent).not.toContain("DISCARDED secret request");
    expect(provider.lastUserContent).not.toContain("leaked");
  });

  it("folds a prior summary into the new one instead of re-summarizing everything", async () => {
    const s = SessionStore.createEphemeral("C:/proj");
    s.append({ type: "user", id: "u1", text: "RAWANCIENTTURN", ts: 1 });
    s.appendCompaction("PRIORSUMMARY", 70, 20);
    s.append({ type: "user", id: "u2", text: "recent work", ts: 3 });

    const provider = new CapturingProvider();
    await compactSession(provider, s, "deepseek-v4-flash", new AbortController().signal);
    // The prior summary is carried forward; the raw ancient turn is not re-sent.
    expect(provider.lastUserContent).toContain("PRIORSUMMARY");
    expect(provider.lastUserContent).toContain("recent work");
    expect(provider.lastUserContent).not.toContain("RAWANCIENTTURN");
  });

  it("returns an error when there is nothing new to compact", async () => {
    const s = SessionStore.createEphemeral("C:/proj");
    s.appendCompaction("only a summary", 50, 10);
    const res = await compactSession(
      new CapturingProvider(),
      s,
      "deepseek-v4-flash",
      new AbortController().signal,
    );
    expect(res.ok).toBe(false);
  });
});
