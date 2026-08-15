import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileEdit,
  FilePlus,
  FileText,
  ListTodo,
  Loader2,
  Search,
  ShieldX,
  SquareTerminal,
  X,
} from "lucide-react";
import type { TranscriptItem } from "@whalex/shared";
import { DiffView } from "./DiffView";

type ToolItem = Extract<TranscriptItem, { kind: "tool" }>;

const ICONS: Record<string, typeof FileText> = {
  read_file: FileText,
  write_file: FilePlus,
  edit_file: FileEdit,
  execute: SquareTerminal,
  glob: Search,
  grep: Search,
  todo_write: ListTodo,
};

function argSummary(item: ToolItem): string {
  const args = item.args as Record<string, unknown> | null;
  if (!args || typeof args !== "object") return "";
  if (typeof args.path === "string") return args.path;
  if (typeof args.command === "string") return args.command;
  if (typeof args.pattern === "string") return String(args.pattern);
  return "";
}

const PREVIEW_LINES = 8;

export const ToolCallCard = memo(function ToolCallCard({ item }: { item: ToolItem }) {
  const { t } = useTranslation();
  const running = item.state === "running";
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const Icon = ICONS[item.toolName] ?? SquareTerminal;
  const summary = argSummary(item);
  const lines = item.output.split("\n");
  const shown = expanded ? lines : lines.slice(0, PREVIEW_LINES);
  const hasMore = lines.length > PREVIEW_LINES;

  return (
    <div
      className={`my-1 rounded-lg border text-[13px] ${
        item.state === "error"
          ? "border-danger/40 bg-danger-soft/40"
          : "border-border bg-surface"
      }`}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
      >
        {open ? (
          <ChevronDown size={13} className="shrink-0 text-faint" />
        ) : (
          <ChevronRight size={13} className="shrink-0 text-faint" />
        )}
        <Icon size={14} className="shrink-0 text-muted" />
        <span className="shrink-0 font-medium">{item.toolName}</span>
        {summary && (
          <span className="truncate font-mono text-[12px] text-muted" title={summary}>
            {summary}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11.5px] text-faint">
          {running && (
            <>
              <Loader2 size={13} className="animate-spin text-accent" />
              {t("tool.running")}
            </>
          )}
          {item.state === "ok" && (
            <>
              <Check size={13} className="text-ok" />
              {item.durationMs > 0 && `${(item.durationMs / 1000).toFixed(1)}s`}
            </>
          )}
          {item.state === "error" && <X size={13} className="text-danger" />}
          {item.state === "denied" && <ShieldX size={13} className="text-warn" />}
        </span>
      </button>

      {item.diff && (
        <div className="px-3 pb-2">
          <DiffView
            path={item.diff.path}
            oldText={item.diff.oldText}
            newText={item.diff.newText}
          />
        </div>
      )}

      {open && (
        <div className="border-t border-border px-3 py-2">
          {item.output && (
            <>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded bg-code-bg p-2 font-mono text-[12px] leading-relaxed text-muted">
                {shown.join("\n")}
              </pre>
              {hasMore && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="mt-1 text-[11.5px] text-accent hover:underline"
                >
                  {expanded ? t("tool.showLess") : `${t("tool.showMore")} (${lines.length})`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});
