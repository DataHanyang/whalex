import os from "node:os";
import type { BrowserWindow } from "electron";
import {
  AgentLoop,
  McpManager,
  OpenAICompatProvider,
  PermissionEngine,
  SessionStore,
  SkillRegistry,
  WorkflowRunner,
  createAgentTool,
  createBrowserTools,
  createBuiltinRegistry,
  createComputerTools,
  createWorkflowTool,
  listCheckpoints,
  rewindTo,
  type BrowserController,
  type ComputerController,
  type ToolDef,
} from "@whalex/core";
import {
  resolveModelInfo,
  type AgentEvent,
  type AgentEventEnvelope,
  type McpStatus,
  type PermissionResponse,
  type SlashCommand,
  type TranscriptItem,
  type WorkflowState,
} from "@whalex/shared";
import type { SettingsManager } from "./settings.js";
import type { SecretVault } from "./secrets.js";
import { HookManager } from "./HookManager.js";

interface HostedSession {
  store: SessionStore;
  loop: AgentLoop;
  engine: PermissionEngine;
  seq: number;
  superCode: boolean;
  goalMode: boolean;
  modeOverride: import("@whalex/shared").PermissionMode | null;
}

const CPU = os.cpus().length;

/**
 * Owns per-session agent instances and the app-wide MCP/skill registries.
 * Pumps agent event streams to the renderer (micro-batched), and injects
 * MCP tools, the skill tool, the agent (subagent) tool, and — when SuperCode
 * is on — the workflow tool into each session.
 */
