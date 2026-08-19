import { describe, expect, it } from "vitest";
import { execa } from "execa";
import { executeTool } from "../src/tools/shell.js";

const isWin = process.platform === "win32";
// A command whose real work happens in a grandchild: killing only the shell
// we spawned leaves it running, holding the output pipe open.
const LONG_NESTED = isWin
  ? "cmd /c ping -n 60 127.0.0.1"
  : "sh -c 'sleep 60' & wait";

const ctx = (signal: AbortSignal) => ({
  cwd: process.cwd(),
  sessionId: "test",
  signal,
  setTodos: () => {},
});

async function pingCount(): Promise<number> {
  if (!isWin) return 0;
  const r = await execa("tasklist", ["/fi", "imagename eq ping.exe"], { reject: false });
  return (r.stdout.match(/ping\.exe/g) ?? []).length;
}

describe("execute tool", () => {
  it("settles at the timeout and kills the whole process tree", async () => {
    const baseline = await pingCount();
    const started = Date.now();
    const res = await executeTool.execute(
      { command: LONG_NESTED, timeout_ms: 3000 },
      ctx(new AbortController().signal),
    );
    const elapsed = Date.now() - started;

    expect(res.ok).toBe(false);
    expect(res.output).toContain("timed out");
    // The bug this guards: the call used to hang past its own timeout because
    // an orphaned grandchild still held stdout.
    expect(elapsed).toBeLessThan(30_000);

    // Give the kill a moment to be reflected in the process table.
    await new Promise((r) => setTimeout(r, 1500));
    if (isWin && baseline === 0) expect(await pingCount()).toBe(0);
  }, 60_000);

  it("settles when the turn is aborted mid-command", async () => {
    const controller = new AbortController();
    const started = Date.now();
    const pending = executeTool.execute(
      { command: LONG_NESTED, timeout_ms: 60_000 },
      ctx(controller.signal),
    );
    setTimeout(() => controller.abort(), 1500);
    const res = await pending;

    expect(res.ok).toBe(false);
    expect(res.output).toContain("aborted");
    expect(Date.now() - started).toBeLessThan(30_000);
  }, 60_000);
});
