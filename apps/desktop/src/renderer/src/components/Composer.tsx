import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, ListTodo, Square } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useSessionStore } from "../stores/sessionStore";

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

export function Composer() {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const status = useSessionStore((s) => s.status);
  const pendingPermission = useSessionStore((s) => s.pendingPermission);
  const send = useSessionStore((s) => s.send);
  const abort = useSessionStore((s) => s.abort);
  const model = useSessionStore((s) => s.model);
  const setModel = useSessionStore((s) => s.setModel);
  const models = useAppStore((s) => s.models);

  const running = status !== "idle";
  const canSend = text.trim().length > 0 && !running && !pendingPermission;

  const doSend = () => {
    if (!canSend) return;
    const value = text.trim();
    setText("");
    if (taRef.current) taRef.current.style.height = "auto";
    void send(value);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      doSend();
    }
  };

  const autoGrow = () => {
    const ta = taRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    }
  };

  const modelOptions =
    models.length > 0 ? models.map((m) => m.id) : [model];

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-4">
      <div className="rounded-xl border border-border bg-surface shadow-sm focus-within:border-border-strong">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autoGrow();
          }}
          onKeyDown={onKeyDown}
          placeholder={t("composer.placeholder")}
          rows={1}
          disabled={!!pendingPermission}
          className="block w-full resize-none bg-transparent px-4 pb-1 pt-3 text-[13.5px] outline-none placeholder:text-faint disabled:opacity-50"
        />
        <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1 text-[11.5px] text-muted outline-none hover:bg-surface-2"
            title={t("composer.model")}
          >
            {modelOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
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
              onClick={doSend}
              disabled={!canSend}
              className="rounded-lg bg-accent p-2 text-white transition-colors hover:bg-accent-hover disabled:opacity-30"
              aria-label={t("composer.send")}
            >
              <ArrowUp size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
