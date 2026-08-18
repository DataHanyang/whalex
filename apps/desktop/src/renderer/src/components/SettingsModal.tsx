import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Blocks,
  CalendarClock,
  Cpu,
  FolderOpen,
  KeyRound,
  Palette,
  Play,
  Plug,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { MCP_PRESETS, type McpServerConfig, type Routine, type SkillInfo } from "@whalex/shared";
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
  { id: "plugins", labelKey: "settings.tab.plugins", icon: Blocks },
  { id: "appearance", labelKey: "settings.tab.appearance", icon: Palette },
  { id: "updates", labelKey: "settings.tab.updates", icon: RefreshCw },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3">
      <span className="text-[13px]">{label}</span>
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
          <option value="en">English</option>
          <option value="ko">한국어</option>
          <option value="zh">中文</option>
          <option value="ja">日本語</option>
          <option value="fr">Français</option>
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
      <Row label={t("settings.privacy.redact")}>
        <ToggleSwitch
          checked={settings.redactSecrets}
          label={t("settings.privacy.redact")}
          onChange={(v) => void update({ redactSecrets: v })}
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

function ApiKeyTab() {
  const { t } = useTranslation();
  const secrets = useAppStore((s) => s.secrets);
  const refreshModels = useAppStore((s) => s.refreshModels);
  const refreshState = useAppStore((s) => s.refreshState);
  const [key, setKey] = useState("");
  const [state, setState] = useState<{ s: "idle" | "testing" | "ok" | "err"; msg?: string }>({ s: "idle" });
  const tail = secrets["deepseek-api-key"];

  const save = async () => {
    setState({ s: "testing" });
    const res = await whalex.invoke("provider:test", { providerId: "deepseek", apiKey: key.trim() });
    if (res.ok) {
      await whalex.invoke("secrets:set", { ref: "deepseek-api-key", value: key.trim() });
      setKey("");
      setState({ s: "ok", msg: t("settings.apikey.connected", { count: res.models.length }) });
      await refreshState();
      await refreshModels();
    } else {
      setState({ s: "err", msg: res.error });
    }
  };

  return (
    <div>
      <Row label={t("settings.apikey.label")}>
        <span className="font-mono text-[12px] text-muted">{tail ?? t("settings.apikey.unset")}</span>
      </Row>
      <div className="mt-4">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-..."
          className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-[12.5px] outline-none focus:border-accent"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => void save()}
            disabled={key.trim().length < 8 || state.s === "testing"}
            className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {state.s === "testing" ? t("settings.apikey.testing") : t("settings.apikey.save")}
          </button>
          {state.s === "ok" && <span className="text-[12px] text-ok">{state.msg}</span>}
          {state.s === "err" && <span className="text-[12px] text-danger">{state.msg}</span>}
        </div>
      </div>
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
      <div className="mt-5 mb-2 text-[12px] font-semibold text-muted">{t("settings.vision.title")}</div>
      <div className="mb-2 text-[11.5px] text-faint">{t("settings.vision.desc")}</div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            // DeepSeek's own API is text-only; these serve DeepSeek-family VLMs
            // over the same OpenAI-compatible protocol (bring your own key).
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

/** Small on/off switch — settings rows use this instead of a bare checkbox. */
function ToggleSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  /** Accessible name — screen readers otherwise announce a nameless switch. */
  label?: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        checked ? "bg-accent" : "bg-border"
      }`}
    >
      <span
        className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all ${
          checked ? "left-[16px]" : "left-[2px]"
        }`}
      />
    </button>
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
        <div key={s.name} className="border-b border-border py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium">/{s.name}</span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-faint">{s.source}</span>
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

/** 2021-08-01 was a Sunday; +weekday lands on the right localized day name. */
function weekdayName(weekday: number, lang: string): string {
  return new Intl.DateTimeFormat(lang, { weekday: "short" }).format(new Date(2021, 7, 1 + weekday));
}

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
  }
}

