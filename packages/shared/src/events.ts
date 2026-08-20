import { z } from "zod";
import { PermissionRequestSchema } from "./permissions.js";

export const TodoSchema = z.object({
  content: z.string(),
  status: z.enum(["pending", "in_progress", "completed"]),
});
export type Todo = z.infer<typeof TodoSchema>;

export const UsageInfoSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cachedInputTokens: z.number().default(0),
  /** Estimated tokens currently in the context window. */
  contextTokens: z.number(),
  contextPct: z.number(),
  costUsd: z.number().default(0),
});
export type UsageInfo = z.infer<typeof UsageInfoSchema>;

export const AgentErrorCodeSchema = z.enum([
  "rate_limit",
  "invalid_key",
  "insufficient_balance",
  /** A user-set spend limit (Settings → Usage) blocked the turn. */
  "usage_limit",
  "network",
  "aborted",
  "context_overflow",
  "unknown",
]);
export type AgentErrorCode = z.infer<typeof AgentErrorCodeSchema>;

/**
 * The streamed event union. Core yields these from AgentLoop.run();
 * Electron main relays them over IPC; the renderer folds them into the
 * transcript; SessionStore persists a subset as JSONL records.
 */
export const UserQuestionSchema = z.object({
  id: z.string(),
  /** 1-4 questions, walked through one at a time in the card. */
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.object({ label: z.string(), description: z.string().optional() })),
      multiSelect: z.boolean().default(false),
    }),
  ),
  /** Free-text answers allowed alongside the options. */
  allowOther: z.boolean().default(true),
});
export type UserQuestion = z.infer<typeof UserQuestionSchema>;