export class AgentHost {
  private sessions = new Map<string, HostedSession>();
  private queue: AgentEventEnvelope[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private artifacts = new Map<string, import("@whalex/shared").Artifact>();
  readonly mcp = new McpManager();
  readonly skills = new SkillRegistry();
  private hooks: HookManager;

  getArtifact(id: string): import("@whalex/shared").Artifact | null {
    return this.artifacts.get(id) ?? null;
  }

  private browser: BrowserController | null = null;
  private computer: (ComputerController & { isAvailable(): boolean }) | null = null;
  private activeSessionForBrowser: string | null = null;

  constructor(
    private getWindow: () => BrowserWindow | null,
    private settings: SettingsManager,
    private vault: SecretVault,
  ) {
    this.hooks = new HookManager(settings);
    this.mcp.setStatusListener((statuses) => this.emitMcpStatus(statuses));
  }

  setBrowser(controller: BrowserController): void {
    this.browser = controller;
  }

  setComputer(controller: ComputerController & { isAvailable(): boolean }): void {
    this.computer = controller;
  }

  notifyBrowserNavigated(url: string, title: string): void {
    if (this.activeSessionForBrowser) {
      this.emitDirect(this.activeSessionForBrowser, { type: "browser-navigated", url, title });
    }
  }

  async init(): Promise<void> {
    await this.mcp.startAll(this.settings.get().mcpServers);
  }

  async start(
    cwd: string,
    resumeSessionId?: string,
  ): Promise<{ sessionId: string; cwd: string; transcript: TranscriptItem[] }> {
    let store: SessionStore | null = null;
    if (resumeSessionId) store = await SessionStore.load(cwd, resumeSessionId);
    store ??= SessionStore.create(cwd);

    await this.skills.scan(cwd);
    const s = this.settings.get();
    const engine = new PermissionEngine(s.permissions, {
      persistRule: (rule) => this.settings.addAllowRule(rule),
    });
    const provider = await this.createProvider();
    const modelInfo = resolveModelInfo(s.defaultModel);

    const features = s.features;
    const registry = createBuiltinRegistry({ includeWebFetch: features.webFetch });
    registry.register(this.skills.tool() as ToolDef<never>);
    const sessionId = store.sessionId;
    this.activeSessionForBrowser = sessionId;

    // Browser-use tools (DOM-based, shared WebContentsView) — gated by feature.
    if (this.browser && features.browserUse) {
      for (const tool of createBrowserTools(this.browser)) registry.register(tool);
    }
    // Computer-use tools — experimental, only when opted in + vision connected.
    if (this.computer?.isAvailable()) {
      for (const tool of createComputerTools(this.computer)) registry.register(tool);
    }

    // Subagent tool — nested loops share the provider, permissions, and MCP tools.
    if (features.subagents) {
      registry.register(
        createAgentTool({
          provider,
          permissions: engine,
          modelInfo,
          temperature: s.temperature,
        reasoningEffort: s.reasoningEffort,
          cwd,
          disabledTypes: s.disabledAgentTypes,
          extraTools: () => this.mcp.toolDefs(),
          onProgress: (u) => {
            this.emitDirect(sessionId, {
              type: "subagent-update",
              agentRunId: u.agentRunId,
              state: u.state,
              toolCount: u.toolCount,
              lastActivity: u.lastActivity,
              tokens: u.tokens,
              durationMs: 0,
            });
          },
        }) as ToolDef<never>,
      );
    }

    const hosted: HostedSession = {
      store,
      engine,
      seq: 0,
      superCode: false,
      goalMode: false,
      modeOverride: null,
      loop: new AgentLoop({
        provider,
        registry,
        permissions: engine,
        session: store,
        modelInfo,
        temperature: s.temperature,
        reasoningEffort: s.reasoningEffort,
        extraSystemPrompt: this.skills.catalog(),
        extraTools: () => this.mcp.toolDefs(),
        hooks: this.hooks,
      }),
    };
    this.sessions.set(sessionId, hosted);
    return { sessionId, cwd, transcript: store.transcript() };
  }

  private async createProvider(): Promise<OpenAICompatProvider> {
    const s = this.settings.get();
    const ps = s.providers.find((p) => p.id === s.activeProviderId) ?? s.providers[0];
    if (!ps) throw new Error("No provider configured.");
    const apiKey = ps.apiKeyRef ? this.vault.get(ps.apiKeyRef) : null;
    return new OpenAICompatProvider({ baseUrl: ps.baseUrl, apiKey });
  }

  setSuperCode(sessionId: string, on: boolean): void {
    const hosted = this.sessions.get(sessionId);
    if (hosted) hosted.superCode = on;
  }

  setGoalMode(sessionId: string, on: boolean): void {
    const hosted = this.sessions.get(sessionId);
    if (hosted) hosted.goalMode = on;
  }

  setMode(sessionId: string, mode: import("@whalex/shared").PermissionMode): void {
    const hosted = this.sessions.get(sessionId);
    if (hosted) {
      hosted.modeOverride = mode;
      hosted.engine.setRules({ ...this.settings.get().permissions, mode });
    }
  }

  async enablePreset(name: string, cwd: string): Promise<void> {
    const { MCP_PRESETS, materializePreset } = await import("@whalex/shared");
    const preset = MCP_PRESETS.find((p) => p.name === name);
    if (!preset) return;
    const config = materializePreset(preset, cwd);
    const settings = this.settings.get();
    this.settings.update({
      mcpServers: { ...settings.mcpServers, [name]: { config, enabled: true } },
    });
    await this.mcp.connect(name, config);
  }

  send(sessionId: string, text: string, model: string): void {
    const hosted = this.sessions.get(sessionId);
    if (!hosted) throw new Error(`Unknown session: ${sessionId}`);
    if (hosted.loop.isRunning) throw new Error("Session is already running.");
    const perms = this.settings.get().permissions;
    hosted.engine.setRules(hosted.modeOverride ? { ...perms, mode: hosted.modeOverride } : perms);
    hosted.loop.setModel(resolveModelInfo(model));

    // SuperCode: keyword trigger or session toggle adds the workflow tool.
    if (this.settings.get().features.superCode) {
      const wantWorkflow = hosted.superCode || /슈퍼코드|supercode/i.test(text);
      if (wantWorkflow) this.enableWorkflow(sessionId, hosted, model);
    }

    // Goal mode: run autonomously toward the goal, self-evaluating completion.
    const stream = hosted.goalMode ? hosted.loop.runGoal(text) : hosted.loop.run(text);
    void this.pump(sessionId, hosted, stream);
  }

  private enableWorkflow(sessionId: string, hosted: HostedSession, model: string): void {
    const s = this.settings.get();
    const registry = (hosted.loop as unknown as { opts: { registry: { get(n: string): unknown; register(t: unknown): void } } })
      .opts.registry;
    if (registry.get("workflow")) return;
    const provider = (hosted.loop as unknown as { opts: { provider: OpenAICompatProvider } }).opts.provider;
    registry.register(
      createWorkflowTool(
        (name) =>
          new WorkflowRunner(
            {
              provider,
              permissions: hosted.engine,
              modelInfo: resolveModelInfo(model),
              temperature: s.temperature,
        reasoningEffort: s.reasoningEffort,
              cwd: hosted.store.cwd,
              extraTools: () => this.mcp.toolDefs(),
              maxAgents: s.superCode.maxAgents,
              concurrency: Math.max(2, Math.min(16, CPU - 2)),
              onUpdate: (state: WorkflowState) =>
                this.emitDirect(sessionId, { type: "workflow-update", workflow: state }),
              signal: new AbortController().signal,
            },
            name,
          ),
        (workflowId, name) => {
          hosted.store.append({ type: "workflow", workflowId, name, ts: Date.now() });
          this.emitDirect(sessionId, {
            type: "workflow-update",
            workflow: {
              workflowId,
              name,
              state: "planning",
              phases: [],
              agents: [],
              totalTokens: 0,
              costUsd: 0,
              log: [],
            },
          });
        },
      ),
    );
  }

  private async pump(
    sessionId: string,
    hosted: HostedSession,
    stream: AsyncGenerator<AgentEvent>,
  ): Promise<void> {
    try {
      for await (const event of stream) this.emit(sessionId, hosted, event);
    } catch (err) {
      this.emit(sessionId, hosted, {
        type: "error",
        code: "unknown",
        message: err instanceof Error ? err.message : String(err),
      });
      this.emit(sessionId, hosted, { type: "done", stopReason: "error" });
    }
  }

  /** Slash commands handled in main. Returns a user-facing message. */
  async command(
    sessionId: string,
    command: string,
    _args?: string,
  ): Promise<{ handled: boolean; message?: string }> {
    const hosted = this.sessions.get(sessionId);
    if (!hosted) return { handled: false };
    switch (command) {
      case "compact": {
        const res = await hosted.loop.manualCompact();
        if (res.ok) {
          hosted.store.appendCompaction("", res.beforePct, res.afterPct);
          this.emit(sessionId, hosted, {
            type: "compaction",
            beforePct: res.beforePct,
            afterPct: res.afterPct,
          });
          return { handled: true, message: `컨텍스트를 압축했습니다: ${res.beforePct}% → ${res.afterPct}%` };
        }
        return { handled: true, message: `압축 실패: ${res.error ?? "unknown"}` };
      }
      case "supercode-on":
        this.setSuperCode(sessionId, true);
        return { handled: true, message: "슈퍼코드 모드 ON" };
      case "supercode-off":
        this.setSuperCode(sessionId, false);
        return { handled: true, message: "슈퍼코드 모드 OFF" };
      default:
        return { handled: false };
    }
  }

  async slashCommands(cwd?: string): Promise<SlashCommand[]> {
    const builtin: SlashCommand[] = [
      { name: "model", description: "모델 변경", source: "builtin" },
      { name: "clear", description: "새 세션 시작", source: "builtin" },
      { name: "compact", description: "컨텍스트 압축", source: "builtin" },
      { name: "settings", description: "설정 열기", source: "builtin" },
      { name: "mcp", description: "MCP 서버 관리", source: "builtin" },
      { name: "skills", description: "스킬 관리", source: "builtin" },
      { name: "rewind", description: "이전 지점으로 되돌리기", source: "builtin" },
      { name: "supercode", description: "슈퍼코드 멀티에이전트 모드 토글", source: "builtin" },
      { name: "help", description: "도움말", source: "builtin" },
    ];
    if (cwd) await this.skills.scan(cwd);
    const skillCommands: SlashCommand[] = this.skills.list().map((s) => ({
      name: s.name,
      description: s.description,
      source: "skill",
    }));
    return [...builtin, ...skillCommands];
  }

  listCheckpoints(sessionId: string) {
    const hosted = this.sessions.get(sessionId);
    return hosted ? listCheckpoints(hosted.store) : [];
  }

  async rewind(sessionId: string, boundary: number) {
    const hosted = this.sessions.get(sessionId);
    if (!hosted) return { restored: [], transcript: [] };
    const { restored } = await rewindTo(hosted.store, boundary);
    return { restored, transcript: hosted.store.transcript() };
  }

  abort(sessionId: string): void {
    this.sessions.get(sessionId)?.loop.abort();
  }

  respondPermission(response: PermissionResponse): void {
    for (const hosted of this.sessions.values()) {
      if (hosted.engine.resolve(response)) return;
    }
  }

  /** Routes an ask_user answer to whichever session is waiting on it. */
  answerQuestion(id: string, answer: string): void {
    for (const hosted of this.sessions.values()) {
      if (hosted.loop.answerQuestion(id, answer)) return;
    }
  }

  async restartMcp(name: string): Promise<void> {
    const entry = this.settings.get().mcpServers[name];
    if (entry) await this.mcp.restart(name, entry.config);
  }

  disposeAll(): void {
    for (const hosted of this.sessions.values()) hosted.loop.abort();
    this.sessions.clear();
    void this.mcp.disposeAll();
  }

  private emit(sessionId: string, hosted: HostedSession, event: AgentEvent): void {
    if (event.type === "artifact") {
      this.artifacts.set(event.artifactId, {
        artifactId: event.artifactId,
        title: event.title,
        kind: event.kind,
        path: event.path,
        url: event.url,
        content: event.content,
        language: event.language,
      });
    }
    this.queue.push({ sessionId, seq: hosted.seq++, event });
    if (event.type === "permission-request" || event.type === "done" || event.type === "error") {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 16);
    }
  }

  /** Emit for a session by id (used by tool callbacks that lack the hosted ref). */
  private emitDirect(sessionId: string, event: AgentEvent): void {
    const hosted = this.sessions.get(sessionId);
    if (hosted) this.emit(sessionId, hosted, event);
  }

  private flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.queue.length === 0) return;
    const win = this.getWindow();
    const batch = this.queue;
    this.queue = [];
    if (win && !win.isDestroyed()) {
      for (const envelope of batch) win.webContents.send("agent:event", envelope);
    }
  }

  private emitMcpStatus(statuses: McpStatus[]): void {
    const win = this.getWindow();
    if (win && !win.isDestroyed()) win.webContents.send("mcp:status", statuses);
  }
}
