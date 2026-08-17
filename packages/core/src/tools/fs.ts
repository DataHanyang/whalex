import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { toolError, type ToolDef } from "./Tool.js";

const MAX_READ_BYTES = 1_000_000;
/** Even with offset/limit we must decode from the start to count lines. */
const MAX_READ_BYTES_PARTIAL = 32_000_000;
const MAX_READ_LINES = 2000;

/**
 * Decode as UTF-8 and detect lossy files (legacy CP949/EUC-KR etc. decode to
 * U+FFFD). Editing a lossy decode and re-saving as UTF-8 permanently destroys
 * the original bytes, so writes must refuse.
 */
function decodeUtf8(buf: Buffer): { text: string; lossy: boolean } {
  const text = buf.toString("utf8");
  return { text, lossy: text.includes("�") };
}

const ENCODING_WARNING =
  "not valid UTF-8 (likely a legacy encoding such as CP949/EUC-KR)";

function resolveIn(cwd: string, p: string): string {
  return path.isAbsolute(p) ? path.normalize(p) : path.resolve(cwd, p);
}

function relPath(cwd: string, abs: string): string {
  const rel = path.relative(cwd, abs);
  return rel && !rel.startsWith("..") ? rel : abs;
}

const ReadFileInput = z.object({
  path: z.string().describe("File path (absolute or relative to the working directory)"),
  offset: z.number().int().min(1).optional().describe("1-based line number to start from"),
  limit: z.number().int().min(1).optional().describe("Maximum number of lines to read"),
});

export const readFileTool: ToolDef<z.infer<typeof ReadFileInput>> = {
  name: "read_file",
  description:
    "Read a text file and return its contents with line numbers (like cat -n). " +
    "Use offset/limit for large files. Fails on binary files.",
  schema: ReadFileInput,
  readOnly: true,
  kind: "read",
  summarize: (i, cwd) => `Read ${relPath(cwd, resolveIn(cwd, i.path))}`,
  ruleArg: (i, cwd) => relPath(cwd, resolveIn(cwd, i.path)),
  async execute(input, ctx) {
    const abs = resolveIn(ctx.cwd, input.path);
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      return toolError(`File not found: ${abs}`);
    }
    if (stat.isDirectory()) return toolError(`${abs} is a directory. Use glob to list files.`);
    const partial = input.offset !== undefined || input.limit !== undefined;
    if (stat.size > (partial ? MAX_READ_BYTES_PARTIAL : MAX_READ_BYTES)) {
      return toolError(
        partial
          ? `File is ${stat.size} bytes (limit ${MAX_READ_BYTES_PARTIAL} even with offset/limit). Use grep to search inside it.`
          : `File is ${stat.size} bytes (limit ${MAX_READ_BYTES}). Use offset/limit to read part of it.`,
      );
    }
    const buf = await fs.readFile(abs);
    if (buf.subarray(0, 8000).includes(0)) {
      return toolError(`${abs} looks like a binary file.`);
    }
    const decoded = decodeUtf8(buf);
    const lines = decoded.text.split(/\r?\n/);
    const start = (input.offset ?? 1) - 1;
    const count = Math.min(input.limit ?? MAX_READ_LINES, MAX_READ_LINES);
    const slice = lines.slice(start, start + count);
    const numbered = slice
      .map((l, i) => `${String(start + i + 1).padStart(6)}\t${l}`)
      .join("\n");
    const suffix =
      start + count < lines.length
        ? `\n... (${lines.length - start - count} more lines — use offset=${start + count + 1})`
        : "";
    const prefix = decoded.lossy
      ? `[warning] ${abs} is ${ENCODING_WARNING}. Characters shown as � are lost in this view; edit_file will refuse to modify it.\n`
      : "";
    return { ok: true, output: prefix + numbered + suffix };
  },
};

const WriteFileInput = z.object({
  path: z.string().describe("File path to write (absolute or relative)"),
  content: z.string().describe("Full content to write to the file"),
});

