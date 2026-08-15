import { z } from "zod";
import { AgentEventEnvelopeSchema, ArtifactSchema } from "./events.js";
import { PermissionResponseSchema } from "./permissions.js";
import { SettingsSchema } from "./settings.js";
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
  source: z.enum(["user", "project", "plugin"]),
  path: z.string(),
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
    }),
  },
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
  "session:start": {
    req: z.object({ cwd: z.string(), resumeSessionId: z.string().optional() }),
    res: z.object({
      sessionId: z.string(),
      cwd: z.string(),
      transcript: z.array(TranscriptItemSchema),
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
  "permission:respond": {
    req: PermissionResponseSchema,
    res: z.void(),
  },
  "session:command": {
    req: z.object({ sessionId: z.string(), command: z.string(), args: z.string().optional() }),
    res: z.object({ handled: z.boolean(), message: z.string().optional() }),
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
  "vision:test": {
    req: z.object({ baseUrl: z.string(), model: z.string(), apiKey: z.string().optional() }),
    res: z.object({ ok: z.boolean(), error: z.string().optional() }),
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

export const IPC_EVENTS = {
  "agent:event": AgentEventEnvelopeSchema,
  "mcp:status": z.array(McpStatusSchema),
  "update:status": UpdateStatusSchema,
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
