import { useEffect } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { Sidebar } from "./Sidebar";
import { Transcript } from "./Transcript";
import { Composer } from "./Composer";
import { StatusBar } from "./StatusBar";

export function AppShell() {
  const status = useSessionStore((s) => s.status);
  const abort = useSessionStore((s) => s.abort);
  const pendingPermission = useSessionStore((s) => s.pendingPermission);

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
      </div>
      <StatusBar />
    </div>
  );
}
