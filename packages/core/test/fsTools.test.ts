import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { editFileTool, readFileTool } from "../src/tools/fs.js";
import type { ToolContext } from "../src/tools/Tool.js";

let dir: string;
const ctx = (): ToolContext => ({
  cwd: dir,
  sessionId: "s",
  signal: new AbortController().signal,
  setTodos: () => {},
});

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "whalex-fs-"));
});
afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("fs tools — encoding safety", () => {
  it("refuses to edit a CP949 file rather than corrupting it", async () => {
    // "가나다" in CP949 (EUC-KR): decoding as UTF-8 yields U+FFFD.
    const cp949 = Buffer.from([0xb0, 0xa1, 0xb3, 0xaa, 0xb4, 0xd9]);
    const file = path.join(dir, "legacy.txt");
    await fs.writeFile(file, cp949);

    const res = await editFileTool.execute(
      { path: "legacy.txt", old_string: "x", new_string: "y" },
      ctx(),
    );
    expect(res.ok).toBe(false);
    expect(res.output).toMatch(/UTF-8|CP949|corrupt/i);

    // The original bytes are untouched.
    expect(Buffer.compare(await fs.readFile(file), cp949)).toBe(0);
  });

  it("warns when reading a non-UTF-8 file", async () => {
    const cp949 = Buffer.from([0xb0, 0xa1, 0xb3, 0xaa]);
    await fs.writeFile(path.join(dir, "warn.txt"), cp949);
    const res = await readFileTool.execute({ path: "warn.txt" }, ctx());
    expect(res.ok).toBe(true);
    expect(res.output).toMatch(/warning/i);
  });

  it("edits a normal UTF-8 file including non-ASCII", async () => {
    const file = path.join(dir, "ok.txt");
    await fs.writeFile(file, "안녕 world", "utf8");
    const res = await editFileTool.execute(
      { path: "ok.txt", old_string: "world", new_string: "세계" },
      ctx(),
    );
    expect(res.ok).toBe(true);
    expect(await fs.readFile(file, "utf8")).toBe("안녕 세계");
  });
});