export const AgentEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message-start"), messageId: z.string() }),
  /**
   * Messages steered into the running turn have just been folded into the
   * context — the next completion includes them, so the UI can mark them read.
   */
  z.object({ type: z.literal("steer-delivered"), messageIds: z.array(z.string()) }),
  z.object({ type: z.literal("text-delta"), messageId: z.string(), delta: z.string() }),
  z.object({ type: z.literal("reasoning-delta"), messageId: z.string(), delta: z.string() }),
  z.object({
    type: z.literal("tool-start"),
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.unknown(),
  }),
  z.object({
    type: z.literal("tool-result"),
    toolCallId: z.string(),
    ok: z.boolean(),
    output: z.string(),
    durationMs: z.number(),
  }),
  z.object({
    type: z.literal("file-edit"),
    toolCallId: z.string(),
    path: z.string(),
    oldText: z.string(),
    newText: z.string(),
  }),
  z.object({ type: z.literal("todo-update"), todos: z.array(TodoSchema) }),
  z.object({
    type: z.literal("artifact"),
    artifactId: z.string(),
    title: z.string(),
    kind: z.enum(["html", "markdown", "svg", "mermaid", "image", "code", "url", "spreadsheet", "slides", "plan"]),
    path: z.string().optional(),
    url: z.string().optional(),
    content: z.string().optional(),
    language: z.string().optional(),
  }),
  z.object({
    type: z.literal("subagent-start"),
    agentRunId: z.string(),
    agentType: z.string(),
    label: z.string(),
  }),
  z.object({
    type: z.literal("subagent-update"),
    agentRunId: z.string(),
    state: z.enum(["running", "done", "error"]),
    toolCount: z.number().default(0),
    lastActivity: z.string().default(""),
    tokens: z.number().default(0),
    result: z.string().optional(),
    durationMs: z.number().default(0),
  }),
  z.object({
    type: z.literal("compaction"),
    beforePct: z.number(),
    afterPct: z.number(),
  }),
  z.object({
    type: z.literal("browser-navigated"),
    url: z.string(),
    title: z.string(),
    tabs: z
      .array(z.object({ id: z.string(), url: z.string(), title: z.string() }))
      .optional(),
    activeTabId: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal("goal-update"),
    iteration: z.number(),
    maxIterations: z.number(),
    done: z.boolean(),
    remaining: z.string(),
  }),
  z.object({
    type: z.literal("workflow-update"),
    workflow: z.lazy(() => WorkflowStateSchema),
  }),
  z.object({ type: z.literal("supercode"), on: z.boolean() }),
  /** LLM-generated session title, pushed as soon as it's ready. */
  z.object({ type: z.literal("session-title"), title: z.string() }),
  z.object({ type: z.literal("permission-request"), request: PermissionRequestSchema }),
  z.object({ type: z.literal("question-request"), request: UserQuestionSchema }),
  z.object({
    type: z.literal("permission-resolved"),
    requestId: z.string(),
    behavior: z.enum(["allow", "deny"]),
  }),
  z.object({ type: z.literal("usage"), usage: UsageInfoSchema }),
  z.object({
    type: z.literal("status"),
    state: z.enum(["thinking", "streaming", "tool", "idle"]),
  }),
  z.object({
    type: z.literal("error"),
    code: AgentErrorCodeSchema,
    message: z.string(),
    retryAfterMs: z.number().optional(),
  }),
  z.object({
    type: z.literal("done"),
    stopReason: z.enum(["stop", "length", "aborted", "error"]),
  }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;

export const AgentEventEnvelopeSchema = z.object({
  sessionId: z.string(),
  seq: z.number(),
  event: AgentEventSchema,
});
export type AgentEventEnvelope = z.infer<typeof AgentEventEnvelopeSchema>;

/** SuperCode workflow progress, streamed as one live snapshot per update. */
export const WorkflowAgentSchema = z.object({
  id: z.string(),
  label: z.string(),
  phase: z.string(),
  state: z.enum(["pending", "running", "done", "error"]),
  tokens: z.number().default(0),
  durationMs: z.number().default(0),
});
export type WorkflowAgent = z.infer<typeof WorkflowAgentSchema>;

export const WorkflowStateSchema = z.object({
  workflowId: z.string(),
  name: z.string(),
  state: z.enum(["planning", "running", "done", "error", "aborted"]),
  phases: z.array(z.string()),
  agents: z.array(WorkflowAgentSchema),
  totalTokens: z.number().default(0),
  costUsd: z.number().default(0),
  log: z.array(z.string()).default([]),
});
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

/**
 * Everything a session holds that is live but not yet committed to the
 * transcript. Returned with session:start so a reattaching renderer restores
 * the whole picture in one atomic update — replaying it as events would race
 * the response that sets the active session id.
 */
export const LiveSnapshotSchema = z.object({
  status: z.enum(["thinking", "streaming", "tool", "idle"]).optional(),
  /** The assistant bubble mid-stream; deltas keep appending to this id. */
  streaming: z
    .object({ messageId: z.string(), text: z.string(), reasoning: z.string() })
    .optional(),
  workflows: z.array(WorkflowStateSchema).default([]),
  todos: z.array(TodoSchema).optional(),
  usage: UsageInfoSchema.optional(),
  /**
   * Every approval still waiting on an answer. A fleet can raise several at
   * once, and each one that never reaches the UI blocks its agent forever —
   * so they queue rather than overwrite.
   */
  permissionRequests: z.array(PermissionRequestSchema).default([]),
  questionRequest: UserQuestionSchema.optional(),
  /**
   * Messages typed into the running turn that the model has not taken yet.
   * They exist only in memory until the loop drains them, so a reload has to
   * put them back or the user watches their own message disappear.
   */
  pendingSteer: z
    .array(z.object({ id: z.string(), text: z.string(), ts: z.number() }))
    .default([]),
});
export type LiveSnapshot = z.infer<typeof LiveSnapshotSchema>;

export const ArtifactSchema = z.object({
  artifactId: z.string(),
  title: z.string(),
  kind: z.enum(["html", "markdown", "svg", "mermaid", "image", "code", "url", "spreadsheet", "slides", "plan"]),
  path: z.string().optional(),
  url: z.string().optional(),
  content: z.string().optional(),
  language: z.string().optional(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;
