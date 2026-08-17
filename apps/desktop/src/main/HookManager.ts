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
  constructor(private settings: SettingsManager) {}

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
        const res = await execa(shell, args, {
          cwd: ctx.cwd,
          input: payload,
          timeout: 30_000,
          reject: false,
          windowsHide: true,
        });
        // Exit code 2 on a PreToolUse hook blocks the tool.
        if (ctx.event === "PreToolUse" && res.exitCode === 2) {
          return {
            block: true,
            message: (res.stderr || res.stdout || "Blocked by a PreToolUse hook.").trim().slice(0, 500),
          };
        }
      } catch {
        // A failing hook must not break the agent turn.
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
