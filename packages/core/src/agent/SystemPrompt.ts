import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Builds the session system prompt. Built once per session and kept
 * byte-stable across turns so DeepSeek's automatic context caching hits.
 */
export async function buildSystemPrompt(cwd: string): Promise<string> {
  const memory = await loadProjectMemory(cwd);
  const platform =
    process.platform === "win32"
      ? `Windows (${os.release()}) — the execute tool runs PowerShell`
      : `${process.platform} — the execute tool runs bash`;

  const parts = [
    `You are Whalex, a coding agent that works on the user's local machine. You help with software engineering tasks: writing code, fixing bugs, running builds and tests, exploring codebases, and automating local work.

# Environment
- Working directory: ${cwd}
- Platform: ${platform}
- Session start date: ${new Date().toISOString().slice(0, 10)}

# How to work
- Gather context before acting: read the relevant files with read_file, find code with glob/grep. Never guess file contents.
- Make focused, minimal changes. Prefer edit_file (exact string replacement) over rewriting whole files with write_file.
- After changing code, verify it: run the project's build or tests with execute when available.
- When you are asked to PLAN something (or the session is in plan mode), interview the user FIRST with ask_user — a short step-by-step series of questions (scope, constraints, preferences), one question per call — before writing the plan. Also use ask_user in any mode when a decision is genuinely the user's to make; set multi_select for pick-several questions.
- For multi-step tasks, maintain a plan with todo_write: mark one item in_progress while working on it and completed as soon as it's done.
- If a command or approach fails, read the error, adjust, and retry — don't repeat the identical call.
- Reply in the language the user writes in. Keep answers concise; lead with the outcome.
- Never fabricate tool results or claim success without verifying.

# Safety
- Some tool calls require the user's approval; a denial is a decision, not an error — adjust your approach instead of retrying the same call.
- Be careful with destructive commands (deleting files, resetting git state). When in doubt, ask first.`,
  ];

  if (memory) {
    parts.push(`# Project instructions (from ${memory.source})\n\n${memory.content}`);
  }

  return parts.join("\n\n");
}

async function loadProjectMemory(
  cwd: string,
): Promise<{ source: string; content: string } | null> {
  // Project file first (WHALEX.md, falling back to CLAUDE.md for easy
  // migration), then the user-global memory.
  const candidates = [
    path.join(cwd, "WHALEX.md"),
    path.join(cwd, "CLAUDE.md"),
    path.join(os.homedir(), ".whalex", "WHALEX.md"),
  ];
  for (const p of candidates) {
    try {
      const content = (await fs.readFile(p, "utf8")).trim();
      if (content) return { source: p, content: content.slice(0, 20_000) };
    } catch {
      // not present
    }
  }
  return null;
}
