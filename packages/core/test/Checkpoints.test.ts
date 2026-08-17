import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "../src/session/SessionStore.js";
import { listCheckpoints, rewindTo } from "../src/session/Checkpoints.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "whalex-cp-"));
afterEach(() => {
  for (const f of fs.readdirSync(tmp)) fs.rmSync(path.join(tmp, f), { force: true });
});

function seedTurn(s: SessionStore, userText: string, file: string, oldText: string, newText: string) {
  s.append({ type: "user", id: userText, text: userText, ts: Date.now() });
  s.append({ type: "assistant", id: "a", text: "", reasoning: "", toolCalls: [], ts: Date.now() });
  s.append({
    type: "tool_result",
    toolCallId: "t",
    toolName: "write_file",
    args: {},
    ok: true,
    output: "wrote",
    durationMs: 1,
    diff: { path: file, oldText, newText },
    ts: Date.now(),
  });
  fs.writeFileSync(file, newText);
}

describe("Checkpoints", () => {
  it("lists one checkpoint per user message with file-change counts", () => {
    const s = SessionStore.createEphemeral(tmp);
    const file = path.join(tmp, "a.txt");
    seedTurn(s, "first", file, "", "v1");
    seedTurn(s, "second", file, "v1", "v2");
    const cps = listCheckpoints(s);
    expect(cps).toHaveLength(2);
    expect(cps[0]!.label).toBe("first");
    expect(cps[0]!.fileChanges).toBe(1);
  });

  it("restores files and truncates the conversation on rewind", async () => {
    const s = SessionStore.createEphemeral(tmp);
    const file = path.join(tmp, "a.txt");
    seedTurn(s, "make v1", file, "", "v1");
    seedTurn(s, "make v2", file, "v1", "v2");
    expect(fs.readFileSync(file, "utf8")).toBe("v2");

    // Rewind to the second checkpoint → undo the v2 change, restoring v1.
    const cps = listCheckpoints(s);
    await rewindTo(s, cps[1]!.boundary);
    expect(fs.readFileSync(file, "utf8")).toBe("v1");
    // The conversation now ends before the second user message.
    const userMsgs = s.transcript().filter((i) => i.kind === "user");
    expect(userMsgs).toHaveLength(1);
    expect((userMsgs[0] as { text: string }).text).toBe("make v1");
  });

  it("deletes files that were newly created after the checkpoint", async () => {
    const s = SessionStore.createEphemeral(tmp);
    const file = path.join(tmp, "new.txt");
    s.append({ type: "user", id: "u", text: "start", ts: Date.now() });
    seedTurn(s, "create it", file, "", "created");
    expect(fs.existsSync(file)).toBe(true);
    const cps = listCheckpoints(s);
    await rewindTo(s, cps[1]!.boundary);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("restores files edited by nested (subagent/workflow) agents", async () => {
    // Regression: fleet/subagent edits happen in ephemeral sessions, so their
    // diffs used to be invisible to rewind. They are now promoted to the
    // parent as file_change records.
    const s = SessionStore.createEphemeral(tmp);
    const file = path.join(tmp, "fleet.txt");
    fs.writeFileSync(file, "before");
    s.append({ type: "user", id: "u", text: "run fleet", ts: Date.now() });
    s.append({ type: "assistant", id: "a", text: "", reasoning: "", toolCalls: [], ts: Date.now() });
    s.recordFileChange({ path: file, oldText: "before", newText: "after" });
    fs.writeFileSync(file, "after");

    const cps = listCheckpoints(s);
    expect(cps[0]!.fileChanges).toBe(1);
    await rewindTo(s, cps[0]!.boundary);
    expect(fs.readFileSync(file, "utf8")).toBe("before");
  });
});
