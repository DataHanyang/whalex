import { create } from "zustand";
import {
  emptyClientState,
  foldEnvelope,
  hydrateSession,
  type ClientSessionState,
  type FoldContext,
} from "@whalex/client-core";
import type { AgentEventEnvelope, SessionMeta } from "@whalex/shared";
import { useConnectionStore } from "./connectionStore";

const foldCtx: FoldContext = {
  now: () => Date.now(),
  formatGoal: (ev) =>
    ev.done
      ? `Goal reached (${ev.iteration}/${ev.maxIterations})`
      : `Continuing toward goal (${ev.iteration}/${ev.maxIterations})`,
};

interface MobileSessionState extends ClientSessionState {
  sessions: SessionMeta[];
  activeSessionId: string | null;
  cwd: string | null;
  model: string;
  /** Highest applied envelope seq; gaps force a fresh snapshot. */
  lastSeq: number;
  opening: boolean;

  refreshSessions(): Promise<void>;
  open(cwd: string, resumeSessionId?: string): Promise<void>;
  closeSession(): void;
  send(text: string): Promise<void>;
  abort(): Promise<void>;
  respondPermission(id: string, allow: boolean): Promise<void>;
  answerQuestion(id: string, answer: string): Promise<void>;
}

/** Envelopes arriving while session:start is in flight; applied after hydrate. */
let buffer: AgentEventEnvelope[] | null = null;

export const useMobileSession = create<MobileSessionState>((set, get) => {
  // Register as the connection's event sink once, at store creation.
  useConnectionStore.setState({
    onEvent: (env) => handleEnvelope(env),
    onAlert: (env) => {
      // Alerts from other sessions: refresh the list on completion so the
      // sidebar-equivalent stays truthful; approvals surface via badge later.
      if (env.event.type === "done" || env.event.type === "error") void get().refreshSessions();
    },
  });

  function client() {
    const c = useConnectionStore.getState().client;
    if (!c) throw new Error("not connected");
    return c;
  }

  function handleEnvelope(env: AgentEventEnvelope): void {
    const s = get();
    if (env.sessionId !== s.activeSessionId) return;
    if (buffer) {
      buffer.push(env);
      return;
    }
    if (env.seq <= s.lastSeq) return; // replay from before the snapshot
    if (env.seq > s.lastSeq + 1) {
      // Gap — the stream is holey (reconnect missed events). Never render a
      // holey transcript; re-snapshot instead.
      const { cwd, activeSessionId } = s;
      if (cwd && activeSessionId) void get().open(cwd, activeSessionId);
      return;
    }
    const { state } = foldEnvelope(clientSlice(s), env.event, foldCtx);
    set({ ...state, lastSeq: env.seq });
  }

  return {
    ...emptyClientState(),
    sessions: [],
    activeSessionId: null,
    cwd: null,
    model: "deepseek-v4-flash",
    lastSeq: 0,
    opening: false,

    async refreshSessions() {
      const sessions = await client().invoke("session:list", {});
      set({ sessions });
    },

    async open(cwd, resumeSessionId) {
      const c = client();
      set({ opening: true, activeSessionId: resumeSessionId ?? null, cwd });
      // Subscribe FIRST and buffer, so nothing falls between snapshot and stream.
      if (resumeSessionId) c.subscribe([resumeSessionId]);
      buffer = [];
      try {
        const res = await c.invoke("session:start", { cwd, resumeSessionId });
        c.subscribe([res.sessionId]);
        const snapshotSeq = res.seq ?? 0;
        const hydrated = hydrateSession(res, foldCtx);
        set({
          ...hydrated,
          activeSessionId: res.sessionId,
          cwd: res.cwd,
          model: res.model ?? get().model,
          lastSeq: snapshotSeq,
          opening: false,
          turnStartedAt: null,
          lastTurnMs: null,
        });
        const pending = buffer;
        buffer = null;
        for (const env of pending) {
          if (env.sessionId === res.sessionId && env.seq > get().lastSeq) {
            const { state } = foldEnvelope(clientSlice(get()), env.event, foldCtx);
            set({ ...state, lastSeq: env.seq });
          }
        }
      } catch (err) {
        buffer = null;
        set({ opening: false });
        throw err;
      }
    },

    closeSession() {
      const c = useConnectionStore.getState().client;
      c?.subscribe([]);
      set({ ...emptyClientState(), activeSessionId: null, cwd: null, lastSeq: 0 });
    },

    async send(text) {
      const { activeSessionId, model, status } = get();
      if (!activeSessionId) return;
      const steering = status !== "idle";
      const messageId = `mob-${Date.now()}`;
      set((s) => ({
        transcript: [
          ...s.transcript,
          {
            kind: "user" as const,
            id: messageId,
            text,
            ts: Date.now(),
            ...(steering ? { delivery: "pending" as const } : {}),
          },
        ],
        ...(steering ? {} : { status: "thinking" as const, turnStartedAt: Date.now() }),
      }));
      await client().invoke("session:send", { sessionId: activeSessionId, text, model, messageId });
    },

    async abort() {
      const id = get().activeSessionId;
      if (id) await client().invoke("session:abort", { sessionId: id });
    },

    async respondPermission(id, allow) {
      set((s) => ({ pendingPermissions: s.pendingPermissions.filter((p) => p.id !== id) }));
      await client().invoke("permission:respond", {
        id,
        behavior: allow ? "allow" : "deny",
        scope: "once",
      });
    },

    async answerQuestion(id, answer) {
      set({ pendingQuestion: null });
      await client().invoke("question:respond", { id, answer });
    },
  };
});

function clientSlice(s: MobileSessionState): ClientSessionState {
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
