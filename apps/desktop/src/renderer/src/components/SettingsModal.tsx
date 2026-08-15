import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Blocks,
  Cpu,
  KeyRound,
  Palette,
  Plug,
  RefreshCw,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import type { McpServerConfig, SkillInfo } from "@whalex/shared";
import { useAppStore } from "../stores/appStore";
import { useUiStore, type SettingsTab } from "../stores/uiStore";
import { whalex } from "../lib/ipc";

const TABS: Array<{ id: SettingsTab; label: string; icon: typeof Settings2 }> = [
  { id: "general", label: "일반", icon: Settings2 },
  { id: "apikey", label: "API 키", icon: KeyRound },
  { id: "models", label: "모델", icon: Cpu },
  { id: "mcp", label: "MCP", icon: Plug },
  { id: "skills", label: "Skills", icon: Sparkles },
  { id: "plugins", label: "플러그인", icon: Blocks },
  { id: "appearance", label: "테마", icon: Palette },
  { id: "updates", label: "업데이트", icon: RefreshCw },
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
  const settings = useAppStore((s) => s.settings)!;
  const update = useAppStore((s) => s.updateSettings);
  return (
    <div>
      <Row label="언어">
        <select
          value={settings.language}
          onChange={(e) => void update({ language: e.target.value as "system" | "ko" | "en" })}
          className="rounded-md border border-border bg-surface px-2 py-1 text-[12.5px]"
        >
          <option value="system">시스템</option>
          <option value="ko">한국어</option>
          <option value="en">English</option>
        </select>
      </Row>
      <Row label="기본 권한 모드">
        <select
          value={settings.permissions.mode}
          onChange={(e) =>
            void update({ permissions: { ...settings.permissions, mode: e.target.value as never } })
          }
          className="rounded-md border border-border bg-surface px-2 py-1 text-[12.5px]"
        >
          <option value="default">기본 (쓰기/실행 확인)</option>
          <option value="acceptEdits">편집 자동 승인</option>
          <option value="bypassPermissions">전체 자동 (주의)</option>
          <option value="plan">계획 모드 (읽기 전용)</option>
        </select>
      </Row>
    </div>
  );
}

function ApiKeyTab() {
  const secrets = useAppStore((s) => s.secrets);
  const refreshModels = useAppStore((s) => s.refreshModels);
  const [key, setKey] = useState("");
  const [state, setState] = useState<{ s: "idle" | "testing" | "ok" | "err"; msg?: string }>({ s: "idle" });
  const tail = secrets["deepseek-api-key"];

  const save = async () => {
    setState({ s: "testing" });
    const res = await whalex.invoke("provider:test", { providerId: "deepseek", apiKey: key.trim() });
    if (res.ok) {
      await whalex.invoke("secrets:set", { ref: "deepseek-api-key", value: key.trim() });
      setKey("");
      setState({ s: "ok", msg: `${res.models.length}개 모델` });
      await refreshModels();
    } else {
      setState({ s: "err", msg: res.error });
    }
  };

  return (
    <div>
      <Row label="DeepSeek API 키">
        <span className="font-mono text-[12px] text-muted">{tail ?? "미설정"}</span>
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
            {state.s === "testing" ? "확인 중..." : "저장 및 연결 확인"}
          </button>
          {state.s === "ok" && <span className="text-[12px] text-ok">연결됨 · {state.msg}</span>}
          {state.s === "err" && <span className="text-[12px] text-danger">{state.msg}</span>}
        </div>
      </div>
    </div>
  );
}

