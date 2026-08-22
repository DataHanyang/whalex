import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Blocks,
  CalendarClock,
  Cpu,
  FolderOpen,
  KeyRound,
  Palette,
  Play,
  Plug,
  RefreshCw,
  Check,
  Eye,
  EyeOff,
  Plus,
  Settings2,
  Smartphone,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import whalexMark from "../assets/logo.png";
import {
  DEEPSEEK_BASE_URL,
  MCP_PRESETS,
  type IpcResponse,
  type McpServerConfig,
  type RemoteStatus,
  type Routine,
  type SkillInfo,
} from "@whalex/shared";
import { LANGUAGES } from "../i18n";
import { ToggleSwitch } from "./ToggleSwitch";
import { useAppStore } from "../stores/appStore";
import { useUiStore, type SettingsTab } from "../stores/uiStore";
import { whalex } from "../lib/ipc";

const TABS: Array<{ id: SettingsTab; labelKey: string; icon: typeof Settings2 }> = [
  { id: "general", labelKey: "settings.tab.general", icon: Settings2 },
  { id: "apikey", labelKey: "settings.tab.apikey", icon: KeyRound },
  { id: "models", labelKey: "settings.tab.models", icon: Cpu },
  { id: "mcp", labelKey: "settings.tab.mcp", icon: Plug },
  { id: "skills", labelKey: "settings.tab.skills", icon: Sparkles },
  { id: "routines", labelKey: "settings.tab.routines", icon: CalendarClock },
  { id: "usage", labelKey: "settings.tab.usage", icon: Activity },
  { id: "plugins", labelKey: "settings.tab.plugins", icon: Blocks },
  { id: "remote", labelKey: "settings.tab.remote", icon: Smartphone },
  { id: "appearance", labelKey: "settings.tab.appearance", icon: Palette },
  { id: "updates", labelKey: "settings.tab.updates", icon: RefreshCw },
];

/**
 * A settings line: label (with optional explanation beneath) on the left, the
 * control on the right.
 *
 * The explanation belongs under the label, not beside the control. Sitting it
 * next to a `shrink-0` control let a long sentence push the row wider than the
 * panel — the label collapsed to one word per line and the sentence itself got
 * clipped, which is exactly what happened to the sleep and tunnel rows.
 */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13px]">{label}</div>
        {hint && <div className="mt-1 text-[11.5px] leading-relaxed text-faint">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function GeneralTab() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings)!;
  const update = useAppStore((s) => s.updateSettings);
  return (
    <div>
      <Row label={t("settings.language")}>
        <select
          value={settings.language}
          onChange={(e) => void update({ language: e.target.value as never })}
          className="rounded-md border border-border bg-surface px-2 py-1 text-[12.5px]"
        >
          {LANGUAGES.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
          <option value="system">{t("settings.language.system")}</option>
        </select>
      </Row>
      <Row label={t("settings.defaultMode")}>
        <select
          value={settings.permissions.mode}
          onChange={(e) =>
            void update({ permissions: { ...settings.permissions, mode: e.target.value as never } })
          }
          className="rounded-md border border-border bg-surface px-2 py-1 text-[12.5px]"
        >
          <option value="default">{t("settings.mode.default")}</option>
          <option value="acceptEdits">{t("settings.mode.acceptEdits")}</option>
          <option value="bypassPermissions">{t("settings.mode.bypass")}</option>
          <option value="unrestricted">{t("settings.mode.unrestricted")}</option>
          <option value="plan">{t("settings.mode.plan")}</option>
        </select>
      </Row>
      <div className="mt-5 mb-2 text-[12px] font-semibold text-muted">{t("settings.features")}</div>
      <Row label={t("settings.autoCompact")}>
        <ToggleSwitch
          checked={settings.autoCompact}
          label={t("settings.autoCompact")}
          onChange={(v) => void update({ autoCompact: v })}
        />
      </Row>
      <Row label={t("settings.preventSleep")} hint={t("settings.preventSleep.hint")}>
        <ToggleSwitch
            checked={settings.preventSleepWhileRunning}
            label={t("settings.preventSleep")}
            onChange={(v) => void update({ preventSleepWhileRunning: v })}
          />
      </Row>
      <Row label={t("settings.privacy.redact")}>
        <ToggleSwitch
          checked={settings.redactSecrets}
          label={t("settings.privacy.redact")}
          onChange={(v) => void update({ redactSecrets: v })}
        />
      </Row>
      <Row label={t("settings.uncensored")} hint={t("settings.uncensored.hint")}>
        <ToggleSwitch
            checked={settings.uncensoredMode}
            label={t("settings.uncensored")}
            onChange={(v) => void update({ uncensoredMode: v })}
          />
      </Row>
      {(
        [
          ["subagents", "settings.feature.subagents"],
          ["superCode", "settings.feature.superCode"],
          ["browserUse", "settings.feature.browserUse"],
          ["webFetch", "settings.feature.webFetch"],
        ] as const
      ).map(([key, labelKey]) => (
        <Row key={key} label={t(labelKey)}>
          <ToggleSwitch
            checked={settings.features[key]}
            label={t(labelKey)}
            onChange={(v) => void update({ features: { ...settings.features, [key]: v } })}
          />
        </Row>
      ))}
      <div className="mt-5 mb-1 text-[12px] font-semibold text-muted">
        {t("settings.instructions")}
      </div>
      <div className="mb-2 text-[11.5px] text-faint">{t("settings.instructions.desc")}</div>
      <textarea
        defaultValue={settings.customInstructions}
        onBlur={(e) => {
          const v = e.target.value;
          if (v !== settings.customInstructions) void update({ customInstructions: v });
        }}
        placeholder={t("settings.instructions.placeholder")}
        rows={6}
        aria-label={t("settings.instructions")}
        className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-accent"
      />
      <div className="mb-3 text-[11px] text-faint">{t("settings.instructions.applies")}</div>
    </div>
  );
}

/**
 * Saved API keys. Each one is a provider entry with its own vault ref, so
 * several accounts (or several endpoints) can sit side by side and
 * activeProviderId decides which the agent actually uses. The active key is
 * applied to open sessions too, not only to the next one.
 */