/** Epoch ms ↔ the value format <input type="datetime-local"> speaks. */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function RoutinesTab() {
  const { t, i18n } = useTranslation();
  const settings = useAppStore((s) => s.settings)!;
  const update = useAppStore((s) => s.updateSettings);
  const refreshState = useAppStore((s) => s.refreshState);
  const [editing, setEditing] = useState<Routine | null>(null);
  const [runState, setRunState] = useState<Record<string, string>>({});
  const lang = i18n.language;

  const blank = (): Routine => ({
    id: crypto.randomUUID(),
    name: "",
    prompt: "",
    cwd: settings.defaultCwd ?? settings.recentCwds[0] ?? "",
    schedule: { kind: "daily", time: "09:00" },
    permissionMode: "acceptEdits",
    enabled: true,
  });

  const save = async () => {
    if (!editing) return;
    const r = { ...editing, name: editing.name.trim() || t("settings.routines.untitled") };
    const exists = settings.routines.some((x) => x.id === r.id);
    await update({
      routines: exists
        ? settings.routines.map((x) => (x.id === r.id ? r : x))
        : [...settings.routines, r],
    });
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

  const setSchedule = (schedule: Routine["schedule"]) =>
    setEditing((e) => (e ? { ...e, schedule } : e));

  if (editing) {
    const s = editing.schedule;
    return (
      <div className="flex flex-col gap-3 py-1">
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
          {t("settings.routines.prompt")}
          <textarea
            value={editing.prompt}
            onChange={(e) => setEditing({ ...editing, prompt: e.target.value })}
            placeholder={t("settings.routines.promptPlaceholder")}
            rows={4}
            className="resize-y rounded-md border border-border bg-surface px-2 py-1.5 text-[12.5px] leading-relaxed text-text outline-none focus:border-accent"
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
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[12px] text-muted">
            {t("settings.routines.schedule")}
            <select
              value={s.kind}
              onChange={(e) => {
                const kind = e.target.value as Routine["schedule"]["kind"];
                if (kind === "interval") setSchedule({ kind, minutes: 60 });
                else if (kind === "daily") setSchedule({ kind, time: "09:00" });
                else if (kind === "weekly") setSchedule({ kind, weekday: 1, time: "09:00" });
                else setSchedule({ kind: "once", at: Date.now() + 3_600_000 });
              }}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-[12.5px] text-text"
            >
              <option value="interval">{t("settings.routines.kind.interval")}</option>
              <option value="daily">{t("settings.routines.kind.daily")}</option>
              <option value="weekly">{t("settings.routines.kind.weekly")}</option>
              <option value="once">{t("settings.routines.kind.once")}</option>
            </select>
          </label>
          {s.kind === "interval" && (
            <label className="flex flex-col gap-1 text-[12px] text-muted">
              {t("settings.routines.minutes")}
              <input
                type="number"
                min={5}
                max={10080}
                value={s.minutes}
                onChange={(e) =>
                  setSchedule({
                    kind: "interval",
                    minutes: Math.min(10080, Math.max(5, Math.floor(Number(e.target.value)) || 5)),
                  })
                }
                className="w-24 rounded-md border border-border bg-surface px-2 py-1.5 text-[12.5px] text-text"
              />
            </label>
          )}
          {s.kind === "weekly" && (
            <select
              value={s.weekday}
              aria-label={t("settings.routines.schedule")}
              onChange={(e) => setSchedule({ ...s, weekday: Number(e.target.value) })}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-[12.5px] text-text"
            >
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <option key={d} value={d}>
                  {weekdayName(d, lang)}
                </option>
              ))}
            </select>
          )}
          {(s.kind === "daily" || s.kind === "weekly") && (
            <input
              type="time"
              value={s.time}
              aria-label={t("settings.routines.schedule")}
              onChange={(e) => setSchedule({ ...s, time: e.target.value || "09:00" })}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-[12.5px] text-text"
            />
          )}
          {s.kind === "once" && (
            <input
              type="datetime-local"
              value={toLocalInput(s.at)}
              aria-label={t("settings.routines.schedule")}
              onChange={(e) => {
                const ms = new Date(e.target.value).getTime();
                if (!Number.isNaN(ms)) setSchedule({ kind: "once", at: ms });
              }}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-[12.5px] text-text"
            />
          )}
        </div>
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
          </select>
        </label>
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => void save()}
            disabled={!editing.prompt.trim() || !editing.cwd.trim()}
            className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {t("settings.routines.save")}
          </button>
          <button
            onClick={() => setEditing(null)}
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
            onClick={() => setEditing(r)}
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
            {tab === "plugins" && <PluginsTab />}
            {tab === "appearance" && <AppearanceTab />}
            {tab === "updates" && <UpdatesTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
