import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { glob as tinyGlob } from "tinyglobby";
import { z } from "zod";
import { toolError, truncateOutput, type ToolDef } from "./Tool.js";

const GlobInput = z.object({
  pattern: z.string().describe('Glob pattern, e.g. "**/*.ts" or "src/**/*.tsx"'),
  path: z.string().optional().describe("Directory to search in (defaults to session cwd)"),
});

export const globTool: ToolDef<z.infer<typeof GlobInput>> = {
  name: "glob",
  description:
    "Find files by glob pattern. Returns matching paths sorted by modification " +
    "time (newest first). node_modules and .git are always excluded.",
  schema: GlobInput,
  readOnly: true,
  kind: "read",
  summarize: (i) => `Glob ${i.pattern}`,
  async execute(input, ctx) {
    const cwd = input.path ? path.resolve(ctx.cwd, input.path) : ctx.cwd;
    const matches = await tinyGlob(input.pattern, {
      cwd,
      ignore: ["**/node_modules/**", "**/.git/**"],
      onlyFiles: true,
      absolute: false,
    });
    if (matches.length === 0) return { ok: true, output: "No files matched." };
    const capped = matches.slice(0, 500);
    const withTimes = await Promise.all(
      capped.map(async (p) => {
        try {
          const s = await fs.stat(path.join(cwd, p));
          return { p, mtime: s.mtimeMs };
        } catch {
          return { p, mtime: 0 };
        }
      }),
    );
    withTimes.sort((a, b) => b.mtime - a.mtime);
    const lines = withTimes.map((f) => f.p).join("\n");
    const note = matches.length > 500 ? `\n... (${matches.length - 500} more matches)` : "";
    return { ok: true, output: lines + note };
  },
};

const GrepInput = z.object({
  pattern: z.string().describe("Regular expression to search for (ripgrep syntax)"),
  path: z.string().optional().describe("File or directory to search (defaults to session cwd)"),
  glob: z.string().optional().describe('Filter files by glob, e.g. "*.ts"'),
  ignore_case: z.boolean().optional().describe("Case-insensitive search"),
});

export const grepTool: ToolDef<z.infer<typeof GrepInput>> = {
  name: "grep",
  description:
    "Search file contents with a regular expression (powered by ripgrep). " +
    "Returns matching lines as path:line:text. Use glob to filter file types.",
  schema: GrepInput,
  readOnly: true,
  kind: "read",
  summarize: (i) => `Grep /${i.pattern}/${i.glob ? ` in ${i.glob}` : ""}`,
  async execute(input, ctx) {
    let rgPath: string;
    try {
      const rg = await import("@vscode/ripgrep");
      rgPath = rg.rgPath;
    } catch {
      return toolError("ripgrep binary is not available.");
    }
    const args = ["--line-number", "--no-heading", "--color", "never", "--max-count", "200"];
    if (input.ignore_case) args.push("-i");
    if (input.glob) args.push("--glob", input.glob);
    args.push("--", input.pattern, input.path ?? ".");
    const result = await execa(rgPath, args, {
      cwd: ctx.cwd,
      timeout: 30_000,
      maxBuffer: 10_000_000,
      reject: false,
      windowsHide: true,
      cancelSignal: ctx.signal,
    });
    if (result.exitCode === 1) return { ok: true, output: "No matches found." };
    if (result.exitCode !== 0 && result.exitCode !== undefined) {
      return toolError(`ripgrep failed: ${result.stderr || "unknown error"}`);
    }
    return { ok: true, output: truncateOutput(result.stdout ?? "", 20_000) };
  },
};
