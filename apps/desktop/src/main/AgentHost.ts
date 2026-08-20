import os from "node:os";
import { randomUUID } from "node:crypto";
import { Notification, app, powerSaveBlocker } from "electron";
import type { BrowserWindow } from "electron";
import {
  AgentLoop,
  supercodeProtocol,
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
  createViewImageTool,
  createWorkflowTool,
  listCheckpoints,
  rewindTo,
  type BrowserController,
  type ComputerController,
  type ToolDef,
} from "@whalex/core";
import {
  KNOWN_MODELS,
  resolveModelInfo,
  resolveSystemLanguage,
  type AgentEvent,
  type AgentEventEnvelope,
  type LiveSnapshot,
  type McpStatus,
  type PermissionResponse,
  type Routine,
  type SlashCommand,
  type Todo,
  type TranscriptItem,
  type UsageInfo,
  type WorkflowState,
} from "@whalex/shared";
import type { SettingsManager } from "./settings.js";
import type { SecretVault } from "./secrets.js";
import { HookManager } from "./HookManager.js";
import { createRoutineTool } from "./routineTool.js";
import { parseRoutine } from "./routineParse.js";

interface HostedSession {
  store: SessionStore;
  loop: AgentLoop;
  engine: PermissionEngine;
  seq: number;
  superCode: boolean;
  goalMode: boolean;
  modeOverride: import("@whalex/shared").PermissionMode | null;
  /** Abort controllers of live workflow runs; fired on session abort. */
  workflowAborts: Set<AbortController>;
  /** Outstanding interactive requests, handed back when the UI reattaches. */
  pendingQuestion: import("@whalex/shared").UserQuestion | null;
  /**
   * Every unanswered approval by request id. A SuperCode fleet can raise
   * several at once and each blocks its own agent until answered, so the
   * newest must not evict the ones still waiting.
   */
  pendingPermissions: Map<string, import("@whalex/shared").PermissionRequest>;
  /** Agent-result cache shared by every workflow run in this session. */
  workflowCache: Map<string, unknown>;
  /** Workflow id → signature of the tree already written to the session file. */
  workflowsPersisted: Map<string, string>;
  /**
   * Live, not-yet-committed state (streaming message, workflows, todos, usage,
   * status). Handed to the UI with the session:start response when it
   * reattaches, so a session switched away from and back to resumes its
   * picture instead of appearing frozen — the streaming bubble in particular
   * is not in the transcript yet.
   */
  live: LiveState;
}

interface LiveState {
  status: Extract<AgentEvent, { type: "status" }>["state"] | null;
  /** The in-flight assistant message id, or null once it's committed. */
  msgId: string | null;
  text: string;
  reasoning: string;
  /** Every workflow of this session by id — not just the most recent one. */
  workflows: Map<string, WorkflowState>;
  todos: Todo[] | null;
  usage: UsageInfo | null;
}

function emptyLive(): LiveState {
  return {
    status: null,
    msgId: null,
    text: "",
    reasoning: "",
    workflows: new Map(),
    todos: null,
    usage: null,
  };
}

