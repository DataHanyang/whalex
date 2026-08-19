import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, AtSign, Cpu, FolderOpen, Paperclip, ImageIcon, ListTodo, Loader2, Shield, Sparkles, Square, Target, X } from "lucide-react";
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
  const [image, setImage] = useState<string | null>(null);
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

  const onAttach = (file: File) => {
    if (file.type.startsWith("image/")) {
      readImageFile(file);
      return;
    }
    // Non-image files ride along as a path mention the tools can read.
    // File.path was removed in Electron 32+; the preload bridge exposes
    // webUtils.getPathForFile instead (legacy .path kept as a fallback).
    let p: string | undefined;
    try {
      p = whalex.getPathForFile?.(file);
    } catch {
      // not a file-backed File; fall through to the legacy property
    }
    p ||= (file as File & { path?: string }).path;
    if (p) setText((t0) => (t0 ? `${t0} @${p}` : `@${p}`));
  };
  const newSession = useSessionStore((s) => s.startSession);

  const running = status !== "idle";
  // Sending while a run is active is allowed — it steers the running agent.
  const canSend = (text.trim().length > 0 || !!image) && !pendingPermission && !describing;

  const readImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  };
  const onPaste = (e: React.ClipboardEvent) => {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (file) {
      e.preventDefault();
      readImageFile(file);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      readImageFile(file);
    }
  };

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
    if (slashMatch && !image) {
      const name = slashMatch[1]!;
      const cmd = commandsRef.current.find((c) => c.name === name);
      if (cmd?.source === "builtin") {
        setText("");
        await runBuiltinCommand(name);
        return;
      }
    }

    let finalText = value;
    if (image) {
      // DeepSeek is text-only: describe the image via the vision sidecar and
      // inject the description. No bridge configured → tell the user. The
      // finally guarantees `describing` never sticks and locks the composer.
      setDescribing(true);
      try {
        const res = await whalex.invoke("vision:describe", {
          imageDataUrl: image,
          question: value || undefined,
        });
        if (!res.configured) {
          finalText = `${value}\n\n[An image was attached but no vision model is configured. Connect one in Settings → Models → Vision.]`;
        } else if (res.ok && res.description) {
          finalText = `${value ? value + "\n\n" : ""}[Attached image description]\n${res.description}`;
        } else {
          finalText = `${value}\n\n[Image analysis failed: ${res.error ?? "unknown"}]`;
        }
      } catch (e) {
        finalText = `${value}\n\n[Image analysis failed: ${e instanceof Error ? e.message : String(e)}]`;
      } finally {
        setDescribing(false);
      }
      setImage(null);
    }

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

  const MODES = ["default", "acceptEdits", "plan", "bypassPermissions"] as const;
  const MODE_LABEL: Record<string, string> = {
    default: t("mode.default"),
    acceptEdits: t("mode.acceptEdits"),
    plan: t("mode.plan"),
    bypassPermissions: t("mode.bypassPermissions"),
  };
  // Auto mode approves everything, so it is tinted as a warning; plan is
  // read-only and tinted as informational.
  const MODE_OPTIONS = MODES.map((m) => ({
    value: m,
    tone: m === "bypassPermissions" ? ("warn" as const)
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
      {notice && (
        <div className="px-1 pb-1 text-[11.5px] text-warn" role="status">
          {notice}
        </div>
      )}
      <div
        className="relative rounded-xl border border-border bg-surface shadow-sm focus-within:border-border-strong"
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {image && (
          <div className="flex items-center gap-2 px-4 pt-3">
            <div className="relative">
              <img src={image} alt="attachment" className="h-14 w-14 rounded-md border border-border object-cover" />
              <button
                onClick={() => setImage(null)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-surface-2 p-0.5 text-faint hover:text-danger"
              >
                <X size={12} />
              </button>
            </div>
            <span className="flex items-center gap-1 text-[11.5px] text-faint">
              <ImageIcon size={12} /> {t("composer.image")}
            </span>
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
            <span className="max-w-[240px] truncate">{cwd ? (cwd.split(/[\/]/).pop() ?? cwd) : t("sidebar.changeFolder")}</span>
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
          onPaste={onPaste}
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
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onAttach(f);
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
