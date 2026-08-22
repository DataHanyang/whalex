import type { TranscriptItem } from "@whalex/shared";

type ToolItem = Extract<TranscriptItem, { kind: "tool" }>;

/** A transcript entry, or a run of tool calls folded into one row. */
export type Row = TranscriptItem | { kind: "tool-group"; id: string; items: ToolItem[] };

/**
 * Folds consecutive tool calls together so the transcript reads as prose
 * punctuated by "Ran 3 commands, read 1 file" rather than a stack of cards.
 * Anything that isn't a tool breaks the run, which keeps the grouping honest:
 * work either happened between two sentences, or it didn't.
 */
export function toRows(transcript: TranscriptItem[]): Row[] {
  const rows: Row[] = [];
  let run: ToolItem[] = [];

  const flush = (): void => {
    if (run.length === 0) return;
    rows.push({ kind: "tool-group", id: `tools-${run[0]!.id}`, items: run });
    run = [];
  };

  for (const item of transcript) {
    if (item.kind === "tool") run.push(item);
    else {
      flush();
      rows.push(item);
    }
  }
  flush();
  return rows;
}