function ModelsTab() {
  const settings = useAppStore((s) => s.settings)!;
  const update = useAppStore((s) => s.updateSettings);
  const models = useAppStore((s) => s.models);
  return (
    <div>
      <Row label="기본 모델">
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
      <Row label={`Temperature (${settings.temperature})`}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={settings.temperature}
          onChange={(e) => void update({ temperature: Number(e.target.value) })}
        />
      </Row>
      <Row label="SuperCode 최대 에이전트 수">
        <input
          type="number"
          min={1}
          max={200}
          value={settings.superCode.maxAgents}
          onChange={(e) =>
            void update({ superCode: { ...settings.superCode, maxAgents: Number(e.target.value) } })
          }
          className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-[12.5px]"
        />
      </Row>
      <div className="mt-5 mb-2 text-[12px] font-semibold text-muted">비전 (선택)</div>
      <div className="mb-2 text-[11.5px] text-faint">
        DeepSeek는 이미지를 볼 수 없습니다. 이미지 이해가 필요하면 OpenAI 호환 비전 모델을
        연결하세요 (예: 로컬 Ollama <code>http://localhost:11434/v1</code> + <code>llava</code>).
      </div>
      <Row label="비전 baseUrl">
        <input
          value={settings.vision.baseUrl}
          onChange={(e) => void update({ vision: { ...settings.vision, baseUrl: e.target.value } })}
          placeholder="http://localhost:11434/v1"
          className="w-56 rounded-md border border-border bg-surface px-2 py-1 text-[12px]"
        />
      </Row>
      <Row label="비전 모델">
        <input
          value={settings.vision.model}
          onChange={(e) => void update({ vision: { ...settings.vision, model: e.target.value } })}
          placeholder="llava / qwen-vl / gpt-4o-mini"
          className="w-56 rounded-md border border-border bg-surface px-2 py-1 text-[12px]"
        />
      </Row>
      <Row label="컴퓨터 유즈 (실험적)">
        <label className="flex items-center gap-2 text-[11.5px] text-faint">
          <input
            type="checkbox"
            checked={settings.computerUse.enabled}
            disabled={!settings.vision.baseUrl || !settings.vision.model}
            onChange={(e) => void update({ computerUse: { enabled: e.target.checked } })}
          />
          화면 제어 허용 (비전 필요)
        </label>
      </Row>
    </div>
  );
}

function McpTab() {
  const settings = useAppStore((s) => s.settings)!;
  const update = useAppStore((s) => s.updateSettings);
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

  return (
    <div>
      <div className="mb-3 text-[12px] text-muted">
        MCP 서버를 연결해 도구를 확장합니다. 아래에 <code>mcpServers</code> JSON을 붙여넣어 추가하세요.
      </div>
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
              {entry.config.type} · {status?.toolCount ?? 0} tools
            </span>
            <div className="flex-1" />
            <input
              type="checkbox"
              checked={entry.enabled}
              onChange={(e) => void toggle(name, e.target.checked)}
            />
            <button onClick={() => void remove(name)} className="text-[11px] text-danger hover:underline">
              삭제
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
        JSON 가져오기
      </button>
    </div>
  );
}

function SkillsTab() {
  const cwd = useAppStore((s) => s.settings)?.defaultCwd;
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  useEffect(() => {
    void whalex.invoke("skills:list", { cwd }).then(setSkills);
  }, [cwd]);
  return (
    <div>
      <div className="mb-3 text-[12px] text-muted">
        <code>~/.whalex/skills/&lt;name&gt;/SKILL.md</code> 또는 프로젝트 <code>.whalex/skills/</code>에 스킬을 추가하세요.
      </div>
      {skills.length === 0 && <div className="py-4 text-[12.5px] text-faint">설치된 스킬이 없습니다.</div>}
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
      setMsg(`설치됨: ${res.name}`);
      await init();
    } else {
      setMsg(`실패: ${res.error}`);
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
            제거
          </button>
        </div>
      ))}
      <div className="mt-3 flex gap-2">
        <select
          value={src}
          onChange={(e) => setSrc(e.target.value as "local" | "git")}
          className="rounded-md border border-border bg-surface px-2 py-1 text-[12px]"
        >
          <option value="git">Git URL</option>
          <option value="local">로컬 폴더</option>
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
          {busy ? "설치 중..." : "설치"}
        </button>
      </div>
      {msg && <div className="mt-2 text-[12px] text-muted">{msg}</div>}
    </div>
  );
}

function AppearanceTab() {
  const settings = useAppStore((s) => s.settings)!;
  const update = useAppStore((s) => s.updateSettings);
  return (
    <Row label="테마">
      <select
        value={settings.theme}
        onChange={(e) => void update({ theme: e.target.value as "system" | "light" | "dark" })}
        className="rounded-md border border-border bg-surface px-2 py-1 text-[12.5px]"
      >
        <option value="system">시스템</option>
        <option value="light">라이트</option>
        <option value="dark">다크</option>
      </select>
    </Row>
  );
}

function UpdatesTab() {
  const version = useAppStore((s) => s.version);
  const status = useUiStore((s) => s.updateStatus);
  return (
    <div>
      <Row label="현재 버전">
        <span className="text-[12.5px] text-muted">{version}</span>
      </Row>
      <Row label="상태">
        <span className="text-[12.5px] text-muted">
          {status.state === "current"
            ? "최신 버전입니다"
            : status.state === "available"
              ? `업데이트 가능: ${status.version}`
              : status.state === "downloading"
                ? `다운로드 중 ${status.percent}%`
                : status.state === "downloaded"
                  ? "재시작 시 적용"
                  : status.state === "error"
                    ? `오류: ${status.error}`
                    : status.state}
        </span>
      </Row>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => void whalex.invoke("update:check", undefined)}
          className="rounded-md border border-border px-3 py-1.5 text-[12.5px] hover:bg-surface-2"
        >
          업데이트 확인
        </button>
        {status.state === "available" && (
          <button
            onClick={() => void whalex.invoke("update:download", undefined)}
            className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent-hover"
          >
            다운로드
          </button>
        )}
        {status.state === "downloaded" && (
          <button
            onClick={() => void whalex.invoke("update:install", undefined)}
            className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent-hover"
          >
            재시작하여 업데이트
          </button>
        )}
      </div>
    </div>
  );
}

export function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen);
  const tab = useUiStore((s) => s.settingsTab);
  const setTab = (t: SettingsTab) => useUiStore.setState({ settingsTab: t });
  const close = useUiStore((s) => s.closeSettings);
  useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={close}
    >
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
                {tt.label}
              </button>
            );
          })}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <span className="text-[14px] font-semibold">{TABS.find((t) => t.id === tab)?.label}</span>
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
            {tab === "plugins" && <PluginsTab />}
            {tab === "appearance" && <AppearanceTab />}
            {tab === "updates" && <UpdatesTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
