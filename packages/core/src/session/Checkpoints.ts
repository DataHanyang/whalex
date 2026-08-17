import fs from "node:fs/promises";
import type { SessionStore } from "./SessionStore.js";

export interface Checkpoint {
  /** Position in the effective-record list where this user turn begins. */
  boundary: number;
  ts: number;
  label: string;
  /** Number of file changes made during/after this checkpoint's turn. */
  fileChanges: number;
}

/**
 * Checkpoints are derived from the session, not stored separately: each user
 * message starts one, and every file-editing tool result carries the file's
 * pre-edit content (diff.oldText). Rewinding restores files to their state at
 * the chosen checkpoint and truncates the conversation back to it.
 */
export function listCheckpoints(session: SessionStore): Checkpoint[] {
  const records = session.effectiveRecords();
  const checkpoints: Checkpoint[] = [];
  records.forEach((rec, i) => {
    if (rec.type === "user") {
      checkpoints.push({
        boundary: i,
        ts: rec.ts,
        label: rec.text.replace(/\s+/g, " ").trim().slice(0, 60),
        fileChanges: 0,
      });
    } else if (
      ((rec.type === "tool_result" && rec.diff) || rec.type === "file_change") &&
      checkpoints.length > 0
    ) {
      checkpoints[checkpoints.length - 1]!.fileChanges++;
    }
  });
  return checkpoints;
}

/**
 * Restore every file to its content as of `boundary`, then rewind the
 * conversation. For each file, the correct pre-state is the oldText from the
 * earliest edit at or after the boundary.
 */
export async function rewindTo(
  session: SessionStore,
  boundary: number,
): Promise<{ restored: string[] }> {
  const records = session.effectiveRecords();
  const toRestore = new Map<string, string>(); // path → oldText (earliest wins)
  for (let i = boundary; i < records.length; i++) {
    const rec = records[i];
    const diff =
      rec && rec.type === "tool_result"
        ? rec.diff
        : rec && rec.type === "file_change"
          ? rec
          : undefined;
    if (diff && !toRestore.has(diff.path)) toRestore.set(diff.path, diff.oldText);
  }
  const restored: string[] = [];
  for (const [path, oldText] of toRestore) {
    try {
      if (oldText === "") {
        // File was newly created after the checkpoint — remove it.
        await fs.rm(path, { force: true });
      } else {
        await fs.writeFile(path, oldText, "utf8");
      }
      restored.push(path);
    } catch {
      // best effort — a missing/locked file shouldn't abort the rewind
    }
  }
  session.rewindTo(boundary);
  return { restored };
}
