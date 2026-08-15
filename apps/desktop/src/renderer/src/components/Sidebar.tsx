import { useTranslation } from "react-i18next";
import { FolderOpen, MessageSquare, Plus } from "lucide-react";
import { useSessionStore } from "../stores/sessionStore";
import { useAppStore } from "../stores/appStore";
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
  const updateSettings = useAppStore((s) => s.updateSettings);

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
      <div className="px-3 pb-2 pt-3">
        <button
          onClick={() => void changeFolder()}
          className="flex w-full items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-[12.5px] text-muted hover:bg-surface-2"
          title={cwd ?? ""}
        >
          <FolderOpen size={14} className="shrink-0" />
          <span className="truncate">{folderName || t("sidebar.changeFolder")}</span>
        </button>
        <button
          onClick={newSession}
          className="mt-2 flex w-full items-center gap-2 rounded-md bg-accent px-2.5 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent-hover"
        >
          <Plus size={14} />
          {t("sidebar.newSession")}
        </button>
      </div>
      <div className="px-4 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
        {t("sidebar.sessions")}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {sessions.length === 0 && (
          <div className="px-2 py-3 text-[12px] text-faint">{t("sidebar.empty")}</div>
        )}
        {sessions.map((s) => (
          <button
            key={s.sessionId}
            onClick={() => void startSession(s.cwd, s.sessionId)}
            className={`mb-0.5 flex w-full flex-col rounded-md px-2.5 py-2 text-left hover:bg-surface-2 ${
              s.sessionId === activeId ? "bg-accent-soft" : ""
            }`}
          >
            <span className="flex items-center gap-1.5 text-[12.5px]">
              <MessageSquare size={12} className="shrink-0 text-faint" />
              <span className="truncate">{s.title}</span>
            </span>
            <span className="mt-0.5 pl-[18px] text-[11px] text-faint">
              {timeAgo(s.updatedAt, i18n.language)}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
