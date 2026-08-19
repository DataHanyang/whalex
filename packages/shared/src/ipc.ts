import { z } from "zod";
import { AgentEventEnvelopeSchema, ArtifactSchema } from "./events.js";
import { PermissionResponseSchema } from "./permissions.js";
import { SettingsSchema, RoutineSchema } from "./settings.js";
import { ModelInfoSchema } from "./models.js";
import { SessionMetaSchema, TranscriptItemSchema } from "./session.js";

export const McpStatusSchema = z.object({
  name: z.string(),
  state: z.enum(["connecting", "connected", "error", "disabled"]),
  transport: z.string(),
  toolCount: z.number().default(0),
  error: z.string().optional(),
});
export type McpStatus = z.infer<typeof McpStatusSchema>;

export const SlashCommandSchema = z.object({
  name: z.string(),
  description: z.string(),
  source: z.enum(["builtin", "skill", "mcp", "plugin"]),
});
export type SlashCommand = z.infer<typeof SlashCommandSchema>;

export const SkillInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
  source: z.enum(["bundled", "user", "project", "plugin"]),
  path: z.string(),
  enabled: z.boolean().default(true),
});
export type SkillInfo = z.infer<typeof SkillInfoSchema>;

export const FileMatchSchema = z.object({
  path: z.string(),
  relPath: z.string(),
  isDir: z.boolean(),
});
export type FileMatch = z.infer<typeof FileMatchSchema>;

export const UpdateStatusSchema = z.object({
  state: z.enum(["idle", "checking", "available", "downloading", "downloaded", "error", "current"]),
  version: z.string().optional(),
  percent: z.number().optional(),
  notes: z.string().optional(),
  error: z.string().optional(),
});
export type UpdateStatus = z.infer<typeof UpdateStatusSchema>;

/**
 * The renderer↔main contract. Every channel's request and response schema
 * lives here; main zod-parses each request before handling it, so the
 * renderer (which displays untrusted tool/web output) can never smuggle a
 * malformed payload into the privileged process.
 */
