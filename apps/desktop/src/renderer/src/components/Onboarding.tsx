import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Eye, KeyRound, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { DEEPSEEK_PROVIDER_ID, resolveSystemLanguage, type AppLanguage } from "@whalex/shared";
import { LANGUAGES } from "../i18n";
import { ToggleSwitch } from "./ToggleSwitch";
import { useAppStore } from "../stores/appStore";
import { whalex } from "../lib/ipc";
import logoUrl from "../assets/logo.png";

type Step = "welcome" | "apiKey" | "vision" | "finish";

/**
 * Vision sidecars offered during setup. DeepSeek is text-only, so images only
 * work once one of these is connected — both have a free tier, which is why
 * they are the two on offer here (Settings → Models has the full list).
 */
const VISION_PRESETS = [
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-flash-latest",
    keysUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "glm",
    label: "GLM (Zhipu)",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4v-flash",
    keysUrl: "https://open.bigmodel.cn/usercenter/apikeys",
  },
] as const;

export function Onboarding() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("welcome");
  const [apiKey, setApiKey] = useState("");
  const [testState, setTestState] = useState<
    { s: "idle" } | { s: "testing" } | { s: "ok"; count: number } | { s: "error"; msg: string }
  >({ s: "idle" });
  const [preset, setPreset] = useState<(typeof VISION_PRESETS)[number]>(VISION_PRESETS[0]);
  const [visionKey, setVisionKey] = useState("");
  const [visionState, setVisionState] = useState<
    { s: "idle" } | { s: "testing" } | { s: "ok" } | { s: "error"; msg: string }
  >({ s: "idle" });
  const [instructions, setInstructions] = useState("");
  const [redactSecrets, setRedactSecrets] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const refreshModels = useAppStore((s) => s.refreshModels);
  const settings = useAppStore((s) => s.settings);

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

  /** Store the vision key + endpoint, verifying it first so a typo surfaces here. */
  const connectVision = async () => {
    setVisionState({ s: "testing" });
    const res = await whalex.invoke("vision:test", {
      baseUrl: preset.baseUrl,
      model: preset.model,
      apiKey: visionKey.trim(),
    });
    if (!res.ok) {
      setVisionState({ s: "error", msg: res.error ?? "unknown" });
      return;
    }
    await whalex.invoke("secrets:set", { ref: "vision-api-key", value: visionKey.trim() });
    await updateSettings({
      vision: { baseUrl: preset.baseUrl, model: preset.model, apiKeyRef: "vision-api-key" },
    });
    setVisionKey("");
    setVisionState({ s: "ok" });
  };

  // No folder is picked here — a session chooses its own project folder, so
  // setup only settles the things that apply across every project.
  const finish = async () => {
    setFinishing(true);
    try {
      await updateSettings({
        onboardingComplete: true,
        customInstructions: instructions.trim(),
        redactSecrets,
      });
      await refreshModels();
    } finally {
      setFinishing(false);
    }
  };

  const setLanguage = (language: AppLanguage) => void updateSettings({ language });
  // "system" highlights whichever locale it actually resolves to, so zh and
  // zh-TW never light up together.
  const isActive = (code: AppLanguage) =>
    settings?.language === code ||
    (settings?.language === "system" && resolveSystemLanguage(navigator.language) === code);

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
              <div className="mt-5">
                <div className="mb-1.5 text-[11.5px] text-faint">{t("onboarding.language")}</div>
                {/* Eleven locales — a wrapped row, not a single line. */}
                <div className="flex flex-wrap items-center justify-center gap-1 text-[11.5px]">
                  {LANGUAGES.map(([code, label]) => (
                    <button
                      key={code}
                      onClick={() => setLanguage(code)}
                      className={`rounded-md px-2 py-1 ${isActive(code) ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
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
                    onClick={() => setStep("vision")}
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
                onClick={() => setStep("vision")}
                className="mt-3 w-full text-center text-[12px] text-faint hover:text-muted"
              >
                {t("onboarding.apiKey.skip")}
              </button>
            </div>
          )}

          {step === "vision" && (
            <div>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
                <Eye size={20} className="text-accent" />
              </div>
              <h2 className="text-xl font-bold">{t("onboarding.vision.title")}</h2>
              <p className="mt-2 text-[13px] text-muted">{t("onboarding.vision.subtitle")}</p>
              <div className="mt-4 flex gap-1.5">
                {VISION_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPreset(p);
                      setVisionState({ s: "idle" });
                    }}
                    className={`flex-1 rounded-lg border px-3 py-2 text-left text-[12.5px] ${
                      preset.id === p.id
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border text-muted hover:bg-surface-2"
                    }`}
                  >
                    <div className="font-medium">{p.label}</div>
                    <div className="mt-0.5 truncate font-mono text-[10.5px] opacity-70">
                      {p.model}
                    </div>
                  </button>
                ))}
              </div>
              <input
                type="password"
                value={visionKey}
                onChange={(e) => {
                  setVisionKey(e.target.value);
                  setVisionState({ s: "idle" });
                }}
                placeholder={t("onboarding.vision.placeholder")}
                className="mt-3 w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 font-mono text-[13px] outline-none focus:border-accent"
              />
              <button
                onClick={() => void whalex.invoke("shell:openExternal", { url: preset.keysUrl })}
                className="mt-2 text-[12px] text-accent hover:underline"
              >
                {t("onboarding.vision.get", { provider: preset.label })}
              </button>

              {visionState.s === "ok" && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-[12.5px] text-ok">
                  <Check size={15} />
                  {t("onboarding.vision.success")}
                </div>
              )}
              {visionState.s === "error" && (
                <div className="mt-3 break-all rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
                  {visionState.msg}
                </div>
              )}

              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setStep("apiKey")}
                  className="rounded-lg border border-border px-4 py-2.5 text-[13px] hover:bg-surface-2"
                >
                  {t("onboarding.back")}
                </button>
                {visionState.s === "ok" ? (
                  <button
                    onClick={() => setStep("finish")}
                    className="flex-1 rounded-lg bg-accent py-2.5 text-[13.5px] font-medium text-white hover:bg-accent-hover"
                  >
                    {t("onboarding.next")}
                  </button>
                ) : (
                  <button
                    onClick={() => void connectVision()}
                    disabled={visionKey.trim().length < 8 || visionState.s === "testing"}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[13.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
                  >
                    {visionState.s === "testing" && <Loader2 size={14} className="animate-spin" />}
                    {visionState.s === "testing"
                      ? t("onboarding.vision.testing")
                      : t("onboarding.vision.connect")}
                  </button>
                )}
              </div>
              <button
                onClick={() => setStep("finish")}
                className="mt-3 w-full text-center text-[12px] text-faint hover:text-muted"
              >
                {t("onboarding.vision.skip")}
              </button>
            </div>
          )}

          {step === "finish" && (
            <div>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
                <Sparkles size={20} className="text-accent" />
              </div>
              <h2 className="text-xl font-bold">{t("onboarding.finish.title")}</h2>
              <p className="mt-2 text-[13px] text-muted">{t("onboarding.finish.subtitle")}</p>

              <label className="mt-4 block text-[12px] font-medium text-muted">
                {t("onboarding.finish.instructions")}
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={t("onboarding.finish.instructionsPlaceholder")}
                rows={5}
                className="mt-1.5 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-accent"
              />

              <div
                className={`mt-3 flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 ${
                  redactSecrets ? "border-accent bg-accent-soft" : "border-border"
                }`}
              >
                <ShieldCheck
                  size={16}
                  className={`mt-0.5 shrink-0 ${redactSecrets ? "text-accent" : "text-faint"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium">{t("onboarding.finish.redact")}</div>
                  <div className="mt-0.5 text-[11.5px] text-faint">
                    {t("onboarding.finish.redactHint")}
                  </div>
                </div>
                <div className="mt-0.5">
                  <ToggleSwitch
                    checked={redactSecrets}
                    label={t("onboarding.finish.redact")}
                    onChange={setRedactSecrets}
                  />
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setStep("vision")}
                  className="rounded-lg border border-border px-4 py-2.5 text-[13px] hover:bg-surface-2"
                >
                  {t("onboarding.back")}
                </button>
                <button
                  onClick={() => void finish()}
                  disabled={finishing}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[13.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
                >
                  {finishing && <Loader2 size={14} className="animate-spin" />}
                  {t("onboarding.finish.start")}
                </button>
              </div>
              <p className="mt-3 text-center text-[11.5px] text-faint">
                {t("onboarding.finish.later")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
