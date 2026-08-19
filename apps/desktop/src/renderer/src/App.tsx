import { useEffect, useRef } from "react";
import { useAppStore } from "./stores/appStore";
import { useSessionStore } from "./stores/sessionStore";
import { useUiStore } from "./stores/uiStore";
import { Onboarding } from "./components/Onboarding";
import { AppShell } from "./components/AppShell";
import { LoginScreen } from "./components/LoginScreen";

export function App() {
  const ready = useAppStore((s) => s.ready);
  const settings = useAppStore((s) => s.settings);
  const edition = useAppStore((s) => s.edition);
  const signedIn = useAppStore((s) => s.signedIn);
  const init = useAppStore((s) => s.init);
  const openInitialSession = useSessionStore((s) => s.openInitialSession);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const booted = useRef(false);

  useEffect(() => {
    if (!booted.current) {
      booted.current = true;
      void init();
      useUiStore.getState().listen();
    }
  }, [init]);

  // Auto-open once onboarded: a session still running in main wins over a
  // blank one in the default folder, so a reload doesn't orphan live work.
  // Setup no longer picks a folder, so a fresh install has no defaultCwd —
  // the attach probe still runs, and the ref keeps it to one try per boot.
  const openedInitial = useRef(false);
  useEffect(() => {
    if (ready && settings?.onboardingComplete && !activeSessionId && !openedInitial.current) {
      openedInitial.current = true;
      void openInitialSession(settings.defaultCwd);
    }
  }, [ready, settings, activeSessionId, openInitialSession]);

  if (!ready || !settings) {
    return <div className="titlebar-drag h-full" />;
  }
  // Cloud edition requires sign-in before anything else.
  if (edition === "cloud" && !signedIn) return <LoginScreen />;
  return settings.onboardingComplete ? <AppShell /> : <Onboarding />;
}
