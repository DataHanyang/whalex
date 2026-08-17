import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveModelInfo } from "@whalex/shared";
import { AgentLoop } from "../src/agent/AgentLoop.js";
import { createBuiltinRegistry } from "../src/tools/index.js";
import { PermissionEngine } from "../src/permissions/PermissionEngine.js";
import { SessionStore } from "../src/session/SessionStore.js";
import type { ChatRequest, ProviderClient, ProviderDelta } from "../src/providers/Provider.js";

/** A provider that replays a scripted list of delta-streams, one per turn. */
class ScriptedProvider implements ProviderClient {
  calls = 0;
  constructor(private turns: ProviderDelta[][]) {}
  async *streamChat(_req: ChatRequest): AsyncIterable<ProviderDelta> {
    const turn = this.turns[this.calls++] ?? [{ type: "finish", reason: "stop", usage: null }];
    for (const d of turn) yield d;
  }
  async listModels() {
    return [];
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "whalex-loop-"));
afterEach(() => {
  for (const f of fs.readdirSync(tmp)) fs.rmSync(path.join(tmp, f), { force: true, recursive: true });
});

function makeLoop(provider: ProviderClient) {
  return new AgentLoop({
    provider,
    registry: createBuiltinRegistry({ includeAskUser: false }),
    permissions: new PermissionEngine({ mode: "bypassPermissions", allow: [], deny: [] }),
    session: SessionStore.createEphemeral(tmp),
    modelInfo: resolveModelInfo("deepseek-v4-flash"),
    temperature: 0,
  });
}

describe("AgentLoop truncated tool call", () => {
  it("does not execute a write_file cut off by the output cap", async () => {
    const target = path.join(tmp, "out.txt");
    // Turn 1: a write_file whose arguments JSON is truncated mid-string, with
    // finish_reason "length". jsonrepair would "fix" it into a valid but
    // incomplete write — the loop must refuse to run it.
    const provider = new ScriptedProvider([
      [
        {
          type: "tool_call_delta",
          index: 0,
          id: "call_1",
          name: "write_file",
          argsFragment: `{"path":${JSON.stringify(target)},"content":"partial and cut`,
        },
        { type: "finish", reason: "length", usage: null },
      ],
      // Turn 2: the model acknowledges and stops.
      [
        { type: "text", text: "Understood, I will split the file." },
        { type: "finish", reason: "stop", usage: null },
      ],
    ]);
    const loop = makeLoop(provider);

    const events: string[] = [];
    for await (const ev of loop.run("write the file")) events.push(ev.type);

    // The truncated write never touched disk.
    expect(fs.existsSync(target)).toBe(false);
    // The model was told it was cut off, via a failed tool result.
    const results = loop["opts"].session.effectiveRecords().filter((r) => r.type === "tool_result");
    expect(results).toHaveLength(1);
    expect((results[0] as { ok: boolean }).ok).toBe(false);
    expect((results[0] as { output: string }).output).toMatch(/cut off|token limit/i);
    // It retried (called the provider a second time) and ended cleanly.
    expect(provider.calls).toBe(2);
    expect(events[events.length - 1]).toBe("done");
  });

  it("executes a normal (non-truncated) write_file", async () => {
    const target = path.join(tmp, "ok.txt");
    const provider = new ScriptedProvider([
      [
        {
          type: "tool_call_delta",
          index: 0,
          id: "call_1",
          name: "write_file",
          argsFragment: JSON.stringify({ path: target, content: "complete content" }),
        },
        { type: "finish", reason: "tool_calls", usage: null },
      ],
      [{ type: "text", text: "done" }, { type: "finish", reason: "stop", usage: null }],
    ]);
    const loop = makeLoop(provider);
    for await (const _ of loop.run("write the file")) void _;
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, "utf8")).toBe("complete content");
  });
});