/** Artifacts are cached in-process; cap the map so a tray-resident app doesn't grow forever. */
const MAX_ARTIFACTS = 200;

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
  /** Live providers → the vault ref their key came from (null = keyless). */
  private providers = new Map<OpenAICompatProvider, string | null>();
  readonly skills = new SkillRegistry();
  /** Supplied by the plugin manager so plugin-bundled skills get scanned. */
  pluginSkillDirs: () => string[] = () => [];
  /** Wired by index.ts; app-bundled default skills (dev path or resourcesPath). */
  bundledSkillsDir: () => string | null = () => null;
  /**
   * Wired by index.ts when a vision sidecar is configured; null otherwise.
   * Powers view_image so the text-only main model can QA rendered output.
   */
  describeImage: ((dataUrl: string, question?: string) => Promise<string>) | null = null;

  /** Central skill rescan — every caller gets bundled skills + disable state. */
  async scanSkills(cwd: string): Promise<void> {
    await this.skills.scan(cwd, this.pluginSkillDirs(), {
      bundledDir: this.bundledSkillsDir(),
      disabled: this.settings.get().disabledSkills,
    });
  }
  /** Wired by index.ts; records every request's tokens and enforces limits. */
  usageLedger: import("./UsageLedger.js").UsageLedger | null = null;
  private hooks: HookManager;

  getArtifact(id: string): import("@whalex/shared").Artifact | null {
    return this.artifacts.get(id) ?? null;
  }

  private browser: BrowserController | null = null;
  private computer: (ComputerController & { isAvailable(): boolean }) | null = null;
  private activeSessionForBrowser: string | null = null;

  /**
   * The session the window is on — a routine's unattended run parks and
   * restores this, so it always names the user's own session. A renderer that
   * reloaded uses it to reattach instead of orphaning a live turn.
   */
  attachedSession(): { sessionId: string | null; cwd: string | null; running: boolean } {
    const id = this.activeSessionForBrowser;
    const hosted = id ? this.sessions.get(id) : null;
    if (!id || !hosted) return { sessionId: null, cwd: null, running: false };
    return { sessionId: id, cwd: hosted.store.cwd, running: hosted.loop.isRunning };
  }

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

  notifyBrowserNavigated(
    url: string,
    title: string,
    tabs?: Array<{ id: string; url: string; title: string }>,
    activeTabId?: string | null,
  ): void {
    if (this.activeSessionForBrowser) {
      this.emitDirect(this.activeSessionForBrowser, {
        type: "browser-navigated",
        url,
        title,
        tabs,
        activeTabId,
      });
    }
  }

  async init(): Promise<void> {
    await this.mcp.startAll(this.settings.get().mcpServers);
  }

  async start(
    cwd: string,
    resumeSessionId?: string,
  ): Promise<import("@whalex/shared").IpcResponse<"session:start">> {
    // Reattach: switching back to a session this process is already hosting
    // must NOT create a second loop over the same file — the original keeps
    // running and the UI just catches up from the transcript + live snapshot.
    if (resumeSessionId) {
      const live = this.sessions.get(resumeSessionId);
      if (live) {
        this.activeSessionForBrowser = resumeSessionId;
        return {
          sessionId: resumeSessionId,
          cwd: live.store.cwd,
          transcript: live.store.transcript(),
          running: live.loop.isRunning,
          model: live.loop.modelId,
          permissionMode: live.modeOverride ?? this.settings.get().permissions.mode,
          goalMode: live.goalMode,
          superCode: live.superCode,
          live: this.liveSnapshot(live),
        };
      }
    }
    let store: SessionStore | null = null;
    if (resumeSessionId) store = await SessionStore.load(cwd, resumeSessionId);
    store ??= SessionStore.create(cwd);

    await this.scanSkills(cwd);
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
    // view_image — any time a vision sidecar is connected (no opt-in needed;
    // it only reads local files the permission system already governs).
    if (this.describeImage && s.vision.baseUrl && s.vision.model) {
      registry.register(createViewImageTool(this.describeImage) as ToolDef<never>);
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

    // Routine tool — lets the agent save a scheduled/on-demand routine from
    // chat; the schedule is parsed from the prompt and managed in Settings.
    registry.register(
      createRoutineTool({
        cwd,
        save: (input) => this.saveRoutine({ ...input, provider }),
      }) as ToolDef<never>,
    );

    const hosted: HostedSession = {
      store,
      engine,
      seq: 0,
      superCode: false,
      goalMode: false,
      modeOverride: null,
      workflowAborts: new Set(),
      workflowCache: new Map(),
      workflowsPersisted: new Map(),
      pendingQuestion: null,
      pendingPermissions: new Map(),
      live: emptyLive(),
      loop: new AgentLoop({
        provider,
        registry,
        permissions: engine,
        session: store,
        modelInfo,
        temperature: s.temperature,
        reasoningEffort: s.reasoningEffort,
        extraSystemPrompt: [
          s.customInstructions.trim()
            ? `# User instructions\nThe user set these app-wide instructions in Settings; they apply to every session and project:\n\n${s.customInstructions.trim().slice(0, 20_000)}`
            : "",
          this.skills.catalog(),
        ]
          .filter(Boolean)
          .join("\n\n"),
        extraTools: () => this.mcp.toolDefs(),
        hooks: this.hooks,
        autoCompact: s.autoCompact,
      }),
    };
    this.sessions.set(sessionId, hosted);
    return {
      sessionId,
      cwd,
      transcript: store.transcript(),
      model: modelInfo.id,
      permissionMode: s.permissions.mode,
      goalMode: false,
      superCode: false,
    };
  }

  isSessionRunning(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.loop.isRunning ?? false;
  }

  /**
   * Fires a routine: a fresh session in the routine's cwd runs the saved
   * prompt unattended, in the background — browser-event routing stays with
   * whatever session the user is actually looking at.
   */
  async runRoutine(routine: Routine, model: string): Promise<{ sessionId: string }> {
    const prevBrowserSession = this.activeSessionForBrowser;
    const { sessionId } = await this.start(routine.cwd);
    this.activeSessionForBrowser = prevBrowserSession;
    const hosted = this.sessions.get(sessionId);
    if (!hosted) throw new Error("Routine session failed to start.");
    // Name the session after the routine — a manual title, so autoTitle skips it.
    hosted.store.append({ type: "title", title: routine.name, ts: Date.now() });
    this.emitDirect(sessionId, { type: "session-title", title: routine.name });
    this.setMode(sessionId, routine.permissionMode);
    this.send(sessionId, routine.prompt, model);
    return { sessionId };
  }

  /**
   * Create or update a routine from a natural-language prompt. Shared by the
   * settings UI (routines:save) and the agent's create_routine tool: the
   * model extracts the schedule from the prompt, so nothing picks a time by
   * hand. Passing an existing id updates that routine in place.
   */
  async saveRoutine(input: {
    id?: string;
    prompt: string;
    name?: string;
    cwd: string;
    permissionMode?: import("@whalex/shared").Routine["permissionMode"];
    provider?: OpenAICompatProvider;
  }): Promise<Routine> {
    const provider = input.provider ?? (await this.createProvider());
    const model = this.settings.get().defaultModel;
    const parsed = await parseRoutine(input.prompt, provider, model);
    const routines = this.settings.get().routines;
    const existing = input.id ? routines.find((r) => r.id === input.id) : undefined;
    const routine: Routine = {
      id: existing?.id ?? randomUUID(),
      // A user-typed name wins; otherwise take the model's title.
      name: input.name?.trim() || parsed.name,
      prompt: input.prompt,
      cwd: input.cwd,
      schedule: parsed.schedule,
      permissionMode: input.permissionMode ?? existing?.permissionMode ?? "acceptEdits",
      enabled: existing?.enabled ?? true,
      // Editing the prompt re-parses the schedule, so clear the old run clock.
      lastRunAt: undefined,
      lastSessionId: existing?.lastSessionId,
    };
    this.settings.update({
      routines: existing
        ? routines.map((r) => (r.id === routine.id ? routine : r))
        : [...routines, routine],
    });
    return routine;
  }

  /** Cancels every live SuperCode run of a session. Called by abort(). */
  abortWorkflows(sessionId: string): void {
    const hosted = this.sessions.get(sessionId);
    if (!hosted) return;
    for (const c of hosted.workflowAborts) c.abort();
    hosted.workflowAborts.clear();
  }

  private async createProvider(): Promise<OpenAICompatProvider> {
    const s = this.settings.get();
    const ps = s.providers.find((p) => p.id === s.activeProviderId) ?? s.providers[0];
    if (!ps) throw new Error("No provider configured.");
    const apiKey = ps.apiKeyRef ? this.vault.get(ps.apiKeyRef) : null;
    const provider = new OpenAICompatProvider({ baseUrl: ps.baseUrl, apiKey });
    provider.redactSecrets = s.redactSecrets;
    provider.onUsage = (info) => this.usageLedger?.record(info);
    this.providers.set(provider, ps.apiKeyRef ?? null);
    return provider;
  }

  setModel(sessionId: string, model: string): void {
    this.sessions.get(sessionId)?.loop.setModel(resolveModelInfo(model));
  }

  /** Push updated tuning (effort/temperature) into every live session. */
  applyLiveSettings(): void {
    const s = this.settings.get();
    for (const hosted of this.sessions.values()) {
      hosted.loop.updateTuning({ reasoningEffort: s.reasoningEffort, temperature: s.temperature });
    }
    // Follow whichever saved key is active now, endpoint included: a session
    // opened before the switch must not keep using the account the user just
    // switched away from.
    const active = s.providers.find((p) => p.id === s.activeProviderId) ?? s.providers[0];
    for (const [p, keyRef] of this.providers) {
      p.redactSecrets = s.redactSecrets;
      if (active) {
        p.setEndpoint(active.baseUrl, active.apiKeyRef ? this.vault.get(active.apiKeyRef) : null);
        this.providers.set(p, active.apiKeyRef ?? null);
      } else {
        p.setApiKey(keyRef ? this.vault.get(keyRef) : null);
      }
    }
  }

  setSuperCode(sessionId: string, on: boolean): void {
    const hosted = this.sessions.get(sessionId);
    if (!hosted) return;
    hosted.superCode = on;
    hosted.loop.setProtocolPrompt(
      on ? supercodeProtocol({ fleetShell: this.settings.get().superCode.fleetShell }) : null,
    );
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
    // Don't block the reply on the connection: a first `npx -y` run downloads
    // the whole package, which can take a minute. The row appears immediately
    // with a "connecting" dot and the status event flips it when ready.
    void this.mcp.connect(name, config).catch(() => {});
  }

  /** Edit a message still queued behind the running turn. */
  editSteered(sessionId: string, messageId: string, text: string): boolean {
    return this.sessions.get(sessionId)?.loop.editSteered(messageId, text) ?? false;
  }

  /** Drop a message still queued behind the running turn. */
  cancelSteered(sessionId: string, messageId: string): boolean {
    return this.sessions.get(sessionId)?.loop.cancelSteered(messageId) ?? false;
  }

  send(sessionId: string, text: string, model: string, messageId?: string): void {
    const hosted = this.sessions.get(sessionId);
    if (!hosted) throw new Error(`Unknown session: ${sessionId}`);
    if (hosted.loop.isRunning) {
      // Mid-run input becomes steering: the loop injects it before the next
      // round, and a model switch applies to the next completion too.
      hosted.loop.setModel(resolveModelInfo(model));
      hosted.loop.steer(text, messageId);
      return;
    }
    // Hard budget stop: refuse to start a new turn once a spend limit is
    // fully consumed (steering into an already-running turn stays possible).
    const budgetStop = this.usageLedger?.hardStopReason();
    if (budgetStop) {
      this.emitDirect(sessionId, {
        type: "error",
        code: "usage_limit",
        message:
          `Usage limit reached: $${budgetStop.usd.toFixed(2)} of the $${budgetStop.limit.toFixed(2)} ` +
          `${budgetStop.kind} limit. Raise or disable the limit in Settings → Usage to continue.`,
      });
      // Close the turn like the pump's error path does, so the UI returns
      // to idle instead of spinning on "thinking".
      this.emitDirect(sessionId, { type: "done", stopReason: "error" });
      return;
    }
    const perms = this.settings.get().permissions;
    hosted.engine.setRules(hosted.modeOverride ? { ...perms, mode: hosted.modeOverride } : perms);
    hosted.loop.setModel(resolveModelInfo(model));

    // SuperCode: the session toggle or a keyword in the text turns it on.
    // The keyword path goes through setSuperCode too, so main state, the
    // protocol prompt and the renderer UI all stay in sync.
    if (this.settings.get().features.superCode) {
      if (!hosted.superCode && /슈퍼코드|수퍼코드|supercode/i.test(text)) {
        this.setSuperCode(sessionId, true);
        this.emitDirect(sessionId, { type: "supercode", on: true });
      }
      if (hosted.superCode) {
        this.enableWorkflow(sessionId, hosted, model);
        // SuperCode always runs the orchestrator at the deepest reasoning
        // level, whatever the ambient setting says.
        if (resolveModelInfo(model).supportsReasoning) {
          hosted.loop.updateTuning({ reasoningEffort: "max" });
        }
      } else {
        hosted.loop.updateTuning({ reasoningEffort: this.settings.get().reasoningEffort });
      }
    }

    // Goal mode: run autonomously toward the goal, self-evaluating completion.
    const isFirstTurn = !hosted.store.effectiveRecords().some((r) => r.type === "user");
    const stream = hosted.goalMode ? hosted.loop.runGoal(text) : hosted.loop.run(text);
    void this.pump(sessionId, hosted, stream);
    this.updateSleepBlocker();
    // Title generation runs concurrently with the first response, off the
    // question alone — the sidebar gets a real title without waiting for
    // the (possibly long) first turn to finish.
    if (isFirstTurn) void this.autoTitle(sessionId, hosted, text, model);
  }

  private enableWorkflow(sessionId: string, hosted: HostedSession, model: string): void {
    const s = this.settings.get();
    const registry = hosted.loop.registry;
    if (registry.get("workflow")) return;
    const provider = hosted.loop.provider;
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
              concurrency: Math.max(4, Math.min(24, CPU * 2)),
              cache: hosted.workflowCache,
              fleetShell: s.superCode.fleetShell,
              // Route a fleet agent's permission "ask" to this session's
              // normal approval card so fleet shell works outside bypass mode.
              onPermissionAsk: (request) =>
                this.emitDirect(sessionId, { type: "permission-request", request }),
              onUpdate: (state: WorkflowState) =>
                this.emitDirect(sessionId, { type: "workflow-update", workflow: state }),
              signal: (() => {
                const c = new AbortController();
                hosted.workflowAborts.add(c);
                return c.signal;
              })(),
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
      ) as unknown as ToolDef<never>,
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
        // manualCompact records the compaction (with the real summary and
        // percentages) itself — the host only surfaces the result.
        const res = await hosted.loop.manualCompact();
        if (res.ok) {
          this.emit(sessionId, hosted, {
            type: "compaction",
            beforePct: res.beforePct,
            afterPct: res.afterPct,
          });
          return { handled: true, message: `Context compacted: ${res.beforePct}% → ${res.afterPct}%` };
        }
        return { handled: true, message: `Compaction failed: ${res.error ?? "unknown"}` };
      }
      case "supercode-on":
        this.setSuperCode(sessionId, true);
        return { handled: true, message: "SuperCode mode ON" };
      case "supercode-off":
        this.setSuperCode(sessionId, false);
        return { handled: true, message: "SuperCode mode OFF" };
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
    if (cwd) await this.scanSkills(cwd);
    const skillCommands: SlashCommand[] = this.skills
      .list()
      .filter((s) => s.enabled)
      .map((s) => ({
        name: s.name,
        description: s.description,
        source: "skill" as const,
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

  /**
   * Sleep can't be worked *through* — the OS suspends every process, sockets
   * included — so the only way to let a long turn finish while the user walks
   * away is to hold sleep off for as long as one is running. Released the
   * moment the last session goes idle, so an idle app never pins the machine
   * awake.
   */
  private sleepBlocker: number | null = null;

  private updateSleepBlocker(): void {
    const wanted =
      this.settings.get().preventSleepWhileRunning &&
      [...this.sessions.values()].some((h) => h.loop.isRunning);
    try {
      if (wanted && this.sleepBlocker === null) {
        this.sleepBlocker = powerSaveBlocker.start("prevent-app-suspension");
      } else if (!wanted && this.sleepBlocker !== null) {
        powerSaveBlocker.stop(this.sleepBlocker);
        this.sleepBlocker = null;
      }
    } catch {
      // Not worth failing a turn over; the worst case is the machine sleeps.
      this.sleepBlocker = null;
    }
  }

  /**
   * The machine slept mid-turn anyway (lid closed, forced sleep, the blocker
   * off). Every socket died on suspend, but a half-read SSE stream doesn't
   * error — it just never delivers another byte, and the UI spins on
   * "thinking" forever. Fail those turns so they can be retried.
   */
  onSystemResume(): void {
    for (const [sessionId, hosted] of this.sessions) {
      if (!hosted.loop.isRunning) continue;
      hosted.loop.abort();
      this.emitDirect(sessionId, {
        type: "error",
        code: "network",
        message:
          "The connection did not survive the system going to sleep. " +
          "The turn was stopped — send the message again to continue.",
      });
      this.emitDirect(sessionId, { type: "done", stopReason: "error" });
    }
    this.updateSleepBlocker();
  }

  abort(sessionId: string): void {
    const hosted = this.sessions.get(sessionId);
    if (!hosted) return;
    hosted.loop.abort();
    // Aborting the loop only denies pending approvals — the SuperCode script
    // and its agents run under their own controllers and would keep going
    // (and keep spending) after the user pressed Stop.
    this.abortWorkflows(sessionId);
  }

  respondPermission(response: PermissionResponse): void {
    for (const hosted of this.sessions.values()) {
      if (hosted.engine.resolve(response)) return;
    }
  }

  /**
   * Names the session from its first question: a quick cheap completion runs
   * concurrently with the first response, writes a `title` record, and pushes
   * a session-title event so the sidebar updates the moment it's ready.
   */
  private async autoTitle(
    sessionId: string,
    hosted: HostedSession,
    userText: string,
    model: string,
  ): Promise<void> {
    try {
      const hasManualTitle = () =>
        hosted.store.effectiveRecords().some((r) => r.type === "title" && !r.auto);
      if (hasManualTitle()) return;
      let text = "";
      for await (const d of hosted.loop.provider.streamChat({
        // Known DeepSeek models imply the DeepSeek endpoint, where flash is
        // the cheap pick; custom providers (Ollama etc.) only serve their own.
        model: model in KNOWN_MODELS ? "deepseek-v4-flash" : model,
        messages: [
          {
            role: "user",
            content:
              `Give a terse 2-4 word title for this coding session, in the user's language. ` +
              `Output ONLY the title, no quotes.

User: ${userText.slice(0, 400)}`,
          },
        ],
        temperature: 0.3,
        // V4 flash spends hidden reasoning tokens before any visible text;
        // a tight cap (24) used to exhaust the budget mid-reasoning and
        // return an empty title every time. Leave generous headroom.
        maxTokens: 500,
        signal: new AbortController().signal,
      })) {
        if (d.type === "text") text += d.text;
      }
      const title = text.replace(/["\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
      if (!title || hasManualTitle()) return;
      hosted.store.append({ type: "title", title, ts: Date.now() });
      this.emitDirect(sessionId, { type: "session-title", title });
    } catch {
      // A missing title is not worth surfacing.
    }
  }

  /** Routes an ask_user answer to whichever session is waiting on it. */
  answerQuestion(id: string, answer: string): void {
    for (const hosted of this.sessions.values()) {
      if (hosted.pendingQuestion?.id === id) hosted.pendingQuestion = null;
    }
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
    this.artifacts.clear();
    void this.mcp.disposeAll();
  }

  /**
   * The state a reattaching renderer needs on top of the transcript: the
   * streaming assistant bubble, workflow panels, todos, the usage meter,
   * status, and any open interactive request.
   *
   * This travels in the session:start response rather than as replayed
   * events on purpose. Events are dropped by the renderer unless they name
   * the session it already considers active — and it only becomes active
   * when this very response lands, so a replay would always lose the race.
   */
  private liveSnapshot(hosted: HostedSession): LiveSnapshot {
    const live = hosted.live;
    const running = hosted.loop.isRunning;
    return {
      status: running ? (live.status ?? "thinking") : undefined,
      // The in-flight assistant message isn't in the transcript yet — hand
      // over what has streamed so far, under the same id, so subsequent
      // deltas continue that bubble instead of starting a new one.
      streaming:
        running && live.msgId
          ? { messageId: live.msgId, text: live.text, reasoning: live.reasoning }
          : undefined,
      workflows: [...live.workflows.values()],
      todos: live.todos ?? undefined,
      usage: live.usage ?? undefined,
      permissionRequests: [...hosted.pendingPermissions.values()],
      questionRequest: hosted.pendingQuestion ?? undefined,
      // Only the ones the renderer named: an id-less entry has no bubble to
      // restore.
      pendingSteer: hosted.loop.pendingSteer.flatMap((q) =>
        q.id ? [{ id: q.id, text: q.text, ts: q.ts }] : [],
      ),
    };
  }

  private emit(sessionId: string, hosted: HostedSession, event: AgentEvent): void {
    this.updateLive(hosted, event);
    this.enqueue(sessionId, hosted, event);
    if (event.type === "done") this.notifyTurnDone(hosted, event.stopReason);
  }

  /**
   * OS notification when a turn finishes while the user is looking elsewhere
   * (window unfocused or hidden in the tray). Aborts are the user's own
   * action; length-stops continue silently in the UI — neither notifies.
   */
  private notifyTurnDone(hosted: HostedSession, stopReason: string): void {
    if (stopReason !== "stop" && stopReason !== "error") return;
    const win = this.getWindow();
    if (win && !win.isDestroyed() && win.isFocused()) return;
    if (!Notification.isSupported()) return;
    let lang = this.settings.get().language;
    if (lang === "system") {
      lang = resolveSystemLanguage(app.getLocale());
    }
    const TEXT = {
      en: { done: "Task finished", error: "Stopped with an error" },
      ko: { done: "작업이 끝났습니다", error: "오류로 중단됐습니다" },
      zh: { done: "任务已完成", error: "因错误而停止" },
      ja: { done: "作業が完了しました", error: "エラーで停止しました" },
      fr: { done: "Tâche terminée", error: "Arrêtée sur une erreur" },
      "zh-TW": { done: "任務已完成", error: "因錯誤而停止" },
      de: { done: "Aufgabe abgeschlossen", error: "Mit einem Fehler gestoppt" },
      ru: { done: "Задача завершена", error: "Остановлено из-за ошибки" },
      vi: { done: "Đã xong công việc", error: "Dừng lại vì lỗi" },
      th: { done: "งานเสร็จแล้ว", error: "หยุดเพราะข้อผิดพลาด" },
      id: { done: "Tugas selesai", error: "Berhenti karena kesalahan" },
    } as const;
    const text = TEXT[lang as keyof typeof TEXT] ?? TEXT.en;
    const title = hosted.store
      .effectiveRecords()
      .filter((r) => r.type === "title")
      .pop();
    const n = new Notification({
      title: title?.type === "title" ? title.title : "WhaleX",
      body: stopReason === "error" ? text.error : text.done,
    });
    n.on("click", () => {
      const w = this.getWindow();
      if (w && !w.isDestroyed()) {
        w.show();
        w.focus();
      }
    });
    n.show();
  }

  /** Track cached artifacts, pending requests, and the live snapshot. */
  private updateLive(hosted: HostedSession, event: AgentEvent): void {
    switch (event.type) {
      case "artifact":
        if (this.artifacts.size >= MAX_ARTIFACTS && !this.artifacts.has(event.artifactId)) {
          const oldest = this.artifacts.keys().next().value;
          if (oldest !== undefined) this.artifacts.delete(oldest);
        }
        this.artifacts.set(event.artifactId, {
          artifactId: event.artifactId,
          title: event.title,
          kind: event.kind,
          path: event.path,
          url: event.url,
          content: event.content,
          language: event.language,
        });
        break;
      case "question-request":
        hosted.pendingQuestion = event.request;
        break;
      case "permission-request":
        hosted.pendingPermissions.set(event.request.id, event.request);
        break;
      case "permission-resolved":
        hosted.pendingPermissions.delete(event.requestId);
        break;
      case "status":
        hosted.live.status = event.state;
        break;
      case "message-start":
        hosted.live.msgId = event.messageId;
        hosted.live.text = "";
        hosted.live.reasoning = "";
        break;
      case "text-delta":
        if (event.messageId === hosted.live.msgId) hosted.live.text += event.delta;
        break;
      case "reasoning-delta":
        if (event.messageId === hosted.live.msgId) hosted.live.reasoning += event.delta;
        break;
      case "usage":
        hosted.live.usage = event.usage;
        // The assistant message is committed to the transcript before its
        // usage event fires, so the streaming bubble no longer needs replay.
        hosted.live.msgId = null;
        break;
      case "workflow-update": {
        const wf = event.workflow;
        hosted.live.workflows.set(wf.workflowId, wf);
        // Settled runs get their tree written once, so the panel still has
        // something to draw after the app restarts.
        if (wf.state === "done" || wf.state === "error" || wf.state === "aborted") {
          this.persistWorkflow(hosted, wf);
        }
        break;
      }
      case "todo-update":
        hosted.live.todos = event.todos;
        break;
      case "done":
        hosted.pendingQuestion = null;
        hosted.pendingPermissions.clear();
        hosted.live.status = null;
        hosted.live.msgId = null;
        // A turn that was aborted (or died) can leave a workflow stuck in
        // "running" with no terminal update — persist whatever it reached.
        for (const wf of hosted.live.workflows.values()) this.persistWorkflow(hosted, wf);
        this.updateSleepBlocker();
        break;
      default:
        break;
    }
  }

  /**
   * Write a workflow's progress tree to the session file. Called only when a
   * run settles (and once more at the end of the turn), and skipped when the
   * tree is unchanged — so a run costs a couple of records, not one per tick,
   * and the last write wins when the final tally lands after the first
   * terminal update. transcript() folds the records back into one panel.
   */
  private persistWorkflow(hosted: HostedSession, workflow: WorkflowState): void {
    // An aborted run leaves agents mid-flight: they never finished, and a
    // restored panel must not spin on them forever.
    const state: WorkflowState = {
      ...workflow,
      agents: workflow.agents.map((a) =>
        a.state === "running" || a.state === "pending" ? { ...a, state: "error" as const } : a,
      ),
    };
    const signature = JSON.stringify([
      state.state,
      state.totalTokens,
      state.agents.map((a) => a.state),
    ]);
    if (hosted.workflowsPersisted.get(state.workflowId) === signature) return;
    hosted.workflowsPersisted.set(state.workflowId, signature);
    hosted.store.append({
      type: "workflow",
      workflowId: state.workflowId,
      name: state.name,
      state,
      ts: Date.now(),
    });
  }

  private enqueue(sessionId: string, hosted: HostedSession, event: AgentEvent): void {
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