export const IPC_INVOKE = {
  "app:getState": {
    req: z.void(),
    res: z.object({
      version: z.string(),
      settings: SettingsSchema,
      /** providerId → masked key tail ("...a1b2") or null when unset. */
      secrets: z.record(z.string().nullable()),
      edition: z.enum(["oss", "cloud"]),
      signedIn: z.boolean(),
    }),
  },
  "auth:signIn": { req: z.void(), res: z.void() },
  "auth:signOut": { req: z.void(), res: z.void() },
  "settings:update": {
    req: SettingsSchema.partial(),
    res: SettingsSchema,
  },
  "secrets:set": {
    req: z.object({ ref: z.string(), value: z.string() }),
    res: z.void(),
  },
  "provider:test": {
    req: z.object({ providerId: z.string(), apiKey: z.string().optional() }),
    res: z.object({
      ok: z.boolean(),
      models: z.array(ModelInfoSchema).default([]),
      error: z.string().optional(),
    }),
  },
  "models:list": {
    req: z.object({ providerId: z.string() }),
    res: z.array(ModelInfoSchema),
  },
  "session:list": {
    req: z.object({ cwd: z.string().optional() }),
    res: z.array(SessionMetaSchema),
  },
  "session:delete": {
    req: z.object({ cwd: z.string(), sessionId: z.string() }),
    res: z.void(),
  },
  "session:start": {
    req: z.object({ cwd: z.string(), resumeSessionId: z.string().optional() }),
    res: z.object({
      sessionId: z.string(),
      cwd: z.string(),
      transcript: z.array(TranscriptItemSchema),
      running: z.boolean().optional(),
      // Actual host-side session state, so a reattaching UI restores what the
      // engine is really using instead of resetting to defaults.
      model: z.string().optional(),
      permissionMode: z.enum(["default", "acceptEdits", "bypassPermissions", "plan"]).optional(),
      goalMode: z.boolean().optional(),
      superCode: z.boolean().optional(),
    }),
  },
  "session:send": {
    req: z.object({ sessionId: z.string(), text: z.string(), model: z.string() }),
    res: z.void(),
  },
  "session:abort": {
    req: z.object({ sessionId: z.string() }),
    res: z.void(),
  },
  "session:setMode": {
    req: z.object({
      sessionId: z.string(),
      mode: z.enum(["default", "acceptEdits", "bypassPermissions", "plan"]),
    }),
    res: z.void(),
  },
  "session:setGoalMode": {
    req: z.object({ sessionId: z.string(), on: z.boolean() }),
    res: z.void(),
  },
  "session:setModel": {
    req: z.object({ sessionId: z.string(), model: z.string() }),
    res: z.void(),
  },
  "mcp:enablePreset": {
    req: z.object({ name: z.string(), cwd: z.string() }),
    res: z.void(),
  },
  "question:respond": {
    req: z.object({ id: z.string(), answer: z.string() }),
    res: z.void(),
  },
  "permission:respond": {
    req: PermissionResponseSchema,
    res: z.void(),
  },
  "session:command": {
    req: z.object({ sessionId: z.string(), command: z.string(), args: z.string().optional() }),
    res: z.object({ handled: z.boolean(), message: z.string().optional() }),
  },
  "checkpoint:list": {
    req: z.object({ sessionId: z.string() }),
    res: z.array(
      z.object({
        boundary: z.number(),
        ts: z.number(),
        label: z.string(),
        fileChanges: z.number(),
      }),
    ),
  },
  "checkpoint:rewind": {
    req: z.object({ sessionId: z.string(), boundary: z.number() }),
    res: z.object({ restored: z.array(z.string()), transcript: z.array(TranscriptItemSchema) }),
  },
  "commands:list": {
    req: z.object({ cwd: z.string().optional() }),
    res: z.array(SlashCommandSchema),
  },
  "files:search": {
    req: z.object({ cwd: z.string(), query: z.string(), limit: z.number().optional() }),
    res: z.array(FileMatchSchema),
  },
  "mcp:status": {
    req: z.void(),
    res: z.array(McpStatusSchema),
  },
  "mcp:restart": {
    req: z.object({ name: z.string() }),
    res: z.void(),
  },
  "skills:list": {
    req: z.object({ cwd: z.string().optional() }),
    res: z.array(SkillInfoSchema),
  },
  "skills:install": {
    req: z.object({ source: z.string() }),
    res: z.object({
      ok: z.boolean(),
      installed: z.array(z.string()),
      error: z.string().optional(),
    }),
  },
  "skills:toggle": {
    req: z.object({ name: z.string(), enabled: z.boolean() }),
    res: z.void(),
  },
  "skills:remove": {
    req: z.object({ name: z.string() }),
    res: z.object({ ok: z.boolean(), error: z.string().optional() }),
  },
  "plugins:install": {
    req: z.object({ source: z.enum(["local", "git"]), location: z.string() }),
    res: z.object({ ok: z.boolean(), name: z.string().optional(), error: z.string().optional() }),
  },
  "plugins:remove": {
    req: z.object({ name: z.string() }),
    res: z.void(),
  },
  "artifact:read": {
    req: z.object({ artifactId: z.string() }),
    res: ArtifactSchema.nullable(),
  },
  "preview:start": {
    req: z.object({ sessionId: z.string(), command: z.string(), port: z.number(), cwd: z.string().optional() }),
    res: z.object({ ok: z.boolean(), url: z.string().optional(), error: z.string().optional() }),
  },
  "preview:stop": {
    req: z.object({ sessionId: z.string() }),
    res: z.void(),
  },
  "routines:run": {
    req: z.object({ id: z.string() }),
    res: z.object({ ok: z.boolean(), error: z.string().optional() }),
  },
  /**
   * Create or update a routine from a natural-language prompt. The model
   * extracts the schedule (or "manual" when the prompt names no time), so the
   * UI carries no date/time pickers. Omit id to create; pass it to update.
   */
  "routines:save": {
    req: z.object({
      id: z.string().optional(),
      prompt: z.string(),
      name: z.string().optional(),
      cwd: z.string(),
      permissionMode: z.enum(["default", "acceptEdits", "bypassPermissions"]).optional(),
    }),
    res: z.object({ ok: z.boolean(), routine: RoutineSchema.optional(), error: z.string().optional() }),
  },
  "usage:summary": {
    req: z.object({
      days: z.number().int().min(1).max(90).optional(),
      /** Also query the provider's account balance (network call). */
      includeBalance: z.boolean().optional(),
    }),
    res: z.object({
      days: z.array(
        z.object({
          date: z.string(),
          usd: z.number(),
          input: z.number(),
          output: z.number(),
          cachedInput: z.number(),
        }),
      ),
      todayUsd: z.number(),
      monthUsd: z.number(),
      byModel: z.record(
        z.object({
          usd: z.number(),
          input: z.number(),
          output: z.number(),
          cachedInput: z.number(),
        }),
      ),
      /** null when the active provider has no balance API (Ollama etc.). */
      balance: z
        .object({
          currency: z.string(),
          total: z.number(),
          granted: z.number(),
          toppedUp: z.number(),
        })
        .nullable(),
      balanceError: z.string().optional(),
    }),
  },
  "update:check": {
    req: z.void(),
    res: z.void(),
  },
  "update:download": {
    req: z.void(),
    res: z.void(),
  },
  "update:install": {
    req: z.void(),
    res: z.void(),
  },
  "browser:setBounds": {
    req: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
    res: z.void(),
  },
  "browser:hide": {
    req: z.void(),
    res: z.void(),
  },
  "browser:navigate": {
    req: z.object({ url: z.string() }),
    res: z.void(),
  },
  "browser:selectTab": {
    req: z.object({ tabId: z.string() }),
    res: z.void(),
  },
  "browser:closeTab": {
    req: z.object({ tabId: z.string() }),
    res: z.void(),
  },
  "vision:test": {
    req: z.object({ baseUrl: z.string(), model: z.string(), apiKey: z.string().optional() }),
    res: z.object({ ok: z.boolean(), error: z.string().optional() }),
  },
  "vision:describe": {
    req: z.object({ imageDataUrl: z.string(), question: z.string().optional() }),
    res: z.object({
      ok: z.boolean(),
      description: z.string().optional(),
      error: z.string().optional(),
      configured: z.boolean(),
    }),
  },
  "dialog:pickFolder": {
    req: z.void(),
    res: z.object({ path: z.string().nullable() }),
  },
  "shell:openExternal": {
    req: z.object({ url: z.string().url() }),
    res: z.void(),
  },
} as const;

