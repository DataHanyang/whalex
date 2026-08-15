import type { HookEvent } from "@whalex/shared";

export interface HookContext {
  event: HookEvent;
  sessionId: string;
  cwd: string;
  toolName?: string;
  args?: unknown;
  result?: { ok: boolean; output: string };
  userText?: string;
}

export interface HookOutcome {
  /** PreToolUse only: block the tool from running. */
  block?: boolean;
  /** Message surfaced to the model (block reason) or logged. */
  message?: string;
}

/**
 * Runs user-configured hook commands on agent lifecycle events. Implemented
 * by the Electron main process (shell exec); core stays UI/OS-agnostic and
 * only calls this seam. A no-op default means "no hooks configured".
 */
export interface HookRunner {
  run(ctx: HookContext): Promise<HookOutcome>;
}

export const NOOP_HOOKS: HookRunner = {
  async run() {
    return {};
  },
};
