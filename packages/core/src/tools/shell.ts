import { execa } from "execa";
import { z } from "zod";
import { truncateOutput, type ToolDef } from "./Tool.js";

const ExecuteInput = z.object({
  command: z.string().describe("PowerShell command to run"),
  timeout_ms: z
    .number()
    .int()
    .min(1000)
    .max(600_000)
    .optional()
    .describe("Timeout in milliseconds (default 120000)"),
  cwd: z.string().optional().describe("Working directory (defaults to the session cwd)"),
});

let cachedShell: string | null = null;

async function findShell(): Promise<string> {
  if (cachedShell) return cachedShell;
  try {
    await execa("pwsh", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.Major"], {
      timeout: 5000,
    });
    cachedShell = "pwsh";
  } catch {
    cachedShell = "powershell.exe";
  }
  return cachedShell;
}

export const executeTool: ToolDef<z.infer<typeof ExecuteInput>> = {
  name: "execute",
  description:
    "Run a PowerShell command on the user's machine and return stdout+stderr. " +
    "Use for builds, tests, git, package managers, and inspecting the system. " +
    "Working directory defaults to the session's project directory. " +
    "Avoid long-running interactive commands; they will hit the timeout.",
  schema: ExecuteInput,
  readOnly: false,
  kind: "execute",
  summarize: (i) => `Run \`${i.command.length > 80 ? i.command.slice(0, 77) + "..." : i.command}\``,
  ruleArg: (i) => i.command,
  async execute(input, ctx) {
    const shell = process.platform === "win32" ? await findShell() : "bash";
    // Force UTF-8 output — otherwise Korean Windows returns CP949 mojibake.
    const utf8Prelude =
      "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; ";
    const args =
      process.platform === "win32"
        ? ["-NoProfile", "-NonInteractive", "-Command", utf8Prelude + input.command]
        : ["-c", input.command];
    const started = Date.now();
    const result = await execa(shell, args, {
      cwd: input.cwd ?? ctx.cwd,
      timeout: input.timeout_ms ?? 120_000,
      maxBuffer: 10_000_000,
      reject: false,
      windowsHide: true,
      cancelSignal: ctx.signal,
      all: true,
      // Nothing here is interactive: give the command a closed stdin so a
      // prompt — an unterminated PowerShell here-string, a `read`, a tool
      // asking to confirm — fails immediately instead of blocking until the
      // timeout. Force-kill shortly after the timeout as well: killing the
      // shell alone can leave a grandchild holding the output pipe open, and
      // then the promise never settles at all.
      stdin: "ignore",
      forceKillAfterDelay: 5_000,
    });
    const durationMs = Date.now() - started;
    const raw = (result.all ?? "").toString().trim();
    const body = truncateOutput(raw) || "(no output)";
    if (result.timedOut) {
      return { ok: false, output: `Command timed out after ${durationMs}ms.\n${body}` };
    }
    if (result.exitCode !== 0) {
      return { ok: false, output: `Exit code ${result.exitCode ?? "?"}\n${body}` };
    }
    return { ok: true, output: body };
  },
};
