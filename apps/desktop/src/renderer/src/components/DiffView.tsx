import { memo, useMemo } from "react";
import { diffLines } from "diff";

const MAX_DIFF_LINES = 400;

/** Read-only unified diff for file edits. */
export const DiffView = memo(function DiffView({
  path,
  oldText,
  newText,
}: {
  path: string;
  oldText: string;
  newText: string;
}) {
  const { rows, added, removed, truncated } = useMemo(() => {
    const parts = diffLines(oldText, newText);
    const rows: Array<{ type: "add" | "del" | "ctx"; text: string; no: number | null }> = [];
    let added = 0;
    let removed = 0;
    let oldNo = 1;
    let newNo = 1;
    for (const part of parts) {
      const lines = part.value.split("\n");
      if (lines[lines.length - 1] === "") lines.pop();
      for (const line of lines) {
        if (part.added) {
          rows.push({ type: "add", text: line, no: newNo++ });
          added++;
        } else if (part.removed) {
          rows.push({ type: "del", text: line, no: oldNo++ });
          removed++;
        } else {
          // Collapse long unchanged runs to 2 lines of context on each side.
          rows.push({ type: "ctx", text: line, no: newNo });
          oldNo++;
          newNo++;
        }
      }
    }
    // Trim context: keep ctx lines only near changes.
    const keep = new Set<number>();
    rows.forEach((r, i) => {
      if (r.type !== "ctx") {
        for (let d = -2; d <= 2; d++) keep.add(i + d);
      }
    });
    const compact: typeof rows = [];
    let skipping = false;
    rows.forEach((r, i) => {
      if (r.type !== "ctx" || keep.has(i)) {
        skipping = false;
        compact.push(r);
      } else if (!skipping) {
        skipping = true;
        compact.push({ type: "ctx", text: "⋯", no: null });
      }
    });
    return {
      rows: compact.slice(0, MAX_DIFF_LINES),
      added,
      removed,
      truncated: compact.length > MAX_DIFF_LINES,
    };
  }, [oldText, newText]);

  const fileName = path.split(/[\\/]/).pop() ?? path;

  return (
    <div className="my-1.5 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-1.5 font-mono text-[11.5px]">
        <span className="truncate text-muted" title={path}>
          {fileName}
        </span>
        <span className="text-ok">+{added}</span>
        <span className="text-danger">−{removed}</span>
      </div>
      <div className="max-h-80 overflow-auto font-mono text-[12px] leading-[1.5]">
        <table className="w-full border-collapse">
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                style={{
                  background:
                    row.type === "add"
                      ? "var(--diff-add-bg)"
                      : row.type === "del"
                        ? "var(--diff-del-bg)"
                        : undefined,
                }}
              >
                <td className="w-10 select-none border-r border-border px-2 text-right text-faint">
                  {row.no ?? ""}
                </td>
                <td className="w-5 select-none pl-2 text-faint">
                  {row.type === "add" ? "+" : row.type === "del" ? "−" : ""}
                </td>
                <td className="whitespace-pre-wrap break-all pl-1 pr-3">{row.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {truncated && (
          <div className="px-3 py-1 text-center text-[11px] text-faint">⋯ (truncated)</div>
        )}
      </div>
    </div>
  );
});
