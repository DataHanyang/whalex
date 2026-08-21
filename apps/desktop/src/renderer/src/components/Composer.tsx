import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, AtSign, Cpu, FileText, FolderOpen, Paperclip, ListTodo, Loader2, Shield, Sparkles, Square, Target, X } from "lucide-react";
import { Picker } from "./Picker";
import { EffortControl, type EffortLevel } from "./EffortControl";
import type { FileMatch, SlashCommand } from "@whalex/shared";
import { useAppStore } from "../stores/appStore";
import { useSessionStore } from "../stores/sessionStore";
import { useUiStore } from "../stores/uiStore";
import { whalex } from "../lib/ipc";

function TodoChips() {
  const todos = useSessionStore((s) => s.todos);
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (todos.length === 0) return null;
  const done = todos.filter((td) => td.status === "completed").length;
  const current = todos.find((td) => td.status === "in_progress");
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11.5px] text-muted hover:bg-surface-2"
      >
        <ListTodo size={12} />
        {done}/{todos.length}
        {current && <span className="max-w-48 truncate">· {current.content}</span>}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-10 mb-1.5 w-72 rounded-lg border border-border bg-surface p-2 shadow-lg">
          <div className="mb-1 text-[11px] font-medium text-faint">{t("todos.title")}</div>
          {todos.map((td, i) => (
            <div key={i} className="flex items-start gap-2 py-0.5 text-[12.5px]">
              <span className="mt-0.5">
                {td.status === "completed" ? "✅" : td.status === "in_progress" ? "🔄" : "⬜"}
              </span>
              <span className={td.status === "completed" ? "text-faint line-through" : ""}>
                {td.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Something queued to go out with the next message. Images ride to the vision
 * sidecar as data URLs (a pasted screenshot has no path at all); files ride as
 * a path the tools can open. Either way the chip carries them, not the input
 * box — an absolute path pasted into the text is noise the user has to edit
 * around.
 */
type Attachment =
  | { id: string; kind: "image"; name: string; dataUrl: string; path?: string }
  | { id: string; kind: "file"; name: string; path: string };

interface Autocomplete {
  kind: "slash" | "mention";
  items: Array<{ label: string; sub: string }>;
  from: number; // index in text where the token starts (after / or @)
  sel: number;
}

export function Composer() {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [ac, setAc] = useState<Autocomplete | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const showNotice = (msg: string) => {
    setNotice(msg);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  };
  const taRef = useRef<HTMLTextAreaElement>(null);
  const status = useSessionStore((s) => s.status);
  const pendingPermission = useSessionStore((s) => s.pendingPermissions[0] ?? null);
  const send = useSessionStore((s) => s.send);
  const abort = useSessionStore((s) => s.abort);
  const model = useSessionStore((s) => s.model);
  const setModel = useSessionStore((s) => s.setModel);
  const superCode = useSessionStore((s) => s.superCode);
  const setSuperCode = useSessionStore((s) => s.setSuperCode);
  const permissionMode = useSessionStore((s) => s.permissionMode);
  const setPermissionMode = useSessionStore((s) => s.setPermissionMode);
  const goalMode = useSessionStore((s) => s.goalMode);
  const setGoalMode = useSessionStore((s) => s.setGoalMode);
  const cwd = useSessionStore((s) => s.cwd);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const models = useAppStore((s) => s.models);
  const reasoningEffort = useAppStore((s) => s.settings?.reasoningEffort ?? "medium");
  const updateSettings = useAppStore((s) => s.updateSettings);
  const modelSupportsReasoning = models.find((m) => m.id === model)?.supportsReasoning ?? false;
  const openSettings = useUiStore((s) => s.openSettings);
  const composerDraft = useUiStore((s) => s.composerDraft);
  const setComposerDraft = useUiStore((s) => s.setComposerDraft);
  const fileRef = useRef<HTMLInputElement>(null);

  // Another surface (plan Revise) pushed text here: adopt it and take focus.
  useEffect(() => {
    if (composerDraft === null) return;
    setText(composerDraft);
    setComposerDraft(null);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    });
  }, [composerDraft, setComposerDraft]);

  // File.path was removed in Electron 32+; the preload bridge exposes
  // webUtils.getPathForFile instead (legacy .path kept as a fallback).
  const pathOf = (file: File): string | undefined => {
    try {
      const p = whalex.getPathForFile?.(file);
      if (p) return p;
    } catch {
      // not a file-backed File (a dragged browser image, say) — fall through
    }
    return (file as File & { path?: string }).path;
  };

  const addAttachment = (a: Attachment) => setAttachments((list) => [...list, a]);
  const removeAttachment = (id: string) =>
    setAttachments((list) => list.filter((a) => a.id !== id));

  const readImageFile = (file: File, index: number) => {
    // A pasted screenshot has no path at all; a dropped one does, and the chip
    // shows it on hover the same way a file chip does.
    const path = pathOf(file);
    const reader = new FileReader();
    reader.onload = () =>
      addAttachment({
        id: `${Date.now()}-${index}-${file.name}`,
        kind: "image",
        name: file.name || "image",
        dataUrl: reader.result as string,
        ...(path ? { path } : {}),
      });
    reader.readAsDataURL(file);
  };

  // One entry point for the paperclip, drops and pastes.
  const attachFiles = (files: File[]) => {
    let skipped = 0;
    files.forEach((file, i) => {
      if (file.type.startsWith("image/")) {
        readImageFile(file, i);
        return;
      }
      const path = pathOf(file);
      // A non-image with no path (dragged out of a web page, say) is nothing
      // the tools could open — say so instead of attaching an empty chip.
      if (!path) {
        skipped += 1;
        return;
      }
      addAttachment({
        id: `${Date.now()}-${i}-${file.name}`,
        kind: "file",
        name: file.name || path.split(/[\\/]/).pop() || path,
        path,
      });
    });
    if (skipped > 0) showNotice(t("composer.drop.noPath"));
  };
  const newSession = useSessionStore((s) => s.startSession);

  const running = status !== "idle";
  // Sending while a run is active is allowed — it steers the running agent.
  const canSend =
    (text.trim().length > 0 || attachments.length > 0) && !pendingPermission && !describing;

  /**
   * Files on the clipboard, however the OS chose to expose them: a screenshot
   * arrives as a bare image blob under `items`, files copied in the file
   * manager arrive under `files`. Returns [] for a plain text paste, which is
   * the signal to leave the event alone.
   */
  const clipboardFiles = (dt: DataTransfer): File[] => {
    const files = [...dt.files];
    if (files.length > 0) return files;
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i]!;
      if (item.kind !== "file") continue;
      const f = item.getAsFile();
      if (f) files.push(f);
    }
    return files;
  };
  // Drops are handled on the window, not just the textarea: anywhere in the
  // app is a target, and preventing the default stops Electron from
  // navigating away to the dropped file. attachFiles is re-read from a ref so
  // the listeners can be registered once.
  const attachRef = useRef(attachFiles);
  attachRef.current = attachFiles;
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    // dragenter/dragleave fire per element crossed, so depth-count instead of
    // clearing on the first leave (which would flicker over every child).
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!hasFiles(e)) return;
      e.preventDefault();
      attachRef.current([...(e.dataTransfer?.files ?? [])]);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const files = clipboardFiles(e.clipboardData);
      // No files on the clipboard — it is a text paste, so let it through.
      if (files.length === 0) return;
      e.preventDefault();
      attachRef.current(files);
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const commandsRef = useRef<SlashCommand[]>([]);
  useEffect(() => {
    void whalex.invoke("commands:list", { cwd: cwd ?? undefined }).then((c) => {
      commandsRef.current = c;
    });
  }, [cwd]);

  const runBuiltinCommand = async (name: string): Promise<boolean> => {
    if (name === "settings" || name === "mcp" || name === "skills") {
      openSettings(name === "mcp" ? "mcp" : name === "skills" ? "skills" : "general");
      return true;
    }
    if (name === "clear") {
      if (cwd) await newSession(cwd);
      return true;
    }
    if (name === "supercode") {
      setSuperCode(!superCode);
      return true;
    }
    if (name === "rewind") {
      useUiStore.getState().openRewind();
      return true;
    }
    if (name === "compact" && activeSessionId) {
      const res = await whalex.invoke("session:command", { sessionId: activeSessionId, command: "compact" });
      if (!res.handled) showNotice(res.message ?? t("composer.compactUnavailable"));
      return res.handled;
    }
    if (name === "help") {
      openSettings("general");
      return true;
    }
    return false;
  };

  const doSend = async () => {
    if (!canSend) return;
    const value = text.trim();
    // A lone slash command runs directly instead of being sent as a message.
    const slashMatch = /^\/(\w[\w-]*)\s*$/.exec(value);
    if (slashMatch && attachments.length === 0) {
      const name = slashMatch[1]!;
      const cmd = commandsRef.current.find((c) => c.name === name);
      if (cmd?.source === "builtin") {
        setText("");
        await runBuiltinCommand(name);
        return;
      }
    }

    let finalText = value;
    const images = attachments.flatMap((a) => (a.kind === "image" ? [a] : []));
    const files = attachments.flatMap((a) => (a.kind === "file" ? [a] : []));

    // Files go out as @path mentions appended to the message the model reads,
    // so the chip stays a chip and the sent bubble still shows what was shared.
    if (files.length > 0) {
      const mentions = files.map((f) => `@${f.path}`).join(" ");
      finalText = finalText ? `${finalText}\n\n${mentions}` : mentions;
    }

    if (images.length > 0) {
      // DeepSeek is text-only: each image goes through the vision sidecar and
      // comes back as text. No bridge configured → say so once. The finally
      // guarantees `describing` never sticks and locks the composer.
      setDescribing(true);
      const parts: string[] = [];
      try {
        for (const img of images) {
          const res = await whalex.invoke("vision:describe", {
            imageDataUrl: img.dataUrl,
            question: value || undefined,
          });
          if (!res.configured) {
            parts.push(
              "[An image was attached but no vision model is configured. Connect one in Settings → Models → Vision.]",
            );
            break;
          }
          parts.push(
            res.ok && res.description
              ? `[Attached image: ${img.name}]\n${res.description}`
              : `[Image analysis failed for ${img.name}: ${res.error ?? "unknown"}]`,
          );
        }
      } catch (e) {
        parts.push(`[Image analysis failed: ${e instanceof Error ? e.message : String(e)}]`);
      } finally {
        setDescribing(false);
      }
      finalText = [finalText, ...parts].filter(Boolean).join("\n\n");
    }
    setAttachments([]);

    setText("");
    setAc(null);
    if (taRef.current) taRef.current.style.height = "auto";
    void send(finalText);
  };

  // Guards against out-of-order files:search responses: only the newest
  // request may write into the autocomplete state.
  const acSeqRef = useRef(0);
  const updateAutocomplete = async (value: string, caret: number) => {
    const seq = ++acSeqRef.current;
    const before = value.slice(0, caret);
    const slash = /(?:^|\s)\/(\w*)$/.exec(before);
    const mention = /(?:^|\s)@([^\s]*)$/.exec(before);
    if (slash && caret <= value.length) {
      const q = slash[1]!.toLowerCase();
      const items = commandsRef.current
        .filter((c) => c.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map((c) => ({ label: `/${c.name}`, sub: `${c.description} · ${c.source}` }));
      setAc(items.length ? { kind: "slash", items, from: before.length - slash[1]!.length, sel: 0 } : null);
    } else if (mention && cwd) {
      const q = mention[1]!;
      const matches: FileMatch[] = await whalex.invoke("files:search", { cwd, query: q, limit: 8 });
      if (seq !== acSeqRef.current) return; // a newer keystroke superseded us
      const items = matches.map((m) => ({ label: `@${m.relPath}`, sub: m.isDir ? "folder" : "file" }));
      setAc(items.length ? { kind: "mention", items, from: before.length - mention[1]!.length, sel: 0 } : null);
    } else {
      setAc(null);
    }
  };

  const applyAutocomplete = (item: { label: string; sub: string }) => {
    const ta = taRef.current;
    if (!ta || !ac) return;
    const caret = ta.selectionStart;
    const prefix = text.slice(0, ac.from - 1); // drop the / or @
    const rest = text.slice(caret);
    const inserted = item.label + " ";
    const next = prefix + inserted + rest;
    setText(next);
    setAc(null);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = (prefix + inserted).length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const MODES = ["default", "acceptEdits", "plan", "bypassPermissions", "unrestricted"] as const;
  const MODE_LABEL: Record<string, string> = {
    default: t("mode.default"),
    acceptEdits: t("mode.acceptEdits"),
    plan: t("mode.plan"),
    bypassPermissions: t("mode.bypassPermissions"),
    unrestricted: t("mode.unrestricted"),
  };
  // Auto mode approves everything, so it is tinted as a warning; unrestricted
  // additionally runs destructive commands and is tinted as a danger; plan is
  // read-only and tinted as informational.
  const MODE_OPTIONS = MODES.map((m) => ({
    value: m,
    tone: m === "unrestricted" ? ("danger" as const)
      : m === "bypassPermissions" ? ("warn" as const)
      : m === "plan" ? ("accent" as const) : ("default" as const),
  }));
  const modelHint = (m?: { contextWindow?: number; supportsReasoning?: boolean }) => {
    if (!m) return undefined;
    const ctx = m.contextWindow ? `${Math.round(m.contextWindow / 1000)}K context` : "";
    return [ctx, m.supportsReasoning ? "reasoning" : ""].filter(Boolean).join(" · ");
  };

  const cycleMode = () => {
    const i = MODES.indexOf(permissionMode as (typeof MODES)[number]);
    setPermissionMode(MODES[(i + 1) % MODES.length] ?? "default");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Shift+Tab cycles the permission mode (Claude Code parity).
    // While SuperCode manages the mode, the shortcut must not bypass the lock
    // the pickers already enforce.
    if (e.key === "Tab" && e.shiftKey && !ac) {
      e.preventDefault();
      if (!superCode) cycleMode();
      return;
    }
    if (ac) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAc({ ...ac, sel: (ac.sel + 1) % ac.items.length });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAc({ ...ac, sel: (ac.sel - 1 + ac.items.length) % ac.items.length });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyAutocomplete(ac.items[ac.sel]!);
        return;
      }
      if (e.key === "Escape") {
        setAc(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void doSend();
    }
  };

  const autoGrow = () => {
    const ta = taRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    }
  };

  const modelOptions = models.length > 0 ? models.map((m) => m.id) : [model];

  return (
    <div className="mx-auto w-full max-w-4xl px-6 pb-5 pt-1">
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-accent bg-surface px-10 py-8 shadow-xl">
            <Paperclip size={22} className="text-accent" />
            <div className="text-[14px] font-semibold">{t("composer.drop.title")}</div>
            <div className="max-w-xs text-center text-[12px] text-muted">
              {t("composer.drop.hint")}
            </div>
          </div>
        </div>
      )}
      {notice && (
        <div className="px-1 pb-1 text-[11.5px] text-warn" role="status">
          {notice}
        </div>
      )}
      <div className="relative rounded-xl border border-border bg-surface shadow-sm focus-within:border-border-strong">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-3">
            {attachments.map((a) => (
              <div
                key={a.id}
                title={a.path ?? a.name}
                className="relative flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 py-1 pl-1 pr-6 text-[11.5px]"
              >
                {a.kind === "image" ? (
                  <img src={a.dataUrl} alt="" className="h-7 w-7 rounded object-cover" />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded bg-surface text-faint">
                    <FileText size={13} />
                  </span>
                )}
                <span className="max-w-[170px] truncate">{a.name}</span>
                <button
                  onClick={() => removeAttachment(a.id)}
                  aria-label={t("composer.removeAttachment")}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-faint hover:text-danger"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        {ac && (
          <div className="absolute bottom-full left-2 z-20 mb-1 max-h-64 w-96 overflow-auto rounded-lg border border-border bg-surface py-1 shadow-lg">
            {ac.items.map((item, i) => (
              <button
                key={item.label}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyAutocomplete(item);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${i === ac.sel ? "bg-accent-soft" : "hover:bg-surface-2"}`}
              >
                {ac.kind === "mention" ? (
                  <AtSign size={13} className="shrink-0 text-faint" />
                ) : (
                  <span className="shrink-0 text-faint">/</span>
                )}
                <span className="font-mono text-[12.5px]">{item.label}</span>
                <span className="ml-auto truncate text-[11px] text-faint">{item.sub}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center px-3 pt-2">
          <button
            type="button"
            onClick={async () => {
              const res = await whalex.invoke("dialog:pickFolder", undefined);
              if (res.path) void newSession(res.path);
            }}
            title={cwd ?? ""}
            className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] text-faint hover:bg-surface-2 hover:text-muted"
          >
            <FolderOpen size={11} className="shrink-0" />
            <span className="max-w-[240px] truncate">{cwd ? (cwd.split(/[\\/]/).pop() ?? cwd) : t("sidebar.changeFolder")}</span>
          </button>
        </div>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autoGrow();
            void updateAutocomplete(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={onKeyDown}
          placeholder={t("composer.placeholder")}
          rows={1}
          disabled={!!pendingPermission}
          className="block w-full resize-none bg-transparent px-4 pb-1 pt-3 text-[13.5px] outline-none placeholder:text-faint disabled:opacity-50"
        />
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 px-3 pb-2.5 pt-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title={t("composer.attach")}
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border border-border text-muted hover:bg-surface-2"
          >
            <Paperclip size={13} />
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              attachFiles([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <Picker
            value={model}
            onChange={setModel}
            locked={superCode}
            title={t("composer.model")}
            icon={<Cpu size={12} />}
            options={modelOptions.map((id) => ({
              value: id,
              label: models.find((m) => m.id === id)?.label ?? id,
              hint: modelHint(models.find((m) => m.id === id)),
            }))}
          />
          {modelSupportsReasoning && (
            // SuperCode pins the orchestrator to the deepest level; show that
            // instead of the ambient setting while it's on.
            <EffortControl
              value={superCode ? "max" : (reasoningEffort as EffortLevel)}
              locked={superCode}
              onChange={(v) => void updateSettings({ reasoningEffort: v })}
            />
          )}
          <Picker
            value={permissionMode}
            onChange={(m) => setPermissionMode(m as (typeof MODES)[number])}
            locked={superCode}
            title={t("composer.permTip")}
            options={MODE_OPTIONS.map((o) => ({
              ...o,
              label: MODE_LABEL[o.value] ?? o.value,
              hint: t(`mode.hint.${o.value}`),
              icon: <Shield size={12} />,
            }))}
          />
          <button
            onClick={() => setGoalMode(!goalMode)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] ${goalMode ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2"}`}
            title={t("composer.goalTip")}
          >
            <Target size={12} />
            {t("composer.goal")}
          </button>
          <button
            onClick={() => setSuperCode(!superCode)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] ${superCode ? "supercode-on" : "border-border text-muted hover:bg-surface-2"}`}
            title={t("composer.superCodeTip")}
          >
            <Sparkles size={12} />
            SuperCode
          </button>
          <TodoChips />
          <div className="flex-1" />
          {running ? (
            <button
              onClick={() => void abort()}
              className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-[12.5px] hover:bg-surface-2"
            >
              <Square size={12} fill="currentColor" />
              {t("composer.stop")} <span className="text-faint">Esc</span>
            </button>
          ) : (
            <button
              onClick={() => void doSend()}
              disabled={!canSend}
              className="rounded-lg bg-accent p-2 text-white transition-colors hover:bg-accent-hover disabled:opacity-30"
              aria-label={t("composer.send")}
            >
              {describing ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={15} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
