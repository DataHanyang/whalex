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
import {
  foldEnvelope,
  hydrateSession,
  type ClientSessionState,
  type FoldContext,
  type SessionStatus,
} from "@whalex/client-core";
import { whalex } from "../lib/ipc";

export type { SessionStatus };

/** Event-folding lives in @whalex/client-core (shared with the mobile app);
 *  only i18n and the clock are injected from here. */
const foldCtx: FoldContext = {
  now: () => Date.now(),
  formatGoal: (ev) =>
    ev.done
      ? i18n.t("transcript.goalDone", { i: ev.iteration, max: ev.maxIterations })
      : i18n.t("transcript.goalContinue", {
          i: ev.iteration,
          max: ev.maxIterations,
          remaining: ev.remaining,
        }),
};

interface SessionState {
  cwd: string | null;
  activeSessionId: string | null;
  sessions: SessionMeta[];
  transcript: TranscriptItem[];
  status: SessionStatus;
  usage: UsageInfo | null;
  todos: Todo[];
  /**
   * Approvals waiting on the user, oldest first — the card shows [0]. A
   * SuperCode fleet can raise several at once and each blocks its own agent,
   * so a newer request must never replace one still unanswered.
   */
  pendingPermissions: PermissionRequest[];
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
  /** Every workflow of this session by id — finished ones keep rendering. */
  workflows: Record<string, WorkflowState>;
  browser: { tabs: Array<{ id: string; url: string; title: string }>; activeTabId: string | null };
  /** Selected side-panel tab: "agents", `a:<artifactId>` or `b:<browserTabId>`. */
  sideTab: string | null;
  /** Wall-clock start of the running turn, or null when idle. */
  turnStartedAt: number | null;
  /** Total duration of the last completed turn (ms). */
  lastTurnMs: number | null;
  permissionMode: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "unrestricted";
  /** Mode the user had before SuperCode took over, restored on toggle-off. */
  preSuperCodeMode:
    | "default"
    | "acceptEdits"
    | "bypassPermissions"
    | "plan"
    | "unrestricted"
    | null;
  goalMode: boolean;

  setModel(model: string): void;
  setSuperCode(on: boolean): void;
  setPermissionMode(
    mode: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "unrestricted",
  ): void;
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
  openInitialSession(cwd?: string): Promise<void>;
  startSession(cwd: string, resumeSessionId?: string): Promise<void>;
  send(text: string): Promise<void>;
  /** Rewrite a still-unread message; no-op once the model has read it. */
  editPending(messageId: string, text: string): Promise<void>;
  /** Drop a still-unread message; no-op once the model has read it. */
  cancelPending(messageId: string): Promise<void>;
  abort(): Promise<void>;
  respondPermission(res: Omit<PermissionResponse, "id"> & { id: string }): Promise<void>;
  handleEnvelope(env: AgentEventEnvelope): void;
}

let unsubscribe: (() => void) | null = null;

// Generation counter for session:start round-trips: rapid sidebar clicks can
// leave several in flight, and only the latest one may win the store.
let startSeq = 0;

