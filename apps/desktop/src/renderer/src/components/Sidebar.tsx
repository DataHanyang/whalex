import { useTranslation } from "react-i18next";
import { FolderOpen, MessageSquare, Plus, Settings, Trash2 } from "lucide-react";
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
  const updateSettings = useAppStore((s) => s.updateSettings);
  const openSettings = useUiStore((s) => s.openSettings);

  const newSession = () => {
    if (cwd) void startSession(cwd);
  };

  const changeFolder = async () => {
    const res = await whalex.invoke("dialog:pickFolder", undefined);
    if (res.path) {
      await updateSettings({ defaultCwd: res.path });
      await startSession(res.path);
    }
  };

  const folderName = cwd ? (cwd.split(/[\\/]/).pop() ?? cwd) : "";

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="px-3 pb-2.5 pt-3">
        <button
          onClick={() => void changeFolder()}
          className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-[12.5px] text-muted hover:bg-surface-2"
          title={cwd ?? ""}
        >
          <FolderOpen size={14} className="shrink-0" />
          <span className="min-w-0 truncate">{folderName || t("sidebar.changeFolder")}</span>
        </button>
        <button
          onClick={newSession}
          className="mt-2 flex w-full items-center gap-2 rounded-md bg-accent px-3 py-2 text-[12.5px] font-medium text-white hover:bg-accent-hover"
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
        {sessions.map((s) => (
          <div
            key={s.sessionId}
            onClick={() => void startSession(s.cwd, s.sessionId)}
            className={`group mb-1 flex w-full cursor-pointer flex-col rounded-lg px-3 py-2 text-left hover:bg-surface-2 ${
              s.sessionId === activeId ? "bg-accent-soft" : ""
            }`}
          >
            <div className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
              <MessageSquare size={12} className="shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(t("sidebar.deleteConfirm"))) void deleteSession(s.sessionId, s.cwd);
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
      <button
        onClick={() => openSettings("general")}
        className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-[12.5px] text-muted hover:bg-surface-2"
      >
        <Settings size={14} />
        {t("sidebar.settings")}
      </button>
    </aside>
  );
}
