import { describe, expect, it } from "vitest";
import { runWorkflowScript, type ScriptHostHooks } from "../src/workflow/ScriptHost.js";

function hooks(over: Partial<ScriptHostHooks> = {}): ScriptHostHooks {
  return {
    agent: async () => "",
    phase: () => {},
    log: () => {},
    warn: () => {},
    signal: new AbortController().signal,
    ...over,
  };
}

describe("runWorkflowScript", () => {
  it("returns the script's value and round-trips agent() over IPC", async () => {
    const calls: string[] = [];
    const res = await runWorkflowScript(
      `const a = await agent("one", { schema: 1 });
       const b = await agent("two");
       return a + "/" + b;`,
      hooks({
        agent: async (prompt) => {
          calls.push(prompt);
          return prompt.toUpperCase();
        },
      }),
    );
    expect(res.hasValue).toBe(true);
    expect(res.value).toBe("ONE/TWO");
    expect(calls).toEqual(["one", "two"]);
  });

  it("runs parallel() and pipeline() inside the worker", async () => {
    const res = await runWorkflowScript(
      `const xs = await parallel([() => agent("a"), () => agent("b")]);
       const ys = await pipeline(["p","q"], (v) => agent(v));
       return JSON.stringify([xs, ys]);`,
      hooks({ agent: async (p) => p + "!" }),
    );
    expect(JSON.parse(res.value as string)).toEqual([
      ["a!", "b!"],
      ["p!", "q!"],
    ]);
  });

  it("forwards phase() and log() notifications to the host", async () => {
    const phases: string[] = [];
    const logs: string[] = [];
    await runWorkflowScript(`phase("Recon"); log("started"); return 1;`, hooks({
      phase: (t) => phases.push(t),
      log: (m) => logs.push(m),
    }));
    expect(phases).toEqual(["Recon"]);
    expect(logs).toEqual(["started"]);
  });

  it("cannot read the filesystem from inside the script (fs is unreachable)", async () => {
    // Neither require nor process is in scope; even constructing them fails.
    const res = await runWorkflowScript(
      `try { const fs = require("node:fs"); return "LEAK:" + typeof fs.readFileSync; }
       catch (e) { return "blocked:" + e.constructor.name; }`,
      hooks(),
    );
    expect(String(res.value)).toMatch(/^blocked:/);
    expect(String(res.value)).not.toContain("LEAK");
  });

  it("rejects when the script throws", async () => {
    await expect(
      runWorkflowScript(`throw new Error("boom");`, hooks()),
    ).rejects.toThrow(/boom/);
  });

  it("rejects a syntactically broken script instead of hanging", async () => {
    await expect(runWorkflowScript(`return (;`, hooks())).rejects.toThrow(/syntax/i);
  });

  it("aborts a running script when the signal fires", async () => {
    const ctrl = new AbortController();
    const p = runWorkflowScript(
      `await agent("slow"); return "done";`,
      hooks({
        agent: () => new Promise(() => {}), // never resolves
        signal: ctrl.signal,
      }),
    );
    ctrl.abort();
    await expect(p).rejects.toThrow(/abort/i);
  });
});
