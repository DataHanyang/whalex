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
  const startSession = useSessionStore((s) => s.startSession);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const booted = useRef(false);

  useEffect(() => {
    if (!booted.current) {
      booted.current = true;
      void init();
      useUiStore.getState().listen();
    }
  }, [init]);

  // Auto-open a session in the default folder once onboarded.
  useEffect(() => {
    if (ready && settings?.onboardingComplete && settings.defaultCwd && !activeSessionId) {
      void startSession(settings.defaultCwd);
    }
  }, [ready, settings, activeSessionId, startSession]);

  if (!ready || !settings) {
    return <div className="titlebar-drag h-full" />;
  }
  // Cloud edition requires sign-in before anything else.
  if (edition === "cloud" && !signedIn) return <LoginScreen />;
  return settings.onboardingComplete ? <AppShell /> : <Onboarding />;
}
