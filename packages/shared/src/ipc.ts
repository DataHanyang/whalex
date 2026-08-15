import { z } from "zod";
import { AgentEventEnvelopeSchema } from "./events.js";
import { PermissionResponseSchema } from "./permissions.js";
import { SettingsSchema } from "./settings.js";
import { ModelInfoSchema } from "./models.js";
import { SessionMetaSchema, TranscriptItemSchema } from "./session.js";

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
