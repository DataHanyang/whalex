import { create } from "zustand";
import i18n from "i18next";
import type {
  AgentEventEnvelope,
  Artifact,
  PermissionRequest,
  PermissionResponse,
  SessionMeta,
  Todo,
  TranscriptItem,
  UsageInfo,
  WorkflowState,
} from "@whalex/shared";
import { whalex } from "../lib/ipc";

export type SessionStatus = "idle" | "thinking" | "streaming" | "tool";

interface SessionState {
  cwd: string | null;
  activeSessionId: string | null;
  sessions: SessionMeta[];
  transcript: TranscriptItem[];
  status: SessionStatus;
  usage: UsageInfo | null;
  todos: Todo[];
  pendingPermission: PermissionRequest | null;
  pendingQuestion: import("@whalex/shared").UserQuestion | null;
  /** A plan artifact is awaiting the user's Accept / Revise / Reject. */
  planPending: boolean;
  clearPlanPending(): void;
  answerQuestion(id: string, answer: string): void;
  lastError: { code: string; message: string } | null;
  model: string;
  superCode: boolean;
  artifacts: Artifact[];
  activeArtifactId: string | null;
  subagents: Record<string, { agentType: string; label: string; state: string; toolCount: number; tokens: number; lastActivity: string }>;
  workflow: WorkflowState | null;
  browser: { tabs: Array<{ id: string; url: string; title: string }>; activeTabId: string | null };
  /** Selected side-panel tab: "agents", `a:<artifactId>` or `b:<browserTabId>`. */
  sideTab: string | null;
  /** Wall-clock start of the running turn, or null when idle. */
  turnStartedAt: number | null;
  /** Total duration of the last completed turn (ms). */
  lastTurnMs: number | null;
  permissionMode: "default" | "acceptEdits" | "bypassPermissions" | "plan";
  goalMode: boolean;

  setModel(model: string): void;
  setSuperCode(on: boolean): void;
  setPermissionMode(mode: "default" | "acceptEdits" | "bypassPermissions" | "plan"): void;
  setGoalMode(on: boolean): void;
  openArtifact(id: string): void;
  closeArtifact(): void;
  selectSideTab(id: string): void;
  closeArtifactTab(id: string): void;
  selectBrowserTab(tabId: string): void;
  closeBrowserTab(tabId: string): void;
  refreshSessions(): Promise<void>;
  deleteSession(sessionId: string, cwd: string): Promise<void>;
  rewind(boundary: number): Promise<void>;
  startSession(cwd: string, resumeSessionId?: string): Promise<void>;
  send(text: string): Promise<void>;
  abort(): Promise<void>;
  respondPermission(res: Omit<PermissionResponse, "id"> & { id: string }): Promise<void>;
  handleEnvelope(env: AgentEventEnvelope): void;
}

let unsubscribe: (() => void) | null = null;

