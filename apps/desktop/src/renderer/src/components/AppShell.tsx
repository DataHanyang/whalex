import { useEffect } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { Sidebar } from "./Sidebar";
import { Transcript } from "./Transcript";
import { Composer } from "./Composer";
import { StatusBar } from "./StatusBar";
import { ArtifactPanel } from "./ArtifactPanel";
import { BrowserPanel } from "./BrowserPanel";
import { SettingsModal } from "./SettingsModal";
import { UpdateToast } from "./UpdateToast";
import { RewindDialog } from "./RewindDialog";
import { QuestionCard } from "./QuestionCard";
import { PlanActions } from "./PlanActions";
import { useUiStore } from "../stores/uiStore";
import logoUrl from "../assets/logo.png";
import { PanelLeftOpen } from "lucide-react";

export function AppShell() {
  const status = useSessionStore((s) => s.status);
  const abort = useSessionStore((s) => s.abort);
  const pendingPermission = useSessionStore((s) => s.pendingPermission);
  const pendingQuestion = useSessionStore((s) => s.pendingQuestion);
  const planPending = useSessionStore((s) => s.planPending);
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessionTitle = sessions.find((x) => x.sessionId === activeSessionId)?.title ?? "";
  const activeArtifactId = useSessionStore((s) => s.activeArtifactId);
  const browserActive = useSessionStore((s) => s.browser.active);
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
      <div className="titlebar-drag flex h-10 shrink-0 items-center border-b border-border bg-surface px-4">
        <img src={logoUrl} alt="" className="mr-1.5 h-5 w-5" />
        <span className="text-[13px] font-semibold tracking-tight">WhaleX</span>
      </div>
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          {sessionTitle && (
            <div className="flex h-8 shrink-0 items-center justify-center border-b border-border text-[12px] font-medium text-muted">
              <span className="max-w-[70%] truncate">{sessionTitle}</span>
            </div>
          )}
          <Transcript />
          {(pendingQuestion || planPending) && (
            <div className="mx-auto w-full max-w-4xl px-6">
              {pendingQuestion ? <QuestionCard request={pendingQuestion} /> : <PlanActions />}
            </div>
          )}
          <Composer />
        </main>
        {(browserActive || (activeArtifactId && !artifactCollapsed)) && (
          <div
            onMouseDown={startResize}
            className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-accent"
            title="Drag to resize"
          />
        )}
        {browserActive && (
          <div className="shrink-0" style={{ width: artifactWidth }}>
            <BrowserPanel />
          </div>
        )}
        {!browserActive && activeArtifactId && !artifactCollapsed && (
          <div className="shrink-0" style={{ width: artifactWidth }}>
            <ArtifactPanel />
          </div>
        )}
        {!browserActive && activeArtifactId && artifactCollapsed && (
          // Folded: a rail keeps the artifact one click away while the
          // transcript takes the width back.
          <button
            onClick={toggleArtifactCollapsed}
            title="Show preview"
            className="flex w-9 shrink-0 flex-col items-center gap-2 border-l border-border bg-surface py-3 text-faint hover:text-text"
          >
            <PanelLeftOpen size={15} />
            <span className="[writing-mode:vertical-rl] text-[11px] tracking-wide">Preview</span>
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
