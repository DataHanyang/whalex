import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ChevronDown, ChevronRight, CircleAlert, FileCode2, Minimize2 } from "lucide-react";
import type { TranscriptItem } from "@whalex/shared";
import { useSessionStore } from "../stores/sessionStore";
import { StreamingMarkdown } from "./StreamingMarkdown";
import { ToolCallCard } from "./ToolCallCard";
import { PermissionCard } from "./PermissionCard";
import { WorkflowPanel } from "./WorkflowPanel";

function Reasoning({ text }: { text: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className="mb-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11.5px] text-faint hover:text-muted"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {t("transcript.reasoning")}
      </button>
      {open && (
        <div className="mt-1 border-l-2 border-border pl-3 text-[12.5px] leading-relaxed text-muted">
          {text}
        </div>
      )}
    </div>
  );
}

function Item({ item }: { item: TranscriptItem }) {
  const { t } = useTranslation();
  switch (item.kind) {
    case "user":
      return (
        <div className="transcript-item flex justify-end py-2.5">
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-[13.5px] leading-relaxed">
            {item.text}
          </div>
        </div>
      );
    case "assistant":
      return (
        <div className="transcript-item py-2 text-[13.5px]">
          <Reasoning text={item.reasoning} />
          {item.text ? (
            <StreamingMarkdown text={item.text} streaming={item.streaming} />
          ) : item.streaming && !item.reasoning ? (
            <div className="flex gap-1 py-1">
              <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-muted" />
              <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-muted" />
              <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-muted" />
            </div>
          ) : null}
          {item.interrupted && (
            <div className="mt-1 text-[11.5px] italic text-faint">
              {t("transcript.interrupted")}
            </div>
          )}
        </div>
      );
    case "tool":
      return (
        <div className="transcript-item">
          <ToolCallCard item={item} />
        </div>
      );
    case "artifact": {
      const open = useSessionStore.getState().openArtifact;
      return (
        <button
          onClick={() => open(item.artifactId)}
          className="transcript-item my-1 flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-[13px] hover:border-accent"
        >
          <FileCode2 size={15} className="text-accent" />
          <span className="font-medium">{item.title}</span>
          <span className="text-[11px] text-faint">{item.artifactKind}</span>
          <span className="ml-auto text-[11px] text-accent">미리보기 열기 →</span>
        </button>
      );
    }
    case "workflow":
      return (
        <div className="transcript-item">
          <WorkflowPanel workflowId={item.workflowId} />
        </div>
      );
    case "subagent":
      return (
        <div className="transcript-item my-1 rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px]">
          <div className="flex items-center gap-2">
            <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent">
              {item.agentType}
            </span>
            <span className="font-medium">{item.label}</span>
            <span className="ml-auto text-[11px] text-faint">
              {item.toolCount} tools · {item.tokens} tok
            </span>
          </div>
          {item.result && <div className="mt-1 line-clamp-3 text-muted">{item.result}</div>}
        </div>
      );
    case "compaction":
      return (
        <div className="transcript-item my-2 flex items-center gap-2 text-[11.5px] text-faint">
          <div className="h-px flex-1 bg-border" />
          <Minimize2 size={12} />
          컨텍스트 압축됨 {item.beforePct}% → {item.afterPct}%
          <div className="h-px flex-1 bg-border" />
        </div>
      );
    case "todos":
      return null; // shown in the status area, not inline
    case "error":
      return (
        <div className="transcript-item my-1.5 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-[12.5px]">
          <CircleAlert size={15} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <span className="font-medium text-danger">{t(`error.${item.code}`)}</span>
            <div className="mt-0.5 break-all text-muted">{item.message}</div>
          </div>
        </div>
      );
    default:
      return null;
  }
}

function EmptyState() {
  const { t } = useTranslation();
  const send = useSessionStore((s) => s.send);
  const status = useSessionStore((s) => s.status);
  const examples = [
    t("transcript.example1"),
    t("transcript.example2"),
    t("transcript.example3"),
  ];
  return (
    <div className="flex h-[62vh] flex-col items-center justify-center text-center">
      <div className="mb-1 text-3xl">🐋</div>
      <div className="text-lg font-semibold">{t("transcript.empty.title")}</div>
      <div className="mt-2 max-w-md text-[13px] text-muted">{t("transcript.empty.subtitle")}</div>
      <div className="mt-5 flex w-full max-w-md flex-col gap-2">
        {examples.map((ex) => (
          <button
            key={ex}
            disabled={status !== "idle"}
            onClick={() => void send(ex)}
            className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-left text-[13px] text-muted transition-colors hover:border-accent hover:text-text disabled:opacity-50"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Transcript() {
  const { t } = useTranslation();
  const transcript = useSessionStore((s) => s.transcript);
  const pendingPermission = useSessionStore((s) => s.pendingPermission);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [transcript, pendingPermission]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    pinnedRef.current = atBottom;
    setShowJump(!atBottom);
  };

  const jump = () => {
    const el = scrollRef.current;
    if (el) {
      pinnedRef.current = true;
      el.scrollTop = el.scrollHeight;
      setShowJump(false);
    }
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 pb-6 pt-6">
          {transcript.length === 0 ? (
            <EmptyState />
          ) : (
            transcript.map((item) => <Item key={item.id} item={item} />)
          )}
          {pendingPermission && <PermissionCard request={pendingPermission} />}
        </div>
      </div>
      {showJump && (
        <button
          onClick={jump}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface p-2 shadow-md hover:bg-surface-2"
          aria-label="Jump to latest"
        >
          <ArrowDown size={15} />
        </button>
      )}
    </div>
  );
}
