import { useEffect } from "react";
import { LogIn } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { whalex } from "../lib/ipc";

/**
 * Cloud edition sign-in gate. Opens the hosted OAuth page in the browser;
 * the app receives the token via the whalex:// deep link and re-checks state.
 * Never shown in the OSS (BYOK) edition.
 */
export function LoginScreen() {
  const refreshState = useAppStore((s) => s.refreshState);

  // Poll for the token arriving via the deep-link callback.
  useEffect(() => {
    const id = setInterval(() => void refreshState(), 1500);
    return () => clearInterval(id);
  }, [refreshState]);

  return (
    <div className="flex h-full flex-col">
      <div className="titlebar-drag h-10 shrink-0" />
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-3xl">
            🐋
          </div>
          <h1 className="text-2xl font-bold">Whalex Cloud</h1>
          <p className="mx-auto mt-3 max-w-xs text-[13.5px] text-muted">
            구독 계정으로 로그인하면 API 키 없이 바로 사용할 수 있습니다.
          </p>
          <button
            onClick={() => void whalex.invoke("auth:signIn", undefined)}
            className="mt-7 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-medium text-white hover:bg-accent-hover"
          >
            <LogIn size={16} />
            로그인
          </button>
        </div>
      </div>
    </div>
  );
}
