import { describe, expect, it } from "vitest";
import type { HookContext } from "@whalex/core";
import { HookManager } from "../src/main/HookManager.js";
import type { SettingsManager } from "../src/main/settings.js";

// The manager only reads settings.get().hooks; a stub keeps the tests free of
// Electron and the on-disk settings file.
function manager(hooks: Array<{ event: string; matcher?: string; command: string }>, timeoutMs?: number) {
  const settings = { get: () => ({ hooks }) } as unknown as SettingsManager;
  return new HookManager(settings, timeoutMs);
}

function ctx(over: Partial<HookContext> = {}): HookContext {
  return { event: "PreToolUse", sessionId: "s1", cwd: process.cwd(), toolName: "write_file", ...over };
}

// One command string per platform: HookManager runs powershell on Windows,
// bash elsewhere. `node -e` behaves identically under both.
const HANG = 'node -e "setTimeout(function(){}, 60000)"';

describe("HookManager", () => {
  it("returns immediately when no hook matches", async () => {
    const res = await manager([]).run(ctx());
    expect(res).toEqual({});
  });

  it("exit code 2 on PreToolUse blocks, surfacing the hook's output", async () => {
    const res = await manager([{ event: "PreToolUse", command: "echo nope; exit 2" }]).run(ctx());
    expect(res.block).toBe(true);
    expect(res.message).toContain("nope");
  });

  it("exit codes 0 and 1 are a pass verdict", async () => {
    for (const command of ["exit 0", "echo warn; exit 1"]) {
      const res = await manager([{ event: "PreToolUse", command }]).run(ctx());
      expect(res).toEqual({});
    }
  });

  it("a PreToolUse hook that times out fails closed", async () => {
    const res = await manager([{ event: "PreToolUse", command: HANG }], 1000).run(ctx());
    expect(res.block).toBe(true);
    expect(res.message).toMatch(/did not finish/);
  });

  it("a hanging hook on a non-gating event does not block", async () => {
    const res = await manager([{ event: "PostToolUse", command: HANG }], 1000).run(ctx({ event: "PostToolUse" }));
    expect(res).toEqual({});
  });

  it("matcher globs against the tool name", async () => {
    const hooks = [{ event: "PreToolUse", matcher: "write_*", command: "exit 2" }];
    const blocked = await manager(hooks).run(ctx({ toolName: "write_file" }));
    expect(blocked.block).toBe(true);
    const passed = await manager(hooks).run(ctx({ toolName: "shell" }));
    expect(passed).toEqual({});
  });
});
