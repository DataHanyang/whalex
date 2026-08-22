import type {
  AgentEvent,
  Artifact,
  PermissionRequest,
  Todo,
  TranscriptItem,
  UsageInfo,
  UserQuestion,
  WorkflowState,
} from "@whalex/shared";

export type SessionStatus = "idle" | "thinking" | "streaming" | "tool";

export interface SubagentInfo {
  agentType: string;
  label: string;
  state: string;
  toolCount: number;
  tokens: number;
  lastActivity: string;
}

/**
 * The part of a client's per-session state that every UI (desktop renderer,
 * mobile app) folds identically from the agent event stream. UI-specific
 * concerns — side panels, browser tabs, mode/model pickers — stay in the host
 * store; foldEnvelope surfaces them as signals instead of mutating them.
 */
export interface ClientSessionState {
  transcript: TranscriptItem[];
  status: SessionStatus;
  usage: UsageInfo | null;
  todos: Todo[];
  /** Approvals waiting on the user, oldest first — a UI shows [0]. */
  pendingPermissions: PermissionRequest[];
  pendingQuestion: UserQuestion | null;
  /** A plan artifact is awaiting the user's Accept / Revise / Reject. */
  planPending: boolean;
  lastError: { code: string; message: string } | null;
  artifacts: Artifact[];
  subagents: Record<string, SubagentInfo>;
  /** Every workflow of this session by id — finished ones keep rendering. */
  workflows: Record<string, WorkflowState>;
  /** Wall-clock start of the running turn, or null when idle. */
  turnStartedAt: number | null;
  /** Total duration of the last completed turn (ms). */
  lastTurnMs: number | null;
  superCode: boolean;
}

/** Host-side effects a fold step asks for; the store applies them after set(). */
export type FoldSignal =
  | { type: "artifact-added"; artifactId: string }
  | { type: "supercode"; on: boolean }
  /** Mode/model/goal changed by some attached client — mirror the chips. */
  | { type: "control"; mode?: string; model?: string; goalMode?: boolean }
  | {
      type: "browser-navigated";
      tabs: Array<{ id: string; url: string; title: string }>;
      activeTabId: string | null;
    }
  /** The turn ended — refresh the session list, stop spinners, etc. */
  | { type: "turn-finished" };

export interface FoldContext {
  now(): number;
  /** Renders a goal-update event into a display string (i18n lives host-side). */
  formatGoal(ev: Extract<AgentEvent, { type: "goal-update" }>): string;
}
