import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSessionStore } from "../stores/sessionStore";
import { Sidebar } from "./Sidebar";
import { Transcript } from "./Transcript";
import { Composer } from "./Composer";
import { StatusBar } from "./StatusBar";
import { SidePanel } from "./SidePanel";
import { SettingsModal } from "./SettingsModal";
import { UpdateToast } from "./UpdateToast";
import { RewindDialog } from "./RewindDialog";
import { QuestionCard } from "./QuestionCard";
import { PlanActions } from "./PlanActions";
import { useUiStore } from "../stores/uiStore";
import logoUrl from "../assets/logo.png";
import { PanelLeftOpen } from "lucide-react";

// macOS draws its traffic-light buttons at the top-left of the frameless
// window; the logo must sit to their right or it overlaps them. Windows draws
// its caption controls on the right and Linux has none there, so neither
// needs the inset.
const IS_MAC = navigator.userAgent.includes("Macintosh");

export function AppShell() {
  const { t } = useTranslation();
  const status = useSessionStore((s) => s.status);
  const abort = useSessionStore((s) => s.abort);
  const pendingPermission = useSessionStore((s) => s.pendingPermissions[0] ?? null);
  const pendingQuestion = useSessionStore((s) => s.pendingQuestion);
  const planPending = useSessionStore((s) => s.planPending);
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessionTitle = sessions.find((x) => x.sessionId === activeSessionId)?.title ?? "";
  const sideTab = useSessionStore((s) => s.sideTab);
  const rewindOpen = useUiStore((s) => s.rewindOpen);
  const artifactCollapsed = useUiStore((s) => s.artifactCollapsed);
  const toggleArtifactCollapsed = useUiStore((s) => s.toggleArtifactCollapsed);
  const artifactWidth = useUiStore((s) => s.artifactWidth);
  const setArtifactWidth = useUiStore((s) => s.setArtifactWidth);

  // Drag the divider to resize the side panel; listeners live on the window
  // so the drag survives leaving the 4px handle.
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => setArtifactWidth(window.innerWidth - ev.clientX);
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const closeRewind = useUiStore((s) => s.closeRewind);

  // Esc aborts a running turn (unless a permission card owns the key).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status !== "idle" && !pendingPermission) {
        void abort();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, pendingPermission, abort]);

  return (
    <div className="flex h-full flex-col">
      <div
        className={`titlebar-drag flex h-10 shrink-0 items-center border-b border-border bg-surface px-4 ${
          IS_MAC ? "pl-[78px]" : ""
        }`}
      >
        <img src={logoUrl} alt="" className="mr-1.5 h-5 w-5" />
        <span className="text-[13px] font-semibold tracking-tight">WhaleX</span>
      </div>
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          {sessionTitle && (
            <div className="flex h-[60px] shrink-0 items-center justify-center border-b border-border bg-surface px-6">
              <span className="max-w-[75%] truncate text-[15px] font-semibold tracking-tight">
                {sessionTitle}
              </span>
            </div>
          )}
          <Transcript />
          {(pendingQuestion || planPending) && (
            <div className="mx-auto w-full max-w-4xl px-6">
              {/* Keyed so a new question set never inherits stale step/answer state. */}
              {pendingQuestion ? (
                <QuestionCard key={pendingQuestion.id} request={pendingQuestion} />
              ) : (
                <PlanActions />
              )}
            </div>
          )}
          <Composer />
        </main>
        {sideTab && !artifactCollapsed && (
          <div
            onMouseDown={startResize}
            className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-accent"
            title={t("panel.dragResize")}
          />
        )}
        {sideTab && !artifactCollapsed && (
          <div className="shrink-0" style={{ width: artifactWidth }}>
            <SidePanel />
          </div>
        )}
        {sideTab && artifactCollapsed && (
          // Folded: a rail keeps the artifact one click away while the
          // transcript takes the width back.
          <button
            onClick={toggleArtifactCollapsed}
            title={t("panel.showPreview")}
            className="flex w-9 shrink-0 flex-col items-center gap-2 border-l border-border bg-surface py-3 text-faint hover:text-text"
          >
            <PanelLeftOpen size={15} />
            <span className="[writing-mode:vertical-rl] text-[11px] tracking-wide">{t("panel.preview")}</span>
          </button>
        )}
      </div>
      <StatusBar />
      <SettingsModal />
      {rewindOpen && <RewindDialog onClose={closeRewind} />}
      <UpdateToast />
    </div>
  );
}
