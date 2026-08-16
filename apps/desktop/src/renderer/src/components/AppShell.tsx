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
import { useUiStore } from "../stores/uiStore";
import logoUrl from "../assets/logo.png";
import { PanelLeftOpen } from "lucide-react";

export function AppShell() {
  const status = useSessionStore((s) => s.status);
  const abort = useSessionStore((s) => s.abort);
  const pendingPermission = useSessionStore((s) => s.pendingPermission);
  const pendingQuestion = useSessionStore((s) => s.pendingQuestion);
  const activeArtifactId = useSessionStore((s) => s.activeArtifactId);
  const browserActive = useSessionStore((s) => s.browser.active);
  const rewindOpen = useUiStore((s) => s.rewindOpen);
  const artifactCollapsed = useUiStore((s) => s.artifactCollapsed);
  const toggleArtifactCollapsed = useUiStore((s) => s.toggleArtifactCollapsed);
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
          <Transcript />
          {pendingQuestion && (
            <div className="mx-auto w-full max-w-3xl px-6">
              <QuestionCard request={pendingQuestion} />
            </div>
          )}
          <Composer />
        </main>
        {browserActive && (
          <div className="w-[46%] min-w-[360px] max-w-[720px] shrink-0">
            <BrowserPanel />
          </div>
        )}
        {!browserActive && activeArtifactId && !artifactCollapsed && (
          <div className="w-[46%] min-w-[360px] max-w-[720px] shrink-0">
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
