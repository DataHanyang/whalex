import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ChevronDown, ChevronRight, CircleAlert } from "lucide-react";
import type { TranscriptItem } from "@whalex/shared";
import { useSessionStore } from "../stores/sessionStore";
import { StreamingMarkdown } from "./StreamingMarkdown";
import { ToolCallCard } from "./ToolCallCard";
import { PermissionCard } from "./PermissionCard";

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
        <div className="transcript-item flex justify-end py-1.5">
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent-soft px-4 py-2 text-[13.5px]">
            {item.text}
          </div>
        </div>
      );
    case "assistant":
      return (
        <div className="transcript-item py-1.5 text-[13.5px]">
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
        <div className="mx-auto max-w-3xl px-5 pb-4 pt-3">
          {transcript.length === 0 ? (
            <div className="flex h-[60vh] flex-col items-center justify-center text-center">
              <div className="text-lg font-semibold">{t("transcript.empty.title")}</div>
              <div className="mt-2 max-w-md text-[13px] text-muted">
                {t("transcript.empty.subtitle")}
              </div>
            </div>
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