export const useSessionStore = create<SessionState>((set, get) => ({
  cwd: null,
  activeSessionId: null,
  sessions: [],
  transcript: [],
  status: "idle",
  usage: null,
  todos: [],
  pendingPermission: null,
  pendingQuestion: null,
  planPending: false,
  lastError: null,
  model: "deepseek-v4-flash",
  superCode: false,
  artifacts: [],
  activeArtifactId: null,
  subagents: {},
  workflow: null,
  browser: { tabs: [], activeTabId: null },
  sideTab: null,
  turnStartedAt: null,
  lastTurnMs: null,
  permissionMode: "default",
  goalMode: false,

  setModel(model) {
    set({ model });
    const id = get().activeSessionId;
    if (id) void whalex.invoke("session:setModel", { sessionId: id, model });
  },
  setSuperCode(on) {
    set({ superCode: on });
    const id = get().activeSessionId;
    if (id) void whalex.invoke("session:command", { sessionId: id, command: on ? "supercode-on" : "supercode-off" });
    // SuperCode always opens in plan mode with the strongest model: recon
    // and the budget interview come before any write. Re-enabling it on a
    // session whose plan was already presented must NOT drag the run back
    // into plan mode — that blocked a mid-execution session once.
    if (on) get().setModel("deepseek-v4-pro");
    const planDone = get().transcript.some((t) => t.kind === "artifact" && t.artifactKind === "plan");
    get().setPermissionMode(on ? (planDone ? "bypassPermissions" : "plan") : "default");
  },
  setPermissionMode(mode) {
    set({ permissionMode: mode });
    const id = get().activeSessionId;
    if (id) void whalex.invoke("session:setMode", { sessionId: id, mode });
  },
  setGoalMode(on) {
    set({ goalMode: on });
    const id = get().activeSessionId;
    if (id) void whalex.invoke("session:setGoalMode", { sessionId: id, on });
  },
  openArtifact(id) {
    set({ activeArtifactId: id, sideTab: `a:${id}` });
    void whalex.invoke("browser:hide", undefined);
  },
  closeArtifact() {
    set({ activeArtifactId: null, sideTab: null });
  },
  selectSideTab(id) {
    set({ sideTab: id, activeArtifactId: id.startsWith("a:") ? id.slice(2) : null });
    if (id.startsWith("b:")) {
      void whalex.invoke("browser:selectTab", { tabId: id.slice(2) });
    } else {
      // The native browser view would paint over DOM content; park it.
      void whalex.invoke("browser:hide", undefined);
    }
  },
  closeArtifactTab(id) {
    set((s) => {
      const artifacts = s.artifacts.filter((a) => a.artifactId !== id);
      const wasActive = s.sideTab === `a:${id}`;
      const nextTab = wasActive ? (artifacts.at(-1) ? `a:${artifacts.at(-1)!.artifactId}` : null) : s.sideTab;
      return {
        artifacts,
        sideTab: nextTab,
        activeArtifactId: nextTab?.startsWith("a:") ? nextTab.slice(2) : null,
      };
    });
  },
  selectBrowserTab(tabId) {
    get().selectSideTab(`b:${tabId}`);
  },
  closeBrowserTab(tabId) {
    void whalex.invoke("browser:closeTab", { tabId });
    set((s) => {
      const tabs = s.browser.tabs.filter((t) => t.id !== tabId);
      const wasActive = s.sideTab === `b:${tabId}`;
      return {
        browser: { tabs, activeTabId: tabs.at(-1)?.id ?? null },
        sideTab: wasActive ? (tabs.at(-1) ? `b:${tabs.at(-1)!.id}` : null) : s.sideTab,
      };
    });
  },

  async refreshSessions() {
    const cwd = get().cwd;
    const sessions = await whalex.invoke("session:list", { cwd: cwd ?? undefined });
    set({ sessions });
  },

  async rewind(boundary) {
    const id = get().activeSessionId;
    if (!id) return;
    const res = await whalex.invoke("checkpoint:rewind", { sessionId: id, boundary });
    set({ transcript: res.transcript });
  },

  async deleteSession(sessionId, cwd) {
    await whalex.invoke("session:delete", { cwd, sessionId });
    const { activeSessionId, cwd: activeCwd } = get();
    await get().refreshSessions();
    // If we deleted the open session, start a fresh one.
    if (sessionId === activeSessionId && activeCwd) {
      await get().startSession(activeCwd);
    }
  },

  async startSession(cwd, resumeSessionId) {
    unsubscribe ??= whalex.on("agent:event", (env) => get().handleEnvelope(env));
    const res = await whalex.invoke("session:start", { cwd, resumeSessionId });
    set({
      cwd,
      activeSessionId: res.sessionId,
      transcript: res.transcript,
      status: res.running ? "thinking" : "idle",
      usage: null,
      todos: [],
      pendingPermission: null,
      lastError: null,
      artifacts: [],
      activeArtifactId: null,
      subagents: {},
      workflow: null,
      browser: { tabs: [], activeTabId: null },
      sideTab: null,
      superCode: false,
      goalMode: false,
      permissionMode: "default",
    });
    void whalex.invoke("browser:hide", undefined);
    await get().refreshSessions();
  },

  async send(text) {
    const { activeSessionId, model, status } = get();
    if (!activeSessionId) return;
    const steering = status !== "idle";
    set({ lastError: null });
    set((s) => ({
      transcript: [
        ...s.transcript,
        { kind: "user", id: `local-${Date.now()}`, text, ts: Date.now() },
      ],
      ...(steering
        ? {}
        : { status: "thinking" as const, turnStartedAt: Date.now(), lastTurnMs: null }),
    }));
    await whalex.invoke("session:send", { sessionId: activeSessionId, text, model });
    // The new session should appear in the sidebar immediately, not only
    // after the (possibly long) first turn finishes.
    if (!steering) void get().refreshSessions();
  },

  async abort() {
    const { activeSessionId } = get();
    if (activeSessionId) await whalex.invoke("session:abort", { sessionId: activeSessionId });
  },

  async respondPermission(res) {
    set({ pendingPermission: null });
    await whalex.invoke("permission:respond", res);
  },

  clearPlanPending() {
    set({ planPending: false });
  },
  answerQuestion(id, answer) {
    void whalex.invoke("question:respond", { id, answer });
    set({ pendingQuestion: null });
  },

  handleEnvelope(env) {
    if (env.sessionId !== get().activeSessionId) return;
    const ev = env.event;
    switch (ev.type) {
      case "message-start":
        set((s) => ({
          transcript: [
            ...s.transcript,
            {
              kind: "assistant",
              id: ev.messageId,
              text: "",
              reasoning: "",
              streaming: true,
              interrupted: false,
              ts: Date.now(),
            },
          ],
        }));
        break;
      case "text-delta":
      case "reasoning-delta":
        set((s) => {
          const transcript = [...s.transcript];
          for (let i = transcript.length - 1; i >= 0; i--) {
            const item = transcript[i];
            if (item && item.kind === "assistant" && item.id === ev.messageId) {
              transcript[i] =
                ev.type === "text-delta"
                  ? { ...item, text: item.text + ev.delta }
                  : { ...item, reasoning: item.reasoning + ev.delta };
              break;
            }
          }
          return { transcript };
        });
        break;
      case "tool-start":
        set((s) => ({
          transcript: [
            ...s.transcript,
            {
              kind: "tool",
              id: ev.toolCallId,
              toolName: ev.toolName,
              args: ev.args,
              state: "running",
              output: "",
              durationMs: 0,
              ts: Date.now(),
            },
          ],
        }));
        break;
      case "tool-result":
        set((s) => ({
          transcript: s.transcript.map((item) =>
            item.kind === "tool" && item.id === ev.toolCallId
              ? {
                  ...item,
                  state: ev.ok ? "ok" : item.state === "running" ? "error" : item.state,
                  output: ev.output,
                  durationMs: ev.durationMs,
                }
              : item,
          ),
        }));
        break;
      case "file-edit":
        set((s) => ({
          transcript: s.transcript.map((item) =>
            item.kind === "tool" && item.id === ev.toolCallId
              ? { ...item, diff: { path: ev.path, oldText: ev.oldText, newText: ev.newText } }
              : item,
          ),
        }));
        break;
      case "todo-update":
        set({ todos: ev.todos });
        break;
      case "artifact":
        if (ev.kind === "plan") set({ planPending: true });
        set((s) => ({
          artifacts: [
            ...s.artifacts.filter((a) => a.artifactId !== ev.artifactId),
            {
              artifactId: ev.artifactId,
              title: ev.title,
              kind: ev.kind,
              path: ev.path,
              url: ev.url,
              content: ev.content,
              language: ev.language,
            },
          ],
          activeArtifactId: ev.artifactId,
          sideTab: `a:${ev.artifactId}`,
          transcript: [
            ...s.transcript,
            {
              kind: "artifact",
              id: ev.artifactId,
              artifactId: ev.artifactId,
              title: ev.title,
              artifactKind: ev.kind,
              ts: Date.now(),
            },
          ],
        }));
        break;
      case "subagent-start":
        set((s) => ({
          subagents: {
            ...s.subagents,
            [ev.agentRunId]: {
              agentType: ev.agentType,
              label: ev.label,
              state: "running",
              toolCount: 0,
              tokens: 0,
              lastActivity: "",
            },
          },
        }));
        break;
      case "subagent-update":
        set((s) => {
          const prev = s.subagents[ev.agentRunId] ?? {
            agentType: "general",
            label: "",
            state: "running",
            toolCount: 0,
            tokens: 0,
            lastActivity: "",
          };
          return {
            subagents: {
              ...s.subagents,
              [ev.agentRunId]: {
                ...prev,
                state: ev.state,
                toolCount: ev.toolCount,
                tokens: ev.tokens,
                lastActivity: ev.lastActivity,
              },
            },
          };
        });
        break;
      case "workflow-update":
        set((s) => ({
          workflow: ev.workflow,
          transcript:
            s.transcript.some((t) => t.kind === "workflow" && t.workflowId === ev.workflow.workflowId)
              ? s.transcript
              : [
                  ...s.transcript,
                  {
                    kind: "workflow",
                    id: ev.workflow.workflowId,
                    workflowId: ev.workflow.workflowId,
                    name: ev.workflow.name,
                    ts: Date.now(),
                  },
                ],
        }));
        break;
      case "compaction":
        set((s) => ({
          transcript: [
            ...s.transcript,
            {
              kind: "compaction",
              id: `compaction-${Date.now()}`,
              beforePct: ev.beforePct,
              afterPct: ev.afterPct,
              ts: Date.now(),
            },
          ],
        }));
        break;
      case "supercode":
        // Main turned SuperCode on (keyword in the prompt); mirror the toggle
        // and enter plan mode on the strongest model, exactly like clicking
        // the composer switch.
        set({ superCode: ev.on });
        if (ev.on) {
          get().setModel("deepseek-v4-pro");
          get().setPermissionMode("plan");
        }
        break;
      case "browser-navigated": {
        const tabs = ev.tabs ?? (ev.url ? [{ id: "tab1", url: ev.url, title: ev.title }] : []);
        const activeTabId = ev.activeTabId ?? tabs.at(-1)?.id ?? null;
        set({
          browser: { tabs, activeTabId },
          ...(activeTabId ? { sideTab: `b:${activeTabId}`, activeArtifactId: null } : {}),
        });
        break;
      }
      case "goal-update":
        set((s) => ({
          transcript: [
            ...s.transcript,
            {
              kind: "error",
              id: `goal-${Date.now()}`,
              code: ev.done ? "goal-done" : "goal-continue",
              message: ev.done
                ? i18n.t("transcript.goalDone", { i: ev.iteration, max: ev.maxIterations })
                : i18n.t("transcript.goalContinue", {
                    i: ev.iteration,
                    max: ev.maxIterations,
                    remaining: ev.remaining,
                  }),
              ts: Date.now(),
            },
          ],
        }));
        break;
      case "permission-request":
        set({ pendingPermission: ev.request });
        break;
      case "question-request":
        set({ pendingQuestion: ev.request });
        break;
      case "permission-resolved":
        set((s) =>
          s.pendingPermission?.id === ev.requestId ? { pendingPermission: null } : {},
        );
        break;
      case "usage":
        set({ usage: ev.usage });
        break;
      case "status":
        set({ status: ev.state });
        break;
      case "error":
        set((s) => ({
          lastError: { code: ev.code, message: ev.message },
          transcript: [
            ...s.transcript,
            {
              kind: "error",
              id: `err-${Date.now()}`,
              code: ev.code,
              message: ev.message,
              ts: Date.now(),
            },
          ],
        }));
        break;
      case "done":
        // Pick up the auto-generated session title shortly after the turn.
        setTimeout(() => void get().refreshSessions(), 2500);
        set((s) => ({
          status: "idle",
          pendingPermission: null,
          turnStartedAt: null,
          lastTurnMs: s.turnStartedAt ? Date.now() - s.turnStartedAt : s.lastTurnMs,
          transcript: s.transcript.map((item) =>
            item.kind === "assistant" && item.streaming
              ? { ...item, streaming: false, interrupted: ev.stopReason === "aborted" }
              : item,
          ),
        }));
        void get().refreshSessions();
        break;
      default:
        break;
    }
  },
}));
