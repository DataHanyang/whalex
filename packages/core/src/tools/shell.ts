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

/**
 * Kill the command *and everything it spawned*. Signalling the shell alone
 * leaves grandchildren (npm → node, pytest → workers) running: they get
 * re-parented to init and keep holding the output pipe, so a timed-out or
 * stopped command lingers invisibly and its promise never settles.
 */
async function killTree(pid: number | undefined): Promise<void> {
  if (!pid) return;
  if (process.platform === "win32") {
    // /T walks the child tree, /F is SIGKILL's equivalent.
    await execa("taskkill", ["/pid", String(pid), "/T", "/F"], {
      reject: false,
      windowsHide: true,
    });
    return;
  }
  // Negative pid = the whole process group (see `detached` at the spawn).
  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      process.kill(-pid, signal);
    } catch {
      // Already gone, or never became a group leader — nothing to do.
    }
  };
  signalGroup("SIGTERM");
  // Escalate for anything that ignores SIGTERM, without blocking the caller.
  setTimeout(() => signalGroup("SIGKILL"), 3_000).unref();
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
    const timeoutMs = input.timeout_ms ?? 120_000;
    const child = execa(shell, args, {
      cwd: input.cwd ?? ctx.cwd,
      maxBuffer: 10_000_000,
      reject: false,
      windowsHide: true,
      all: true,
      // Nothing here is interactive: give the command a closed stdin so a
      // prompt — an unterminated PowerShell here-string, a `read`, a tool
      // asking to confirm — fails immediately instead of blocking until the
      // timeout.
      stdin: "ignore",
      // POSIX: own process group, so killTree's negative pid reaches every
      // descendant. (Windows uses taskkill /T instead.)
      detached: process.platform !== "win32",
    });
    // The timeout and the abort are ours rather than execa's `timeout` /
    // `cancelSignal`: those signal the shell alone, and a surviving grandchild
    // keeps the output pipe open — the command neither dies nor settles.
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      void killTree(child.pid);
    }, timeoutMs);
    const onAbort = () => void killTree(child.pid);
    if (ctx.signal.aborted) onAbort();
    else ctx.signal.addEventListener("abort", onAbort, { once: true });

    let result;
    try {
      result = await child;
    } finally {
      clearTimeout(timer);
      ctx.signal.removeEventListener("abort", onAbort);
    }
    const durationMs = Date.now() - started;
    const raw = (result.all ?? "").toString().trim();
    const body = truncateOutput(raw) || "(no output)";
    if (timedOut) {
      return { ok: false, output: `Command timed out after ${durationMs}ms.\n${body}` };
    }
    if (ctx.signal.aborted) {
      return { ok: false, output: `Command aborted after ${durationMs}ms.\n${body}` };
    }
    if (result.exitCode !== 0) {
      return { ok: false, output: `Exit code ${result.exitCode ?? "?"}\n${body}` };
    }
    return { ok: true, output: body };
  },
};