export const writeFileTool: ToolDef<z.infer<typeof WriteFileInput>> = {
  name: "write_file",
  description:
    "Write content to a file, creating it (and parent directories) if needed, " +
    "or overwriting it entirely if it exists. Prefer edit_file for small changes.",
  schema: WriteFileInput,
  readOnly: false,
  kind: "edit",
  summarize: (i, cwd) => `Write ${relPath(cwd, resolveIn(cwd, i.path))}`,
  ruleArg: (i, cwd) => relPath(cwd, resolveIn(cwd, i.path)),
  async prepare(input, ctx) {
    const abs = resolveIn(ctx.cwd, input.path);
    let oldText = "";
    try {
      oldText = await fs.readFile(abs, "utf8");
    } catch {
      // new file
    }
    return { diff: { path: abs, oldText, newText: input.content } };
  },
  async execute(input, ctx) {
    const abs = resolveIn(ctx.cwd, input.path);
    let oldText = "";
    try {
      oldText = await fs.readFile(abs, "utf8");
    } catch {
      // new file
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, input.content, "utf8");
    const lineCount = input.content.split("\n").length;
    return {
      ok: true,
      output: `Wrote ${lineCount} lines to ${abs}`,
      diff: { path: abs, oldText, newText: input.content },
    };
  },
};

const EditFileInput = z.object({
  path: z.string().describe("File path to edit (absolute or relative)"),
  old_string: z.string().describe("Exact text to replace (must be unique unless replace_all)"),
  new_string: z.string().describe("Replacement text"),
  replace_all: z.boolean().optional().describe("Replace every occurrence (default false)"),
});

async function computeEdit(
  cwd: string,
  input: z.infer<typeof EditFileInput>,
): Promise<{ abs: string; oldText: string; newText: string } | { error: string }> {
  const abs = resolveIn(cwd, input.path);
  let oldText: string;
  try {
    const decoded = decodeUtf8(await fs.readFile(abs));
    // Editing a lossy decode would re-save U+FFFD as UTF-8 and permanently
    // destroy the original (e.g. Korean CP949) bytes.
    if (decoded.lossy) {
      return {
        error: `${abs} is ${ENCODING_WARNING}. Editing it would corrupt the original text. Convert the file to UTF-8 first (e.g. via a shell command) or rewrite it entirely with write_file.`,
      };
    }
    oldText = decoded.text;
  } catch {
    return { error: `File not found: ${abs}` };
  }
  if (input.old_string === input.new_string) {
    return { error: "old_string and new_string are identical." };
  }
  const occurrences = oldText.split(input.old_string).length - 1;
  if (occurrences === 0) {
    return { error: `old_string not found in ${abs}. Read the file and match the text exactly.` };
  }
  if (occurrences > 1 && !input.replace_all) {
    return {
      error: `old_string appears ${occurrences} times in ${abs}. Provide more surrounding context to make it unique, or set replace_all.`,
    };
  }
  const newText = input.replace_all
    ? oldText.split(input.old_string).join(input.new_string)
    : oldText.replace(input.old_string, input.new_string);
  return { abs, oldText, newText };
}

export const editFileTool: ToolDef<z.infer<typeof EditFileInput>> = {
  name: "edit_file",
  description:
    "Edit a file by exact string replacement. old_string must match the file " +
    "contents exactly (including whitespace) and be unique, or set replace_all.",
  schema: EditFileInput,
  readOnly: false,
  kind: "edit",
  summarize: (i, cwd) => `Edit ${relPath(cwd, resolveIn(cwd, i.path))}`,
  ruleArg: (i, cwd) => relPath(cwd, resolveIn(cwd, i.path)),
  async prepare(input, ctx) {
    const res = await computeEdit(ctx.cwd, input);
    if ("error" in res) return {};
    return { diff: { path: res.abs, oldText: res.oldText, newText: res.newText } };
  },
  async execute(input, ctx) {
    const res = await computeEdit(ctx.cwd, input);
    if ("error" in res) return toolError(res.error);
    await fs.writeFile(res.abs, res.newText, "utf8");
    return {
      ok: true,
      output: `Edited ${res.abs}`,
      diff: { path: res.abs, oldText: res.oldText, newText: res.newText },
    };
  },
};
