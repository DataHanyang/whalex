import { useTranslation } from "react-i18next";
import { FolderOpen, MessageSquare, Plus, Settings, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSessionStore } from "../stores/sessionStore";
import { useAppStore } from "../stores/appStore";
import { useUiStore } from "../stores/uiStore";
import { whalex } from "../lib/ipc";

function timeAgo(ts: number, lang: string): string {
  const diff = Date.now() - ts;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

export function Sidebar() {
  const { t, i18n } = useTranslation();
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeSessionId);
  const cwd = useSessionStore((s) => s.cwd);
  const startSession = useSessionStore((s) => s.startSession);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const [pendingDelete, setPendingDeleteRaw] = useState<{ sessionId: string; cwd: string; title: string } | null>(null);
  const setConfirmOpen = useUiStore((st) => st.setConfirmOpen);
  // The native browser view paints above the DOM, so it must be told to
  // yield while the confirm dialog is up.
  const setPendingDelete = (v: { sessionId: string; cwd: string; title: string } | null) => {
    setPendingDeleteRaw(v);
    setConfirmOpen(v !== null);
  };
  const refreshSessions = useSessionStore((st) => st.refreshSessions);
  useEffect(() => {
    const id = setInterval(() => void refreshSessions(), 10_000);
    return () => clearInterval(id);
  }, [refreshSessions]);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const openSettings = useUiStore((s) => s.openSettings);

  const changeFolder = async () => {
    const res = await whalex.invoke("dialog:pickFolder", undefined);
    if (res.path) {
      await updateSettings({ defaultCwd: res.path });
      await startSession(res.path);
    }
  };

  // Nothing open yet (a fresh install has no folder) — ask for one first
  // instead of doing nothing.
  const newSession = () => {
    if (cwd) void startSession(cwd);
    else void changeFolder();
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="px-3 pb-2.5 pt-3">
        <button
          onClick={newSession}
          className="flex w-full items-center gap-2 rounded-md bg-accent px-3 py-2 text-[12.5px] font-medium text-white hover:bg-accent-hover"
        >
          <Plus size={14} />
          {t("sidebar.newSession")}
        </button>
      </div>
      <div className="px-3.5 pb-1.5 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
        {t("sidebar.sessions")}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2">
        {sessions.length === 0 && (
          <div className="px-2 py-3 text-[12px] text-faint">{t("sidebar.empty")}</div>
        )}
        {[...new Set(sessions.map((x) => x.cwd))].map((groupCwd) => (
          <div key={groupCwd} className="group/proj">
            <div
              className="flex items-center gap-1.5 px-2 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-faint"
              title={groupCwd}
            >
              <FolderOpen size={10} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{groupCwd.split(/[\\/]/).pop()}</span>
              <button
                onClick={() => void startSession(groupCwd)}
                className="shrink-0 rounded p-0.5 text-faint opacity-0 transition-opacity hover:bg-surface-2 hover:text-text group-hover/proj:opacity-100"
                title={t("sidebar.newSessionHere")}
              >
                <Plus size={12} />
              </button>
            </div>
            {sessions.filter((x) => x.cwd === groupCwd).map((s) => (
          <div
            key={s.sessionId}
            onClick={() => void startSession(s.cwd, s.sessionId)}
            className={`group mb-1 flex w-full cursor-pointer flex-col rounded-lg px-3 py-2 text-left hover:bg-surface-2 ${
              s.sessionId === activeId ? "bg-accent-soft" : ""
            }`}
          >
            <div className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
              {s.running ? (
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
              ) : (
                <MessageSquare size={12} className="shrink-0 text-faint" />
              )}
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDelete({ sessionId: s.sessionId, cwd: s.cwd, title: s.title });
                }}
                className="shrink-0 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                title={t("sidebar.delete")}
              >
                <Trash2 size={12} />
              </button>
            </div>
            <span className="mt-0.5 pl-[18px] text-[11px] text-faint">
              {timeAgo(s.updatedAt, i18n.language)}
            </span>
          </div>
            ))}
          </div>
        ))}
      </div>
      <button
        onClick={() => openSettings("general")}
        className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-[12.5px] text-muted hover:bg-surface-2"
      >
        <Settings size={14} />
        {t("sidebar.settings")}
      </button>
      {pendingDelete && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="w-[340px] rounded-xl border border-border bg-surface p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center gap-2 text-[13.5px] font-semibold">
              <Trash2 size={15} className="text-danger" />
              {t("sidebar.delete")}
            </div>
            <p className="mb-1 truncate text-[12.5px] text-muted">{pendingDelete.title}</p>
            <p className="mb-3 text-[12px] text-faint">{t("sidebar.deleteConfirm")}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] text-muted hover:bg-surface-2"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => {
                  void deleteSession(pendingDelete.sessionId, pendingDelete.cwd);
                  setPendingDelete(null);
                }}
                className="rounded-lg bg-danger px-3 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90"
              >
                {t("sidebar.delete")}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </aside>
  );
}