export const useSessionStore = create<SessionState>((set, get) => ({
  cwd: null,
  activeSessionId: null,
  sessions: [],
  transcript: [],
  status: "idle",
  usage: null,
  todos: [],
  pendingPermissions: [],
  pendingQuestion: null,
  planPending: false,
  lastError: null,
  model: "deepseek-v4-flash",
  superCode: false,
  artifacts: [],
  activeArtifactId: null,
  subagents: {},
  workflows: {},
  browser: { tabs: [], activeTabId: null },
  sideTab: null,
  turnStartedAt: null,
  lastTurnMs: null,
  permissionMode: "default",
  preSuperCodeMode: null,
  goalMode: false,

  setModel(model) {
    set({ model });
    const id = get().activeSessionId;
    if (id) void whalex.invoke("session:setModel", { sessionId: id, model });
  },
  setSuperCode(on) {
    const prevMode = get().permissionMode;
    set({ superCode: on });
    const id = get().activeSessionId;
    if (id) void whalex.invoke("session:command", { sessionId: id, command: on ? "supercode-on" : "supercode-off" });
    // SuperCode always opens in plan mode with the strongest model: recon
    // and the budget interview come before any write. Re-enabling it on a
    // session whose plan was already presented must NOT drag the run back
    // into plan mode — that blocked a mid-execution session once.
    if (on) {
      set({ preSuperCodeMode: prevMode });
      get().setModel("deepseek-v4-pro");
      const planDone = get().transcript.some((t) => t.kind === "artifact" && t.artifactKind === "plan");
      get().setPermissionMode(planDone ? "bypassPermissions" : "plan");
    } else {
      // Toggle-off hands back whatever mode the user was in before.
      const restore = get().preSuperCodeMode ?? "default";
      set({ preSuperCodeMode: null });
      get().setPermissionMode(restore);
    }
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
    // Resumed sessions start with an empty artifacts list, but main keeps
    // every artifact for the session — lazily hydrate from artifact:read.
    if (!get().artifacts.some((a) => a.artifactId === id)) {
      void whalex.invoke("artifact:read", { artifactId: id }).then((artifact) => {
        if (!artifact) return;
        set((s) =>
          s.artifacts.some((a) => a.artifactId === id)
            ? {}
            : { artifacts: [...s.artifacts, artifact] },
        );
      });
    }
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
    const s = get();
    const tabs = s.browser.tabs.filter((t) => t.id !== tabId);
    // Closing a background tab must not steal the active slot.
    const activeTabId =
      s.browser.activeTabId === tabId ? (tabs.at(-1)?.id ?? null) : s.browser.activeTabId;
    set({ browser: { tabs, activeTabId } });
    if (s.sideTab === `b:${tabId}`) {
      // Route through selectSideTab so the native view actually switches
      // (browser:selectTab) or parks (browser:hide).
      if (activeTabId) get().selectSideTab(`b:${activeTabId}`);
      else set({ sideTab: null });
    }
  },

  async refreshSessions() {
    // Every project's sessions, so switching folders never "loses" them;
    // the sidebar groups them by folder.
    const sessions = await whalex.invoke("session:list", {});
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

  /**
   * What the window opens on. A renderer reload (or crash) must reattach to a
   * turn that is still running in main instead of opening a blank session:
   * an orphaned turn keeps spending, its approval cards land nowhere, and
   * Stop would abort the new empty session instead of the working one.
   */
  async openInitialSession(cwd) {
    const attached = await whalex.invoke("session:attached", undefined);
    if (attached.sessionId && attached.cwd && attached.running) {
      await get().startSession(attached.cwd, attached.sessionId);
      return;
    }
    // No folder yet (setup no longer picks one) — the empty state asks for one
    // rather than opening a session with nowhere to work.
    if (!cwd) return;
    await get().startSession(cwd);
  },

  async startSession(cwd, resumeSessionId) {
    // Re-clicking the already-open session must not wipe its live state.
    if (resumeSessionId && resumeSessionId === get().activeSessionId) return;
    unsubscribe ??= whalex.on("agent:event", (env) => get().handleEnvelope(env));
    const seq = ++startSeq;
    const res = await whalex.invoke("session:start", { cwd, resumeSessionId });
    if (seq !== startSeq) return; // a newer click superseded this response
    set({
      // Shared reattach logic (plan-pending re-derivation, workflow merge,
      // streaming-bubble re-hang) lives in @whalex/client-core.
      ...hydrateSession(res, foldCtx),
      cwd,
      activeSessionId: res.sessionId,
      activeArtifactId: null,
      browser: { tabs: [], activeTabId: null },
      sideTab: null,
      // Restore what the host engine is actually using — a reattached session
      // must not silently fall back to default mode/model in the UI.
      goalMode: res.goalMode ?? false,
      permissionMode: res.permissionMode ?? "default",
      model: res.model ?? get().model,
      preSuperCodeMode: null,
    });
    void whalex.invoke("browser:hide", undefined);
    await get().refreshSessions();
  },

  async send(text) {
    const { activeSessionId, model, status } = get();
    if (!activeSessionId) return;
    const steering = status !== "idle";
    const messageId = `local-${Date.now()}`;
    set({ lastError: null });
    set((s) => ({
      transcript: [
        ...s.transcript,
        // A steered message queues behind the running turn, so it starts
        // unread; one that opens its own turn is in the model's context at
        // once and carries no delivery state at all.
        {
          kind: "user",
          id: messageId,
          text,
          ts: Date.now(),
          ...(steering ? { delivery: "pending" as const } : {}),
        },
      ],
      ...(steering
        ? {}
        : { status: "thinking" as const, turnStartedAt: Date.now(), lastTurnMs: null }),
    }));
    await whalex.invoke("session:send", { sessionId: activeSessionId, text, model, messageId });
    // The new session should appear in the sidebar immediately, not only
    // after the (possibly long) first turn finishes.
    if (!steering) void get().refreshSessions();
  },

  async editPending(messageId, text) {
    const id = get().activeSessionId;
    if (!id) return;
    const res = await whalex.invoke("session:steerEdit", { sessionId: id, messageId, text });
    set((s) => ({
      transcript: s.transcript.map((t) =>
        t.kind === "user" && t.id === messageId
          // Lost the race: the model already has the original text, so show
          // that it was read rather than pretending the edit landed.
          ? res.ok
            ? { ...t, text }
            : { ...t, delivery: "read" as const }
          : t,
      ),
    }));
  },

  async cancelPending(messageId) {
    const id = get().activeSessionId;
    if (!id) return;
    const res = await whalex.invoke("session:steerCancel", { sessionId: id, messageId });
    set((s) => ({
      transcript: res.ok
        ? s.transcript.filter((t) => !(t.kind === "user" && t.id === messageId))
        : s.transcript.map((t) =>
            t.kind === "user" && t.id === messageId ? { ...t, delivery: "read" as const } : t,
          ),
    }));
  },

  async abort() {
    const { activeSessionId } = get();
    if (activeSessionId) await whalex.invoke("session:abort", { sessionId: activeSessionId });
  },

  async respondPermission(res) {
    set((s) => ({ pendingPermissions: s.pendingPermissions.filter((p) => p.id !== res.id) }));
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
    // Session titles apply to whichever session they name, active or not.
    if (env.event.type === "session-title") {
      const title = env.event.title;
      set((s) => ({
        sessions: s.sessions.map((m) =>
          m.sessionId === env.sessionId ? { ...m, title } : m,
        ),
      }));
      return;
    }
    if (env.sessionId !== get().activeSessionId) {
      // Background sessions keep their transcripts in main, but completion
      // should reach the sidebar immediately, not on the 10s poll.
      if (env.event.type === "done" || env.event.type === "error") {
        void get().refreshSessions();
      }
      return;
    }
    // SuperCode's toggle-restore needs the pre-event flag and mode.
    const wasSuper = get().superCode;
    const prevMode = get().permissionMode;
    // The event→state mapping is shared with the mobile app via client-core;
    // only the UI side-effects (signals) are handled here.
    const { state, signals } = foldEnvelope(clientState(get()), env.event, foldCtx);
    set(state);
    for (const sig of signals) {
      switch (sig.type) {
        case "artifact-added":
          set({ activeArtifactId: sig.artifactId, sideTab: `a:${sig.artifactId}` });
          break;
        case "supercode": {
          // Fired on keyword activation AND on reattach replay. Mirror the
          // flag and model, but only enter plan mode when the plan stage
          // hasn't happened yet — replaying this on a mid-execution session
          // used to drag it back into read-only plan mode.
          if (sig.on && !wasSuper) set({ preSuperCodeMode: prevMode });
          if (sig.on) {
            get().setModel("deepseek-v4-pro");
            const planDone = get().transcript.some(
              (t) => t.kind === "artifact" && t.artifactKind === "plan",
            );
            if (!planDone) get().setPermissionMode("plan");
          }
          break;
        }
        case "browser-navigated":
          set({
            browser: { tabs: sig.tabs, activeTabId: sig.activeTabId },
            ...(sig.activeTabId
              ? { sideTab: `b:${sig.activeTabId}`, activeArtifactId: null }
              : {}),
          });
          break;
        case "turn-finished":
          void get().refreshSessions();
          break;
        case "control": {
          // A phone (or another window) changed the session's chips — mirror
          // the values without re-invoking the setters, which would echo the
          // same event back around.
          const patch: Record<string, unknown> = {};
          if (sig.mode !== undefined) patch.permissionMode = sig.mode;
          if (sig.model !== undefined) patch.model = sig.model;
          if (sig.goalMode !== undefined) patch.goalMode = sig.goalMode;
          set(patch);
          break;
        }
      }
    }
  },
}));

/** The slice of the store that client-core's reducer reads and rewrites. */
function clientState(s: SessionState): ClientSessionState {
  return {
    transcript: s.transcript,
    status: s.status,
    usage: s.usage,
    todos: s.todos,
    pendingPermissions: s.pendingPermissions,
    pendingQuestion: s.pendingQuestion,
    planPending: s.planPending,
    lastError: s.lastError,
    artifacts: s.artifacts,
    subagents: s.subagents,
    workflows: s.workflows,
    turnStartedAt: s.turnStartedAt,
    lastTurnMs: s.lastTurnMs,
    superCode: s.superCode,
  };
}
