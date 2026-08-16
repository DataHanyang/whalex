import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, FolderOpen, KeyRound, Loader2 } from "lucide-react";
import { DEEPSEEK_PROVIDER_ID } from "@whalex/shared";
import { useAppStore } from "../stores/appStore";
import { useSessionStore } from "../stores/sessionStore";
import { whalex } from "../lib/ipc";
import logoUrl from "../assets/logo.png";

type Step = "welcome" | "apiKey" | "folder";

export function Onboarding() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("welcome");
  const [apiKey, setApiKey] = useState("");
  const [testState, setTestState] = useState<
    { s: "idle" } | { s: "testing" } | { s: "ok"; count: number } | { s: "error"; msg: string }
  >({ s: "idle" });
  const [folder, setFolder] = useState<string | null>(null);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const refreshModels = useAppStore((s) => s.refreshModels);
  const settings = useAppStore((s) => s.settings);
  const startSession = useSessionStore((s) => s.startSession);

  const testKey = async () => {
    setTestState({ s: "testing" });
    const res = await whalex.invoke("provider:test", {
      providerId: DEEPSEEK_PROVIDER_ID,
      apiKey: apiKey.trim(),
    });
    if (res.ok) {
      await whalex.invoke("secrets:set", { ref: "deepseek-api-key", value: apiKey.trim() });
      setApiKey("");
      setTestState({ s: "ok", count: res.models.length });
    } else {
      setTestState({ s: "error", msg: res.error ?? "unknown" });
    }
  };

  const pickFolder = async () => {
    const res = await whalex.invoke("dialog:pickFolder", undefined);
    if (res.path) setFolder(res.path);
  };

  const finish = async () => {
    if (!folder) return;
    await updateSettings({ onboardingComplete: true, defaultCwd: folder });
    await refreshModels();
    await startSession(folder);
  };

  const setLanguage = (language: "ko" | "en") => void updateSettings({ language });

  return (
    <div className="flex h-full flex-col">
      <div className="titlebar-drag h-10 shrink-0" />
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-md">
          {step === "welcome" && (
            <div className="text-center">
              <img src={logoUrl} alt="" className="mx-auto mb-5 h-16 w-16" />
              <h1 className="text-2xl font-bold">{t("onboarding.welcome.title")}</h1>
              <p className="mx-auto mt-3 max-w-sm text-[13.5px] text-muted">
                {t("onboarding.welcome.subtitle")}
              </p>
              <div className="mt-5 flex items-center justify-center gap-2 text-[12.5px]">
                <span className="text-faint">{t("onboarding.language")}:</span>
                <button
                  onClick={() => setLanguage("ko")}
                  className={`rounded-md px-2.5 py-1 ${settings?.language === "ko" || (settings?.language === "system" && navigator.language.startsWith("ko")) ? "bg-accent-soft text-accent" : "hover:bg-surface-2"}`}
                >
                  한국어
                </button>
                <button
                  onClick={() => setLanguage("en")}
                  className={`rounded-md px-2.5 py-1 ${settings?.language === "en" ? "bg-accent-soft text-accent" : "hover:bg-surface-2"}`}
                >
                  English
                </button>
              </div>
              <button
                onClick={() => setStep("apiKey")}
                className="mt-7 w-full rounded-lg bg-accent py-2.5 text-[14px] font-medium text-white hover:bg-accent-hover"
              >
                {t("onboarding.welcome.start")}
              </button>
            </div>
          )}

          {step === "apiKey" && (
            <div>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
                <KeyRound size={20} className="text-accent" />
              </div>
              <h2 className="text-xl font-bold">{t("onboarding.apiKey.title")}</h2>
              <p className="mt-2 text-[13px] text-muted">{t("onboarding.apiKey.subtitle")}</p>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestState({ s: "idle" });
                }}
                placeholder={t("onboarding.apiKey.placeholder")}
                className="mt-4 w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 font-mono text-[13px] outline-none focus:border-accent"
              />
              <button
                onClick={() =>
                  void whalex.invoke("shell:openExternal", {
                    url: "https://platform.deepseek.com/api_keys",
                  })
                }
                className="mt-2 text-[12px] text-accent hover:underline"
              >
                {t("onboarding.apiKey.get")}
              </button>

              {testState.s === "ok" && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-[12.5px] text-ok">
                  <Check size={15} />
                  {t("onboarding.apiKey.success", { count: testState.count })}
                </div>
              )}
              {testState.s === "error" && (
                <div className="mt-3 break-all rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
                  {testState.msg}
                </div>
              )}

              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setStep("welcome")}
                  className="rounded-lg border border-border px-4 py-2.5 text-[13px] hover:bg-surface-2"
                >
                  {t("onboarding.back")}
                </button>
                {testState.s === "ok" ? (
                  <button
                    onClick={() => setStep("folder")}
                    className="flex-1 rounded-lg bg-accent py-2.5 text-[13.5px] font-medium text-white hover:bg-accent-hover"
                  >
                    {t("onboarding.next")}
                  </button>
                ) : (
                  <button
                    onClick={() => void testKey()}
                    disabled={apiKey.trim().length < 8 || testState.s === "testing"}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[13.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
                  >
                    {testState.s === "testing" && <Loader2 size={14} className="animate-spin" />}
                    {testState.s === "testing"
                      ? t("onboarding.apiKey.testing")
                      : t("onboarding.apiKey.test")}
                  </button>
                )}
              </div>
              <button
                onClick={() => setStep("folder")}
                className="mt-3 w-full text-center text-[12px] text-faint hover:text-muted"
              >
                {t("onboarding.apiKey.skip")}
              </button>
            </div>
          )}

          {step === "folder" && (
            <div>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
                <FolderOpen size={20} className="text-accent" />
              </div>
              <h2 className="text-xl font-bold">{t("onboarding.folder.title")}</h2>
              <p className="mt-2 text-[13px] text-muted">{t("onboarding.folder.subtitle")}</p>
              <button
                onClick={() => void pickFolder()}
                className="mt-4 w-full rounded-lg border border-dashed border-border-strong px-4 py-4 text-[13px] text-muted hover:border-accent hover:text-text"
              >
                {folder ?? t("onboarding.folder.pick")}
              </button>
              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setStep("apiKey")}
                  className="rounded-lg border border-border px-4 py-2.5 text-[13px] hover:bg-surface-2"
                >
                  {t("onboarding.back")}
                </button>
                <button
                  onClick={() => void finish()}
                  disabled={!folder}
                  className="flex-1 rounded-lg bg-accent py-2.5 text-[13.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
                >
                  {t("onboarding.folder.finish")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
