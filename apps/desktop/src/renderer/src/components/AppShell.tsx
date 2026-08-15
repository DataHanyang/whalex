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

export function AppShell() {
  const status = useSessionStore((s) => s.status);
  const abort = useSessionStore((s) => s.abort);
  const pendingPermission = useSessionStore((s) => s.pendingPermission);
  const activeArtifactId = useSessionStore((s) => s.activeArtifactId);
  const browserActive = useSessionStore((s) => s.browser.active);

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
        <span className="text-[13px] font-semibold tracking-tight">🐋 Whalex</span>
      </div>
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <Transcript />
          <Composer />
        </main>
        {browserActive && (
          <div className="w-[46%] min-w-[360px] max-w-[720px] shrink-0">
            <BrowserPanel />
          </div>
        )}
        {!browserActive && activeArtifactId && (
          <div className="w-[46%] min-w-[360px] max-w-[720px] shrink-0">
            <ArtifactPanel />
          </div>
        )}
      </div>
      <StatusBar />
      <SettingsModal />
      <UpdateToast />
    </div>
  );
}
