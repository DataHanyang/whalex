import { z } from "zod";
import { TodoSchema, WorkflowStateSchema } from "./events.js";

export const SessionMetaSchema = z.object({
  sessionId: z.string(),
  cwd: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  /** True while this app instance is actively running the session. */
  running: z.boolean().optional(),
  messageCount: z.number(),
  model: z.string().optional(),
});
export type SessionMeta = z.infer<typeof SessionMetaSchema>;

/**
 * Normalized transcript items the renderer displays. Live streaming folds
 * AgentEvents into these; resuming a session replays them from JSONL.
 */
export const TranscriptItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), id: z.string(), text: z.string(), ts: z.number() }),
  z.object({
    kind: z.literal("assistant"),
    id: z.string(),
    text: z.string(),
    reasoning: z.string().default(""),
    streaming: z.boolean().default(false),
    interrupted: z.boolean().default(false),
    ts: z.number(),
  }),
  z.object({
    kind: z.literal("tool"),
    id: z.string(),
    toolName: z.string(),
    args: z.unknown(),
    state: z.enum(["running", "ok", "error", "denied"]),
    output: z.string().default(""),
    durationMs: z.number().default(0),
    diff: z
      .object({ path: z.string(), oldText: z.string(), newText: z.string() })
      .optional(),
    ts: z.number(),
  }),
  z.object({ kind: z.literal("todos"), id: z.string(), todos: z.array(TodoSchema), ts: z.number() }),
  z.object({
    kind: z.literal("subagent"),
    id: z.string(),
    agentType: z.string(),
    label: z.string(),
    state: z.enum(["running", "done", "error"]),
    toolCount: z.number().default(0),
    tokens: z.number().default(0),
    result: z.string().default(""),
    durationMs: z.number().default(0),
    ts: z.number(),
  }),
  z.object({
    kind: z.literal("artifact"),
    id: z.string(),
    artifactId: z.string(),
    title: z.string(),
    artifactKind: z.string(),
    ts: z.number(),
  }),
  z.object({
    kind: z.literal("workflow"),
    id: z.string(),
    workflowId: z.string(),
    name: z.string(),
    /**
     * Final (or last known) progress tree, persisted with the record so a
     * finished workflow still renders after a reload. Absent for runs that
     * predate persistence, and for a run still streaming live updates.
     */
    state: WorkflowStateSchema.optional(),
    ts: z.number(),
  }),
  z.object({
    kind: z.literal("compaction"),
    id: z.string(),
    beforePct: z.number(),
    afterPct: z.number(),
    ts: z.number(),
  }),
  z.object({
    kind: z.literal("error"),
    id: z.string(),
    code: z.string(),
    message: z.string(),
    ts: z.number(),
  }),
]);
export type TranscriptItem = z.infer<typeof TranscriptItemSchema>;