function ApiKeyTab() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings)!;
  const secrets = useAppStore((s) => s.secrets);
  const update = useAppStore((s) => s.updateSettings);
  const refreshModels = useAppStore((s) => s.refreshModels);
  const refreshState = useAppStore((s) => s.refreshState);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(DEEPSEEK_BASE_URL);
  const [state, setState] = useState<{ s: "idle" | "testing" | "err"; msg?: string }>({ s: "idle" });
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // ref → plaintext, only for keys the user asked to see. Local state, so
  // closing Settings re-masks everything.
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const toggleReveal = async (ref: string) => {
    if (revealed[ref]) {
      setRevealed(({ [ref]: _gone, ...rest }) => rest);
      return;
    }
    const res = await whalex.invoke("secrets:reveal", { ref });
    if (res.value) setRevealed((r) => ({ ...r, [ref]: res.value! }));
  };

  const providers = settings.providers;
  const activeId = settings.activeProviderId;

  const resetForm = () => {
    setAdding(false);
    setName("");
    setKey("");
    setBaseUrl(DEEPSEEK_BASE_URL);
    setState({ s: "idle" });
  };

  // Verify before storing: a key that cannot list models is worth rejecting
  // here rather than at the start of the user's next turn.
  const addKey = async () => {
    setState({ s: "testing" });
    const res = await whalex.invoke("provider:test", {
      providerId: "",
      apiKey: key.trim(),
      baseUrl: baseUrl.trim(),
    });
    if (!res.ok) {
      setState({ s: "err", msg: res.error });
      return;
    }
    const id = `provider-${crypto.randomUUID()}`;
    const ref = `apikey-${id}`;
    await whalex.invoke("secrets:set", { ref, value: key.trim() });
    await update({
      providers: [
        ...providers,
        { id, name: name.trim() || t("settings.apikey.untitled"), baseUrl: baseUrl.trim(), apiKeyRef: ref },
      ],
      // A key you just added is the one you meant to use.
      activeProviderId: id,
    });
    resetForm();
    await refreshState();
    await refreshModels();
  };

  const activate = async (id: string) => {
    await update({ activeProviderId: id });
    await refreshModels();
  };

  const remove = async (id: string) => {
    const gone = providers.find((p) => p.id === id);
    const rest = providers.filter((p) => p.id !== id);
    if (rest.length === 0) return;
    if (gone?.apiKeyRef) await whalex.invoke("secrets:delete", { ref: gone.apiKeyRef });
    await update({
      providers: rest,
      // Deleting the active key has to hand the session to another one.
      activeProviderId: id === activeId ? rest[0]!.id : activeId,
    });
    setPendingDelete(null);
    await refreshState();
    await refreshModels();
  };

  return (
    <div>
      <div className="mb-2 text-[12px] font-semibold text-muted">{t("settings.apikey.keys")}</div>
      <div className="rounded-lg border border-border">
        {providers.map((p, i) => {
          const tail = p.apiKeyRef ? secrets[p.apiKeyRef] : null;
          const shown = p.apiKeyRef ? revealed[p.apiKeyRef] : undefined;
          const active = p.id === activeId;
          return (
            <div
              key={p.id}
              className={`flex items-center gap-2.5 px-3 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={t("settings.apikey.use")}
                onClick={() => void activate(p.id)}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  active ? "border-accent bg-accent text-white" : "border-border-strong hover:border-accent"
                }`}
              >
                {active && <Check size={11} />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[13px]">
                  <span className="truncate">{p.name}</span>
                  {active && (
                    <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent">
                      {t("settings.apikey.active")}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="min-w-0 truncate font-mono text-[11px] text-faint">
                    {shown ?? tail ?? t("settings.apikey.unset")}
                    {p.baseUrl !== DEEPSEEK_BASE_URL && ` · ${p.baseUrl}`}
                  </span>
                  {p.apiKeyRef && tail && (
                    <button
                      onClick={() => void toggleReveal(p.apiKeyRef!)}
                      title={shown ? t("settings.apikey.hide") : t("settings.apikey.reveal")}
                      aria-label={shown ? t("settings.apikey.hide") : t("settings.apikey.reveal")}
                      className="shrink-0 rounded p-0.5 text-faint hover:text-text"
                    >
                      {shown ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  )}
                </div>
              </div>
              {pendingDelete === p.id ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="text-[11.5px] text-muted">{t("settings.apikey.deleteConfirm")}</span>
                  <button
                    onClick={() => setPendingDelete(null)}
                    className="rounded-md border border-border px-2 py-1 text-[11.5px] text-muted hover:bg-surface-2"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    onClick={() => void remove(p.id)}
                    className="rounded-md bg-danger px-2 py-1 text-[11.5px] font-medium text-white hover:opacity-90"
                  >
                    {t("settings.apikey.delete")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setPendingDelete(p.id)}
                  disabled={providers.length < 2}
                  title={providers.length < 2 ? t("settings.apikey.lastOne") : t("settings.apikey.delete")}
                  aria-label={t("settings.apikey.delete")}
                  className="shrink-0 rounded p-1 text-faint hover:text-danger disabled:opacity-30 disabled:hover:text-faint"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {adding ? (
        <div className="mt-3 rounded-lg border border-border p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("settings.apikey.namePlaceholder")}
            aria-label={t("settings.apikey.name")}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[12.5px] outline-none focus:border-accent"
          />
          <input
            type="password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setState({ s: "idle" });
            }}
            placeholder="sk-..."
            aria-label={t("settings.apikey.label")}
            className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-[12.5px] outline-none focus:border-accent"
          />
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={DEEPSEEK_BASE_URL}
            aria-label={t("settings.apikey.endpoint")}
            className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-[11.5px] text-muted outline-none focus:border-accent"
          />
          <div className="mt-1 text-[11px] text-faint">{t("settings.apikey.endpointHint")}</div>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={() => void addKey()}
              disabled={key.trim().length < 8 || !baseUrl.trim() || state.s === "testing"}
              className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
            >
              {state.s === "testing" ? t("settings.apikey.testing") : t("settings.apikey.save")}
            </button>
            <button
              onClick={resetForm}
              className="rounded-md border border-border px-3 py-1.5 text-[12.5px] text-muted hover:bg-surface-2"
            >
              {t("common.cancel")}
            </button>
            {state.s === "err" && <span className="text-[12px] text-danger">{state.msg}</span>}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12.5px] text-muted hover:bg-surface-2"
        >
          <Plus size={13} />
          {t("settings.apikey.add")}
        </button>
      )}
    </div>
  );
}

function ModelsTab() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings)!;
  const update = useAppStore((s) => s.updateSettings);
  const models = useAppStore((s) => s.models);
  return (
    <div>
      <Row label={t("settings.defaultModel")}>
        <select
          value={settings.defaultModel}
          onChange={(e) => void update({ defaultModel: e.target.value })}
          className="rounded-md border border-border bg-surface px-2 py-1 text-[12.5px]"
        >
          {(models.length ? models.map((m) => m.id) : [settings.defaultModel]).map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </Row>
      <Row label={t("settings.temperature", { value: settings.temperature })}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={settings.temperature}
          onChange={(e) => void update({ temperature: Number(e.target.value) })}
        />
      </Row>
      <Row label={t("settings.maxAgents")}>
        <input
          type="number"
          min={1}
          max={1000}
          value={settings.superCode.maxAgents}
          onChange={(e) => {
            // Never persist an empty/0/NaN cap — clamp into [1, 1000].
            const n = Math.min(1000, Math.max(1, Math.floor(Number(e.target.value)) || 1));
            void update({ superCode: { ...settings.superCode, maxAgents: n } });
          }}
          className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-[12.5px]"
        />
      </Row>
      <Row label={t("settings.fleetShell")}>
        <label className="flex items-center gap-2 text-[11.5px] text-faint">
          <ToggleSwitch
            checked={settings.superCode.fleetShell}
            label={t("settings.fleetShell")}
            onChange={(v) => void update({ superCode: { ...settings.superCode, fleetShell: v } })}
          />
          {t("settings.fleetShell.hint")}
        </label>
      </Row>
      <div className="mt-5 mb-2 text-[12px] font-semibold text-muted">{t("settings.vision.title")}</div>
      <div className="mb-2 text-[11.5px] text-faint">{t("settings.vision.desc")}</div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            // DeepSeek's own API is text-only (Aug 2026 — vision exists only in
            // their web chat). These serve vision over the same OpenAI-compatible
            // protocol. Gemini's free tier is the recommended zero-cost default.
            ["Gemini Flash (무료 티어 ★추천)", "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-flash-latest"],
            ["DeepSeek-VL2 · SiliconFlow", "https://api.siliconflow.com/v1", "deepseek-ai/deepseek-vl2"],
            ["DeepSeek-OCR-2 · Novita", "https://api.novita.ai/openai", "deepseek/deepseek-ocr-2"],
            ["Ollama (local · free)", "http://localhost:11434/v1", "qwen2.5vl"],
          ] as const
        ).map(([label, baseUrl, model]) => (
          <button
            key={label}
            onClick={() => void update({ vision: { ...settings.vision, baseUrl, model } })}
            className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
              settings.vision.baseUrl === baseUrl && settings.vision.model === model
                ? "border-accent bg-accent-soft text-accent"
                : "border-border text-muted hover:bg-surface-2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <Row label={t("settings.vision.baseUrl")}>
        <input
          value={settings.vision.baseUrl}
          onChange={(e) => void update({ vision: { ...settings.vision, baseUrl: e.target.value } })}
          placeholder="http://localhost:11434/v1"
          className="w-56 rounded-md border border-border bg-surface px-2 py-1 text-[12px]"
        />
      </Row>
      <Row label={t("settings.vision.model")}>
        <input
          value={settings.vision.model}
          onChange={(e) => void update({ vision: { ...settings.vision, model: e.target.value } })}
          placeholder="llava / qwen-vl / gpt-4o-mini"
          className="w-56 rounded-md border border-border bg-surface px-2 py-1 text-[12px]"
        />
      </Row>
      <Row label={t("settings.computerUse")}>
        <label className="flex items-center gap-2 text-[11.5px] text-faint">
          <ToggleSwitch
            checked={settings.computerUse.enabled}
            disabled={!settings.vision.baseUrl || !settings.vision.model}
            label={t("settings.computerUse")}
            onChange={(v) => void update({ computerUse: { enabled: v } })}
          />
          {t("settings.computerUse.allow")}
        </label>
      </Row>
    </div>
  );
}

function McpTab() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings)!;
  const update = useAppStore((s) => s.updateSettings);
  const init = useAppStore((s) => s.init);
  const statuses = useUiStore((s) => s.mcpStatus);
  const [json, setJson] = useState("");
  const [err, setErr] = useState("");

  const importJson = async () => {
    try {
      const parsed = JSON.parse(json);
      const servers = parsed.mcpServers ?? parsed;
      const merged = { ...settings.mcpServers };
      for (const [name, cfg] of Object.entries(servers)) {
        merged[name] = { config: cfg as McpServerConfig, enabled: true };
      }
      await update({ mcpServers: merged });
      setJson("");
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const toggle = async (name: string, enabled: boolean) => {
    const entry = settings.mcpServers[name];
    if (!entry) return;
    await update({ mcpServers: { ...settings.mcpServers, [name]: { ...entry, enabled } } });
    await whalex.invoke("mcp:restart", { name });
  };

  const remove = async (name: string) => {
    const next = { ...settings.mcpServers };
    delete next[name];
    await update({ mcpServers: next });
  };

  const [adding, setAdding] = useState<string | null>(null);
  const enablePreset = async (name: string) => {
    setAdding(name);
    try {
      const cwd = settings.defaultCwd ?? ".";
      await whalex.invoke("mcp:enablePreset", { name, cwd });
      await init();
    } finally {
      setAdding(null);
    }
  };

  const installedNames = new Set(Object.keys(settings.mcpServers));

  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
        {t("settings.mcp.recommended")}
      </div>
      <div className="mb-3 grid grid-cols-1 gap-1.5">
        {MCP_PRESETS.filter((p) => !installedNames.has(p.name)).map((p) => (
          <div key={p.name} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[12.5px]">
                <span className="font-medium">{p.name}</span>
                <span className="rounded bg-surface-2 px-1 py-0.5 text-[9.5px] text-faint">{p.category}</span>
                {p.requiresSetup && <span className="text-[10px] text-warn">{t("settings.mcp.needsToken")}</span>}
              </div>
              <div className="truncate text-[11px] text-muted">{p.description}</div>
            </div>
            <button
              onClick={() => void enablePreset(p.name)}
              disabled={adding === p.name}
              className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {adding === p.name ? "…" : t("settings.mcp.add")}
            </button>
          </div>
        ))}
      </div>
      <div className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-faint">
        {t("settings.mcp.installed")}
      </div>
      <div className="mb-3 text-[12px] text-muted">{t("settings.mcp.importHint")}</div>
      {Object.entries(settings.mcpServers).map(([name, entry]) => {
        const status = statuses.find((s) => s.name === name);
        return (
          <div key={name} className="flex items-center gap-2 border-b border-border py-2.5">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                status?.state === "connected"
                  ? "bg-ok"
                  : status?.state === "error"
                    ? "bg-danger"
                    : status?.state === "connecting"
                      ? "bg-warn"
                      : "bg-faint"
              }`}
              title={status?.error ?? status?.state ?? ""}
            />
            <span className="text-[13px]">{name}</span>
            <span className="text-[11px] text-faint">
              {entry.config.type} · {t("settings.mcp.tools", { count: status?.toolCount ?? 0 })}
            </span>
            <div className="flex-1" />
            <ToggleSwitch checked={entry.enabled} label={name} onChange={(v) => void toggle(name, v)} />
            <button
              onClick={() => void remove(name)}
              title={t("settings.mcp.delete")}
              aria-label={t("settings.mcp.delete")}
              className="rounded-md p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        placeholder={'{\n  "mcpServers": {\n    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "."] }\n  }\n}'}
        rows={6}
        className="mt-3 w-full rounded-md border border-border bg-code-bg px-3 py-2 font-mono text-[11.5px] outline-none"
      />
      {err && <div className="mt-1 text-[11.5px] text-danger">{err}</div>}
      <button
        onClick={() => void importJson()}
        disabled={!json.trim()}
        className="mt-2 rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
      >
        {t("settings.mcp.import")}
      </button>
    </div>
  );
}

function SkillsTab() {
  const { t } = useTranslation();
  const cwd = useAppStore((s) => s.settings)?.defaultCwd;
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const refresh = () => void whalex.invoke("skills:list", { cwd }).then(setSkills);
  useEffect(refresh, [cwd]);

  const install = async () => {
    setBusy(true);
    setMsg("");
    const res = await whalex.invoke("skills:install", { source: source.trim() });
    setBusy(false);
    if (res.ok) {
      setSource("");
      setMsg(t("settings.skills.installed", { names: res.installed.join(", ") }));
      refresh();
    } else {
      setMsg(res.error ?? "");
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder={t("settings.skills.sourcePlaceholder")}
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-[11.5px] outline-none focus:border-accent"
        />
        <button
          onClick={() => void install()}
          disabled={busy || !source.trim()}
          className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
        >
          {busy ? "…" : t("settings.skills.install")}
        </button>
      </div>
      {msg && <div className="mb-2 text-[11.5px] text-muted">{msg}</div>}
      <div className="mb-3 text-[12px] text-muted">{t("settings.skills.hint")}</div>
      {skills.length === 0 && (
        <div className="py-4 text-[12.5px] text-faint">{t("settings.skills.empty")}</div>
      )}
      {skills.map((s) => (
        <div key={s.name} className={`border-b border-border py-2.5 ${s.enabled ? "" : "opacity-55"}`}>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium">/{s.name}</span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-faint">
              {s.source === "bundled" ? t("settings.skills.bundled") : s.source}
            </span>
            <div className="flex-1" />
            {s.source === "user" && (
              <button
                onClick={() =>
                  void whalex.invoke("skills:remove", { name: s.name }).then(refresh)
                }
                className="rounded px-1.5 py-0.5 text-[11px] text-faint hover:bg-surface-2 hover:text-danger"
              >
                {t("settings.skills.delete")}
              </button>
            )}
            <ToggleSwitch
              checked={s.enabled}
              label={s.name}
              onChange={(v) =>
                void whalex
                  .invoke("skills:toggle", { name: s.name, enabled: v })
                  .then(refresh)
              }
            />
          </div>
          <div className="text-[12px] text-muted">{s.description}</div>
        </div>
      ))}
    </div>
  );
}

function PluginsTab() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings)!;
  const init = useAppStore((s) => s.init);
  const [loc, setLoc] = useState("");
  const [src, setSrc] = useState<"local" | "git">("git");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const install = async () => {
    setBusy(true);
    setMsg("");
    const res = await whalex.invoke("plugins:install", { source: src, location: loc.trim() });
    setBusy(false);
    if (res.ok) {
      setLoc("");
      setMsg(`${res.name}`);
      await init();
    } else {
      setMsg(res.error ?? "");
    }
  };
  const remove = async (name: string) => {
    await whalex.invoke("plugins:remove", { name });
    await init();
  };

  return (
    <div>
      {settings.plugins.map((p) => (
        <div key={p.name} className="flex items-center gap-2 border-b border-border py-2.5">
          <span className="text-[13px]">{p.name}</span>
          <span className="text-[11px] text-faint">{p.version} · {p.source}</span>
          <div className="flex-1" />
          <button onClick={() => void remove(p.name)} className="text-[11px] text-danger hover:underline">
            {t("settings.plugins.remove")}
          </button>
        </div>
      ))}
      <div className="mt-3 flex gap-2">
        <select
          value={src}
          onChange={(e) => setSrc(e.target.value as "local" | "git")}
          className="rounded-md border border-border bg-surface px-2 py-1 text-[12px]"
        >
          <option value="git">{t("settings.plugins.gitUrl")}</option>
          <option value="local">{t("settings.plugins.localFolder")}</option>
        </select>
        <input
          value={loc}
          onChange={(e) => setLoc(e.target.value)}
          placeholder={src === "git" ? "https://github.com/..." : "C:\\path\\to\\plugin"}
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-[12px]"
        />
        <button
          onClick={() => void install()}
          disabled={!loc.trim() || busy}
          className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
        >
          {busy ? t("settings.plugins.installing") : t("settings.plugins.install")}
        </button>
      </div>
      {msg && <div className="mt-2 text-[12px] text-muted">{msg}</div>}
    </div>
  );
}

function AppearanceTab() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings)!;
  const update = useAppStore((s) => s.updateSettings);
  return (
    <Row label={t("settings.theme")}>
      <select
        value={settings.theme}
        onChange={(e) => void update({ theme: e.target.value as "system" | "light" | "dark" })}
        className="rounded-md border border-border bg-surface px-2 py-1 text-[12.5px]"
      >
        <option value="system">{t("settings.language.system")}</option>
        <option value="light">{t("settings.theme.light")}</option>
        <option value="dark">{t("settings.theme.dark")}</option>
      </select>
    </Row>
  );
}

function UpdatesTab() {
  const { t } = useTranslation();
  const version = useAppStore((s) => s.version);
  const status = useUiStore((s) => s.updateStatus);
  const [busy, setBusy] = useState(false);
  // Reset once the main process reports progress (or the update errors out),
  // so the button never stays stuck disabled after a failed attempt.
  useEffect(() => {
    if (status.state !== "available") setBusy(false);
  }, [status.state]);
  const statusText =
    status.state === "current"
      ? t("settings.update.current")
      : status.state === "available"
        ? t("settings.update.available", { version: status.version })
        : status.state === "downloading"
          ? t("settings.update.downloading", { percent: status.percent })
          : status.state === "downloaded"
            ? t("settings.update.ready")
            : status.state === "error"
              ? t("settings.update.error", { error: status.error })
              : status.state;
  return (
    <div>
      <Row label={t("settings.update.version")}>
        <span className="text-[12.5px] text-muted">{version}</span>
      </Row>
      <Row label={t("settings.update.status")}>
        <span className="text-[12.5px] text-muted">{statusText}</span>
      </Row>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => void whalex.invoke("update:check", undefined)}
          className="rounded-md border border-border px-3 py-1.5 text-[12.5px] hover:bg-surface-2"
        >
          {t("settings.update.check")}
        </button>
        {status.state === "available" && (
          <button
            onClick={() => {
              setBusy(true);
              void whalex.invoke("update:download", undefined);
            }}
            disabled={busy}
            className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {busy ? t("update.starting") : t("settings.update.download")}
          </button>
        )}
        {status.state === "downloaded" && (
          <button
            onClick={() => void whalex.invoke("update:install", undefined)}
            className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent-hover"
          >
            {t("settings.update.restart")}
          </button>
        )}
      </div>
    </div>
  );
}

function UsageTab() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings)!;
  const update = useAppStore((s) => s.updateSettings);
  const [data, setData] = useState<IpcResponse<"usage:summary"> | null>(null);
  const limits = settings.usageLimits;

  useEffect(() => {
    void whalex
      .invoke("usage:summary", { days: 30, includeBalance: true })
      .then(setData)
      .catch(() => {});
  }, []);

  const maxUsd = Math.max(0.000001, ...(data?.days.map((d) => d.usd) ?? [0]));
  const fmtTokens = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;
  const numInput = (
    value: number,
    onChange: (n: number) => void,
    step = 1,
  ): React.ReactNode => (
    <input
      type="number"
      min={0}
      step={step}
      value={value}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-right text-[12.5px]"
    />
  );

  return (
    <div>
      <Row label={t("usage.balance")}>
        {data?.balance ? (
          <span
            className="text-[13px] font-semibold tabular-nums"
            title={`${t("usage.balance.granted")} ${data.balance.granted} · ${t("usage.balance.toppedUp")} ${data.balance.toppedUp}`}
          >
            {data.balance.currency} {data.balance.total.toFixed(2)}
          </span>
        ) : data?.balanceError ? (
          <span className="text-[12px] text-danger">{data.balanceError}</span>
        ) : (
          <span className="text-[12px] text-faint">{t("usage.balance.none")}</span>
        )}
      </Row>
      <Row label={t("usage.today")}>
        <span className="tabular-nums">${(data?.todayUsd ?? 0).toFixed(2)}</span>
      </Row>
      <Row label={t("usage.month")}>
        <span className="tabular-nums">
          ${(data?.monthUsd ?? 0).toFixed(2)}
          {limits.monthlyUsd > 0 && (
            <span className="text-faint"> / ${limits.monthlyUsd.toFixed(2)}</span>
          )}
        </span>
      </Row>

      <div className="mt-5 mb-2 text-[12px] font-semibold text-muted">{t("usage.last30")}</div>
      <div className="flex h-24 items-end gap-[2px] rounded-md border border-border bg-surface-2/40 p-2">
        {(data?.days ?? []).map((d, i, arr) => (
          <div
            key={d.date}
            title={`${d.date} · $${d.usd.toFixed(3)} · ↑${fmtTokens(d.input)} ↓${fmtTokens(d.output)}`}
            className="group flex h-full flex-1 items-end"
          >
            <div
              className={`w-full rounded-sm transition-colors group-hover:bg-accent ${
                i === arr.length - 1 ? "bg-accent" : "bg-accent/40"
              }`}
              style={{ height: `${Math.max(d.usd > 0 ? 4 : 1, (d.usd / maxUsd) * 100)}%` }}
            />
          </div>
        ))}
      </div>

      {data && Object.keys(data.byModel).length > 0 && (
        <table className="mt-3 w-full text-[12px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-faint">
              <th className="py-1 font-medium">{t("usage.model")}</th>
              <th className="py-1 text-right font-medium">{t("usage.tokens")}</th>
              <th className="py-1 text-right font-medium">{t("usage.cacheRate")}</th>
              <th className="py-1 text-right font-medium">{t("usage.cost")}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.byModel)
              .sort(([, a], [, b]) => b.usd - a.usd)
              .map(([model, b]) => (
                <tr key={model} className="border-t border-border">
                  <td className="py-1.5 font-mono">{model}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    ↑{fmtTokens(b.input)} ↓{fmtTokens(b.output)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {b.input > 0 ? Math.round((b.cachedInput / b.input) * 100) : 0}%
                  </td>
                  <td className="py-1.5 text-right tabular-nums">${b.usd.toFixed(3)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      <div className="mt-5 mb-1 text-[12px] font-semibold text-muted">{t("usage.limits")}</div>
      <div className="mb-2 text-[11.5px] text-faint">{t("usage.limits.desc")}</div>
      <Row label={t("usage.limits.daily")}>
        {numInput(limits.dailyUsd, (n) => void update({ usageLimits: { ...limits, dailyUsd: n } }), 0.5)}
      </Row>
      <Row label={t("usage.limits.monthly")}>
        {numInput(limits.monthlyUsd, (n) => void update({ usageLimits: { ...limits, monthlyUsd: n } }), 1)}
      </Row>
      <Row label={t("usage.limits.warnAt")}>
        <input
          type="number"
          min={1}
          max={100}
          value={limits.warnAtPct}
          onChange={(e) =>
            void update({
              usageLimits: {
                ...limits,
                warnAtPct: Math.min(100, Math.max(1, Math.floor(Number(e.target.value)) || 80)),
              },
            })
          }
          className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-right text-[12.5px]"
        />
      </Row>
      <Row label={t("usage.limits.hardStop")}>
        <ToggleSwitch
          checked={limits.hardStop}
          label={t("usage.limits.hardStop")}
          onChange={(v) => void update({ usageLimits: { ...limits, hardStop: v } })}
        />
      </Row>
      <Row label={t("usage.limits.lowBalance")}>
        {numInput(limits.lowBalance, (n) => void update({ usageLimits: { ...limits, lowBalance: n } }), 1)}
      </Row>
    </div>
  );
}

/** 2021-08-01 was a Sunday; +weekday lands on the right localized day name. */
function weekdayName(weekday: number, lang: string): string {
  return new Intl.DateTimeFormat(lang, { weekday: "short" }).format(new Date(2021, 7, 1 + weekday));
}

/** Read-only summary of the schedule the model parsed from the prompt. */
function scheduleSummary(
  r: Routine,
  t: (k: string, o?: Record<string, unknown>) => string,
  lang: string,
): string {
  const s = r.schedule;
  switch (s.kind) {
    case "interval":
      return t("settings.routines.summary.interval", { n: s.minutes });
    case "daily":
      return t("settings.routines.summary.daily", { time: s.time });
    case "weekly":
      return t("settings.routines.summary.weekly", { day: weekdayName(s.weekday, lang), time: s.time });
    case "once":
      return t("settings.routines.summary.once", {
        at: new Date(s.at).toLocaleString(lang, { dateStyle: "short", timeStyle: "short" }),
      });
    case "manual":
      return t("settings.routines.summary.manual");
  }
}

/** Draft being created or edited. No schedule field — it's parsed on save. */
interface RoutineDraft {
  id?: string;
  name: string;
  prompt: string;
  cwd: string;
  permissionMode: Routine["permissionMode"];
}

function RoutinesTab() {
  const { t, i18n } = useTranslation();
  const settings = useAppStore((s) => s.settings)!;
  const update = useAppStore((s) => s.updateSettings);
  const refreshState = useAppStore((s) => s.refreshState);
  const [editing, setEditing] = useState<RoutineDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [runState, setRunState] = useState<Record<string, string>>({});
  const lang = i18n.language;

  // Routines can be created from a chat session too, so pull the latest each
  // time this tab opens — the list is the single place they're managed.
  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  const blank = (): RoutineDraft => ({
    name: "",
    prompt: "",
    cwd: settings.defaultCwd ?? settings.recentCwds[0] ?? "",
    permissionMode: "acceptEdits",
  });

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setSaveError(null);
    // The model parses the schedule from the prompt on the main side.
    const res = await whalex.invoke("routines:save", {
      id: editing.id,
      prompt: editing.prompt,
      name: editing.name.trim() || undefined,
      cwd: editing.cwd,
      permissionMode: editing.permissionMode,
    });
    setSaving(false);
    if (!res.ok) {
      setSaveError(res.error ?? "error");
      return;
    }
    await refreshState();
    setEditing(null);
  };

  const runNow = async (id: string) => {
    setRunState((m) => ({ ...m, [id]: "…" }));
    const res = await whalex.invoke("routines:run", { id });
    setRunState((m) => ({
      ...m,
      [id]: res.ok ? t("settings.routines.started") : (res.error ?? "error"),
    }));
    // Main patched lastRunAt/lastSessionId behind our back — pull it in.
    await refreshState();
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-3 py-1">
        <label className="flex flex-col gap-1 text-[12px] text-muted">
          {t("settings.routines.prompt")}
          <textarea
            value={editing.prompt}
            onChange={(e) => setEditing({ ...editing, prompt: e.target.value })}
            placeholder={t("settings.routines.promptPlaceholder")}
            rows={4}
            className="resize-y rounded-md border border-border bg-surface px-2 py-1.5 text-[12.5px] leading-relaxed text-text outline-none focus:border-accent"
          />
        </label>
        <div className="text-[11px] text-faint">{t("settings.routines.promptHint")}</div>
        <label className="flex flex-col gap-1 text-[12px] text-muted">
          {t("settings.routines.name")}
          <input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder={t("settings.routines.namePlaceholder")}
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-[12.5px] text-text outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">
          {t("settings.routines.cwd")}
          <div className="flex gap-1.5">
            <input
              value={editing.cwd}
              onChange={(e) => setEditing({ ...editing, cwd: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-[12px] text-text outline-none focus:border-accent"
            />
            <button
              onClick={() =>
                void whalex.invoke("dialog:pickFolder", undefined).then((r) => {
                  if (r.path) setEditing((e) => (e ? { ...e, cwd: r.path! } : e));
                })
              }
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[12px] text-muted hover:bg-surface-2"
            >
              <FolderOpen size={13} />
            </button>
          </div>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">
          {t("settings.routines.mode")}
          <select
            value={editing.permissionMode}
            onChange={(e) =>
              setEditing({ ...editing, permissionMode: e.target.value as Routine["permissionMode"] })
            }
            className="w-fit rounded-md border border-border bg-surface px-2 py-1.5 text-[12.5px] text-text"
          >
            <option value="acceptEdits">{t("settings.mode.acceptEdits")}</option>
            <option value="default">{t("settings.mode.default")}</option>
            <option value="bypassPermissions">{t("settings.mode.bypass")}</option>
            <option value="unrestricted">{t("settings.mode.unrestricted")}</option>
          </select>
        </label>
        {saveError && <div className="text-[11.5px] text-danger">{saveError}</div>}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => void save()}
            disabled={!editing.prompt.trim() || !editing.cwd.trim() || saving}
            className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {saving ? t("settings.routines.parsing") : t("settings.routines.save")}
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setSaveError(null);
            }}
            className="rounded-md border border-border px-3 py-1.5 text-[12.5px] text-muted hover:bg-surface-2"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 text-[11.5px] text-faint">{t("settings.routines.desc")}</div>
      {settings.routines.length === 0 && (
        <div className="mb-3 rounded-md border border-dashed border-border px-3 py-4 text-center text-[12px] text-faint">
          {t("settings.routines.empty")}
        </div>
      )}
      {settings.routines.map((r) => (
        <div key={r.id} className="flex items-center gap-2 border-b border-border py-2.5">
          <button
            onClick={() =>
              setEditing({
                id: r.id,
                name: r.name,
                prompt: r.prompt,
                cwd: r.cwd,
                permissionMode: r.permissionMode,
              })
            }
            className="min-w-0 flex-1 text-left"
            title={r.prompt}
          >
            <div className="truncate text-[13px]">{r.name}</div>
            <div className="truncate text-[11.5px] text-faint">
              {scheduleSummary(r, t, lang)} · {r.cwd}
              {r.lastRunAt
                ? ` · ${t("settings.routines.lastRun", {
                    at: new Date(r.lastRunAt).toLocaleString(lang, {
                      dateStyle: "short",
                      timeStyle: "short",
                    }),
                  })}`
                : ""}
            </div>
          </button>
          {runState[r.id] && (
            <span className="max-w-32 truncate text-[11px] text-muted">{runState[r.id]}</span>
          )}
          <button
            onClick={() => void runNow(r.id)}
            title={t("settings.routines.runNow")}
            className="rounded p-1 text-muted hover:text-accent"
          >
            <Play size={14} />
          </button>
          <ToggleSwitch
            checked={r.enabled}
            label={r.name}
            onChange={(v) =>
              void update({
                routines: settings.routines.map((x) => (x.id === r.id ? { ...x, enabled: v } : x)),
              })
            }
          />
          <button
            onClick={() =>
              void update({ routines: settings.routines.filter((x) => x.id !== r.id) })
            }
            title={t("settings.mcp.delete")}
            className="rounded p-1 text-faint hover:text-danger"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        onClick={() => setEditing(blank())}
        className="mt-3 rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent-hover"
      >
        {t("settings.routines.add")}
      </button>
    </div>
  );
}

function RemoteTab() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings)!;
  const update = useAppStore((s) => s.updateSettings);
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [qr, setQr] = useState<{ dataUrl: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const bridge = settings.remoteBridge;

  const refresh = () => void whalex.invoke("remote:status", undefined).then(setStatus);
  useEffect(() => {
    refresh();
    return whalex.on("remote:status", setStatus);
  }, []);

  // The QR countdown; the payload dies with the pairing window.
  useEffect(() => {
    if (!qr) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [qr]);
  const remaining = qr ? Math.max(0, Math.ceil((qr.expiresAt - now) / 1000)) : 0;
  useEffect(() => {
    if (qr && remaining <= 0) setQr(null);
  }, [qr, remaining]);
  useEffect(() => {
    // Leaving the tab mid-pairing closes the window — no orphaned secrets.
    return () => {
      void whalex.invoke("remote:pairingCancel", undefined);
    };
  }, []);

  const pair = async () => {
    const res = await whalex.invoke("remote:pairingStart", undefined);
    const dataUrl = await QRCode.toDataURL(res.qrPayload, {
      width: 432, // 2× for crisp rendering on a HiDPI display
      margin: 0,
      // High correction leaves room for the logo patch in the middle.
      errorCorrectionLevel: "H",
      color: { dark: "#0B1220", light: "#FFFFFF" },
    });
    setQr({ dataUrl, expiresAt: res.expiresAt });
  };

  const setEnabled = async (v: boolean) => {
    if (!v) setQr(null);
    await update({ remoteBridge: { ...bridge, enabled: v } });
    refresh();
  };

  const devices = status?.devices ?? bridge.devices;
  const connectedIds = new Set((status?.connected ?? []).map((c) => c.deviceId));

  return (
    <div>
      <Row label={t("settings.remote.enable")} hint={t("settings.remote.enable.hint")}>
        <ToggleSwitch
            checked={bridge.enabled}
            label={t("settings.remote.enable")}
            onChange={(v) => void setEnabled(v)}
          />
      </Row>
      <Row label={t("settings.remote.tunnel")} hint={t("settings.remote.tunnel.hint")}>
        <ToggleSwitch
            checked={bridge.tunnel}
            label={t("settings.remote.tunnel")}
            onChange={(v) => void update({ remoteBridge: { ...bridge, tunnel: v } }).then(refresh)}
          />
      </Row>
      {bridge.tunnel && status && (
        <Row label={t("settings.remote.tunnel.status")}>
          <span className="text-[11.5px] text-faint">
            {status.tunnel.state === "up" ? (
              <span className="font-mono text-accent">{status.tunnel.url}</span>
            ) : status.tunnel.state === "downloading" ? (
              t("settings.remote.tunnel.downloading")
            ) : status.tunnel.state === "starting" ? (
              t("settings.remote.tunnel.starting")
            ) : status.tunnel.state === "error" ? (
              <span className="text-danger">{status.tunnel.message}</span>
            ) : (
              t("settings.remote.off")
            )}
          </span>
        </Row>
      )}
      {/* Everything below is for people fronting the bridge themselves. The
          two toggles above are the whole setup for everyone else, so these
          stay folded rather than reading as required fields. */}
      <details className="mt-3">
        <summary className="cursor-pointer list-none py-2 text-[12px] text-faint hover:text-muted">
          {t("settings.remote.advanced")}
        </summary>
      <Row label={t("settings.remote.insecure")} hint={t("settings.remote.insecure.hint")}>
        <ToggleSwitch
            checked={bridge.insecure}
            label={t("settings.remote.insecure")}
            onChange={(v) => void update({ remoteBridge: { ...bridge, insecure: v } }).then(refresh)}
          />
      </Row>
      <Row label={t("settings.remote.port")}>
        <input
          type="number"
          defaultValue={bridge.port}
          min={1024}
          max={65535}
          onBlur={(e) => {
            const port = Math.min(65535, Math.max(1024, Number(e.target.value) || bridge.port));
            if (port !== bridge.port) {
              void update({ remoteBridge: { ...bridge, port } }).then(refresh);
            }
          }}
          className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-right text-[12.5px]"
        />
      </Row>
      <Row label={t("settings.remote.publicUrl")}>
        <input
          type="text"
          defaultValue={bridge.publicUrl}
          placeholder="https://example.com/whalex"
          onBlur={(e) => {
            const publicUrl = e.target.value.trim().replace(/\/+$/, "");
            if (publicUrl !== bridge.publicUrl) {
              void update({ remoteBridge: { ...bridge, publicUrl } }).then(refresh);
            }
          }}
          className="w-64 rounded-md border border-border bg-surface px-2 py-1 text-[12.5px]"
        />
      </Row>
      <div className="pb-2 text-[11.5px] text-faint">{t("settings.remote.publicUrl.hint")}</div>
      {status?.running && status.addresses.length > 0 && (
        <Row label={t("settings.remote.addresses")}>
          <span className="font-mono text-[11.5px] text-faint">
            {status.addresses.map((ip) => `${ip}:${status.port}`).join("  ")}
          </span>
        </Row>
      )}
      </details>

      <div className="mt-5 mb-2 text-[12px] font-semibold text-muted">
        {t("settings.remote.pair")}
      </div>
      {!status?.running ? (
        <div className="py-2 text-[12px] text-faint">{t("settings.remote.off")}</div>
      ) : qr ? (
        <div className="flex flex-col items-center py-3">
          {/* A quiet card around the code: the phone's camera wants a clean
              white field, and the frame keeps it from floating on the panel. */}
          <div className="rounded-2xl border border-border bg-surface-2 p-5 shadow-sm">
            <div className="relative rounded-xl bg-white p-4">
              <img src={qr.dataUrl} alt="" width={216} height={216} className="block" />
              {/* The mark sits in the code's own error-correction margin. */}
              <div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-white shadow">
                <img src={whalexMark} alt="" className="h-8 w-8" />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              <span className="text-[12px] text-muted">{t("settings.remote.pair.hint")}</span>
            </div>
            <div className="mt-1 text-center text-[11.5px] text-faint">
              {t("settings.remote.pair.expires", { s: remaining })}
            </div>
          </div>
          <button
            onClick={() => void pair()}
            className="mt-3 text-[11.5px] text-faint hover:text-text"
          >
            {t("settings.remote.pair.regenerate")}
          </button>
        </div>
      ) : (
        <button
          onClick={() => void pair()}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12.5px] hover:bg-surface-2"
        >
          <Smartphone size={14} />
          {t("settings.remote.pair")}
        </button>
      )}

      <div className="mt-5 mb-2 text-[12px] font-semibold text-muted">
        {t("settings.remote.devices")}
      </div>
      {devices.length === 0 ? (
        <div className="py-2 text-[12px] text-faint">{t("settings.remote.devices.none")}</div>
      ) : (
        devices.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between gap-4 border-b border-border py-2.5"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Smartphone size={14} className="shrink-0 text-faint" />
              <span className="truncate text-[12.5px]">{d.name}</span>
              {connectedIds.has(d.id) && (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] text-accent">
                  {t("settings.remote.connected")}
                </span>
              )}
            </div>
            <button
              onClick={() => void whalex.invoke("remote:revokeDevice", { id: d.id }).then(refresh)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-faint hover:text-danger"
            >
              <Trash2 size={13} />
              {t("settings.remote.revoke")}
            </button>
          </div>
        ))
      )}
    </div>
  );
}

export function SettingsModal() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.settingsOpen);
  const tab = useUiStore((s) => s.settingsTab);
  const setTab = (id: SettingsTab) => useUiStore.setState({ settingsTab: id });
  const close = useUiStore((s) => s.closeSettings);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation(); // don't let Esc also abort the running turn
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={close}>
      <div
        className="flex h-[560px] w-[720px] max-w-[92vw] overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-40 shrink-0 border-r border-border bg-surface-2 py-3">
          {TABS.map((tt) => {
            const Icon = tt.icon;
            return (
              <button
                key={tt.id}
                onClick={() => setTab(tt.id)}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-[12.5px] ${tab === tt.id ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface"}`}
              >
                <Icon size={14} />
                {t(tt.labelKey)}
              </button>
            );
          })}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <span className="text-[14px] font-semibold">
              {t(TABS.find((x) => x.id === tab)?.labelKey ?? "settings.tab.general")}
            </span>
            <button onClick={close} className="rounded p-1 text-faint hover:text-text">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-3">
            {tab === "general" && <GeneralTab />}
            {tab === "apikey" && <ApiKeyTab />}
            {tab === "models" && <ModelsTab />}
            {tab === "mcp" && <McpTab />}
            {tab === "skills" && <SkillsTab />}
            {tab === "routines" && <RoutinesTab />}
            {tab === "usage" && <UsageTab />}
            {tab === "plugins" && <PluginsTab />}
            {tab === "remote" && <RemoteTab />}
            {tab === "appearance" && <AppearanceTab />}
            {tab === "updates" && <UpdatesTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
