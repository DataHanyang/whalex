import { memo, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, CheckCheck, ChevronDown, ChevronRight, CircleAlert, Clock, FileCode2, FolderOpen, Minimize2, Pencil, Target, Trash2 } from "lucide-react";
import type { TranscriptItem } from "@whalex/shared";
import { useAppStore } from "../stores/appStore";
import { useSessionStore } from "../stores/sessionStore";
import { whalex } from "../lib/ipc";
import { StreamingMarkdown } from "./StreamingMarkdown";
import { ToolCallCard } from "./ToolCallCard";
import { PermissionCard } from "./PermissionCard";
import { WorkflowPanel } from "./WorkflowPanel";
import logoUrl from "../assets/logo.png";

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

/**
 * A message from the user. While it is still queued behind a running turn it
 * is editable and deletable — once the model has read it, neither is honest
 * any more, so the controls disappear with the unread badge.
 */
function UserMessage({ item }: { item: Extract<TranscriptItem, { kind: "user" }> }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const editPending = useSessionStore((s) => s.editPending);
  const cancelPending = useSessionStore((s) => s.cancelPending);
  const pending = item.delivery === "pending";

  // The badge can flip while the editor is open; an edit after that would
  // silently do nothing, so close it instead.
  useEffect(() => {
    if (!pending) setEditing(false);
  }, [pending]);

  if (editing) {
    return (
      <div className="transcript-item flex justify-end py-2.5">
        <div className="w-full max-w-[85%] rounded-2xl border border-accent bg-surface p-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            aria-label={t("transcript.editMessage")}
            className="w-full resize-y bg-transparent px-2 py-1 text-[13.5px] leading-relaxed outline-none"
          />
          <div className="mt-1 flex justify-end gap-1.5">
            <button
              onClick={() => {
                setDraft(item.text);
                setEditing(false);
              }}
              className="rounded-md border border-border px-2.5 py-1 text-[11.5px] text-muted hover:bg-surface-2"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={() => {
                void editPending(item.id, draft.trim());
                setEditing(false);
              }}
              disabled={draft.trim().length === 0}
              className="rounded-md bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
            >
              {t("common.save")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="transcript-item flex items-center justify-end gap-2 py-2.5">
      {item.delivery && (
        <div className="flex shrink-0 items-center gap-0.5">
          {pending && (
            <>
              <button
                onClick={() => {
                  setDraft(item.text);
                  setEditing(true);
                }}
                title={t("transcript.editMessage")}
                aria-label={t("transcript.editMessage")}
                className="rounded p-1 text-faint hover:bg-surface-2 hover:text-text"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={() => void cancelPending(item.id)}
                title={t("transcript.deleteMessage")}
                aria-label={t("transcript.deleteMessage")}
                className="rounded p-1 text-faint hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
          <span
            className={`ml-0.5 flex items-center gap-1 text-[10.5px] ${
              pending ? "text-warn" : "text-faint"
            }`}
          >
            {pending ? <Clock size={11} /> : <CheckCheck size={11} />}
            {t(`transcript.delivery.${item.delivery}`)}
          </span>
        </div>
      )}
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-[13.5px] leading-relaxed">
        {item.text}
      </div>
    </div>
  );
}

// Memoized: on every streaming delta the whole transcript array re-renders,
// but only the changed item's reference changes.
const Item = memo(function Item({ item }: { item: TranscriptItem }) {
  const { t } = useTranslation();
  switch (item.kind) {
    case "user":
      return <UserMessage item={item} />;
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
          <span className="ml-auto text-[11px] text-accent">{t("transcript.openPreview")}</span>
        </button>
      );
    }
    case "workflow":
      return (
        <div className="transcript-item">
          <WorkflowPanel workflowId={item.workflowId} name={item.name} />
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
          {t("transcript.compacted", { before: item.beforePct, after: item.afterPct })}
          <div className="h-px flex-1 bg-border" />
        </div>
      );
    case "todos":
      return null; // shown in the status area, not inline
    case "error":
      // Goal-loop progress reuses the error item shape but reads as info.
      if (item.code.startsWith("goal-")) {
        return (
          <div className="transcript-item my-2 flex items-center gap-2 text-[11.5px] text-accent">
            <div className="h-px flex-1 bg-accent/30" />
            <Target size={12} />
            {item.message}
            <div className="h-px flex-1 bg-accent/30" />
          </div>
        );
      }
      return (
        <div className="transcript-item my-1.5 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-[12.5px]">
          <CircleAlert size={15} className="mt-0.5 shrink-0 text-danger" />
          <div>
            {/* Unregistered codes fall back to the generic message instead of
                leaking the raw i18n key. */}
            <span className="font-medium text-danger">{t([`error.${item.code}`, "error.unknown"])}</span>
            <div className="mt-0.5 break-all text-muted">{item.message}</div>
          </div>
        </div>
      );
    default:
      return null;
  }
});

/**
 * Which greeting a blank session opens with. Six slots so late-night and
 * pre-dawn work get their own line instead of a cheerful "good evening".
 */
export function timeOfDay(hour: number): "dawn" | "morning" | "lunch" | "afternoon" | "evening" | "night" {
  if (hour < 5) return "dawn";
  if (hour < 11) return "morning";
  if (hour < 14) return "lunch";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

function EmptyState() {
  const { t } = useTranslation();
  const cwd = useSessionStore((s) => s.cwd);
  const startSession = useSessionStore((s) => s.startSession);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const slot = timeOfDay(new Date().getHours());

  // Setup no longer picks a project folder, so the very first launch lands
  // here with nothing open.
  const pickFolder = async () => {
    const res = await whalex.invoke("dialog:pickFolder", undefined);
    if (!res.path) return;
    await updateSettings({ defaultCwd: res.path });
    await startSession(res.path);
  };

  return (
    <div className="flex h-[62vh] flex-col items-center justify-center text-center">
      <img src={logoUrl} alt="" className="mb-4 h-24 w-24" />
      <div className="text-[26px] font-semibold tracking-tight">
        {t(`transcript.greet.${slot}`)}
      </div>
      <div className="mt-3 max-w-lg text-[15px] text-muted">
        {t(`transcript.greet.${slot}.sub`)}
      </div>
      {!cwd && (
        <div className="mt-7 w-full max-w-sm">
          <button
            onClick={() => void pickFolder()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13.5px] font-medium text-white hover:bg-accent-hover"
          >
            <FolderOpen size={15} />
            {t("transcript.pickFolder.button")}
          </button>
          <div className="mt-2 text-[12px] text-faint">{t("transcript.pickFolder.hint")}</div>
        </div>
      )}
    </div>
  );
}

export function Transcript() {
  const { t } = useTranslation();
  const transcript = useSessionStore((s) => s.transcript);
  const pendingPermission = useSessionStore((s) => s.pendingPermissions[0] ?? null);
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
        <div className="mx-auto max-w-4xl px-6 pb-6 pt-6">
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
          aria-label={t("transcript.jumpLatest")}
        >
          <ArrowDown size={15} />
        </button>
      )}
    </div>
  );
}