export const UsageWarningSchema = z.object({
  kind: z.enum(["daily", "monthly", "balance"]),
  /** Percent of the limit spent (daily/monthly kinds). */
  pct: z.number().optional(),
  usd: z.number(),
  limit: z.number(),
});
export type UsageWarning = z.infer<typeof UsageWarningSchema>;

export const IPC_EVENTS = {
  "agent:event": AgentEventEnvelopeSchema,
  "mcp:status": z.array(McpStatusSchema),
  "update:status": UpdateStatusSchema,
  "usage:warning": UsageWarningSchema,
} as const;

export type IpcInvokeChannel = keyof typeof IPC_INVOKE;
export type IpcEventChannel = keyof typeof IPC_EVENTS;

export type IpcRequest<C extends IpcInvokeChannel> = z.infer<(typeof IPC_INVOKE)[C]["req"]>;
export type IpcResponse<C extends IpcInvokeChannel> = z.infer<(typeof IPC_INVOKE)[C]["res"]>;
export type IpcEventPayload<C extends IpcEventChannel> = z.infer<(typeof IPC_EVENTS)[C]>;

/** Shape of the API preload exposes as `window.whalex`. */
export interface WhalexApi {
  invoke<C extends IpcInvokeChannel>(channel: C, req: IpcRequest<C>): Promise<IpcResponse<C>>;
  on<C extends IpcEventChannel>(
    channel: C,
    listener: (payload: IpcEventPayload<C>) => void,
  ): () => void;
}
