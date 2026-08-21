import { execa } from "execa";
import type { HookContext, HookRunner } from "@whalex/core";
import type { HookConfig } from "@whalex/shared";
import type { SettingsManager } from "./settings.js";

/**
 * Runs user-configured hook commands (settings.json `hooks`). The hook payload
 * is passed as JSON on stdin. Convention (Claude Code-compatible): a PreToolUse
 * hook that exits with code 2 blocks the tool; its stderr becomes the reason.
 * No matching hooks → returns immediately without spawning a shell.
 */
export class HookManager implements HookRunner {
  // timeoutMs is injectable so tests don't have to wait out the real 30s.
  constructor(
    private settings: SettingsManager,
    private timeoutMs = 30_000,
  ) {}

  async run(ctx: HookContext): Promise<{ block?: boolean; message?: string }> {
    const hooks = this.settings.get().hooks.filter((h) => this.matches(h, ctx));
    if (hooks.length === 0) return {};

    const payload = JSON.stringify({
      event: ctx.event,
      cwd: ctx.cwd,
      toolName: ctx.toolName,
      args: ctx.args,
      result: ctx.result,
      userText: ctx.userText,
    });

    for (const hook of hooks) {
      const shell = process.platform === "win32" ? "powershell.exe" : "bash";
      const args =
        process.platform === "win32"
          ? ["-NoProfile", "-NonInteractive", "-Command", hook.command]
          : ["-c", hook.command];
      try {
        const child = execa(shell, args, {
          cwd: ctx.cwd,
          input: payload,
          timeout: this.timeoutMs,
          reject: false,
          windowsHide: true,
        });
        // execa's own timeout kills the shell but not its children; on
        // Windows a grandchild keeps the stdio pipes open and the await never
        // settles. Race a hard deadline and kill the whole tree ourselves.
        let deadline: NodeJS.Timeout | undefined;
        const res = await Promise.race([
          child,
          new Promise<null>((resolve) => {
            deadline = setTimeout(() => resolve(null), this.timeoutMs + 500);
          }),
        ]).finally(() => clearTimeout(deadline));
        if (res === null && child.pid) {
          if (process.platform === "win32") {
            void execa("taskkill", ["/PID", String(child.pid), "/T", "/F"], { reject: false, windowsHide: true });
          } else {
            child.kill("SIGKILL");
          }
        }
        // Exit code 2 on a PreToolUse hook blocks the tool.
        if (res && ctx.event === "PreToolUse" && res.exitCode === 2) {
          return {
            block: true,
            message: (res.stderr || res.stdout || "Blocked by a PreToolUse hook.").trim().slice(0, 500),
          };
        }
        // A PreToolUse hook that never delivered a verdict (timed out or was
        // killed) fails CLOSED — a broken lock must not swing the door open.
        // Exit codes other than 2 are a verdict: not blocking.
        if (ctx.event === "PreToolUse" && (res === null || res.timedOut || res.exitCode === undefined)) {
          return {
            block: true,
            message: "PreToolUse hook did not finish (timeout) — blocking the tool to stay safe.",
          };
        }
      } catch (err) {
        // Same fail-closed rule when the hook cannot even spawn; hooks on
        // other events stay non-fatal — they observe, they don't gate.
        if (ctx.event === "PreToolUse") {
          return {
            block: true,
            message: `PreToolUse hook failed to run (${String(err).slice(0, 200)}) — blocking the tool to stay safe.`,
          };
        }
      }
    }
    return {};
  }

  private matches(hook: HookConfig, ctx: HookContext): boolean {
    if (hook.event !== ctx.event) return false;
    if (!hook.matcher) return true;
    // A tool-name matcher can't match an event that has no tool.
    if (!ctx.toolName) return false;
    // Glob-ish matcher against the tool name.
    const re = new RegExp(`^${hook.matcher.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    return re.test(ctx.toolName);
  }
}
