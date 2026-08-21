import { z } from "zod";
import { AgentEventEnvelopeSchema } from "./events.js";
import { UsageWarningSchema, type IpcInvokeChannel } from "./ipc.js";

/**
 * Wire contract between the desktop's remote bridge (a WSS server in the main
 * process) and mobile clients. The invoke side reuses IPC_INVOKE schemas — a
 * remote client is another renderer, just behind a socket instead of preload.
 */

/** Bumped when the wire shape changes incompatibly; exchanged in hello. */
export const REMOTE_PROTOCOL_VERSION = 1;

/**
 * Channels a remote client may invoke — a strict subset of IPC_INVOKE.
 * Everything touching secrets, the OS shell/dialogs, app settings, updates,
 * or destructive session ops stays desktop-only.
 */
export const REMOTE_CHANNELS = [
  "remote:appInfo",
  "session:list",
  "session:start",
  "session:send",
  "session:abort",
  "session:steerEdit",
  "session:steerCancel",
  "session:setMode",
  "session:setGoalMode",
  "session:setModel",
  "session:command",
  "session:attached",
  "permission:respond",
  "question:respond",
  "checkpoint:list",
  "checkpoint:rewind",
  "models:list",
  "usage:summary",
  "commands:list",
  "files:search",
  "artifact:read",
  "mcp:status",
] as const satisfies readonly IpcInvokeChannel[];
export type RemoteChannel = (typeof REMOTE_CHANNELS)[number];

export function isRemoteChannel(channel: string): channel is RemoteChannel {
  return (REMOTE_CHANNELS as readonly string[]).includes(channel);
}

/**
 * Low-frequency event types forwarded for sessions the client did NOT
 * subscribe to — enough for badges, notifications, and a live session list
 * without streaming every session's text deltas over the radio.
 */
export const REMOTE_ALERT_EVENT_TYPES = [
  "permission-request",
  "question-request",
  "permission-resolved",
  "done",
  "error",
  "session-title",
  "status",
] as const;

export const RemoteClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    protocolVersion: z.number().int(),
    client: z.object({
      name: z.string().max(64),
      platform: z.string().max(32),
      appVersion: z.string().max(32),
    }),
  }),
  /** Replaces the subscription set — high-volume events flow only for these. */
  z.object({ type: z.literal("subscribe"), sessionIds: z.array(z.string()).max(32) }),
  z.object({
    type: z.literal("invoke"),
    id: z.string().max(64),
    channel: z.string().max(64),
    payload: z.unknown(),
  }),
  z.object({ type: z.literal("ping") }),
]);
export type RemoteClientMessage = z.infer<typeof RemoteClientMessageSchema>;

export const RemoteServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello-ok"),
    protocolVersion: z.number().int(),
    serverVersion: z.string(),
    computerId: z.string(),
    name: z.string(),
    deviceId: z.string(),
    /**
     * The bridge's current public address. Quick-tunnel URLs change whenever
     * the desktop restarts, so every connected phone refreshes its stored
     * copy from here rather than going stale and needing a re-scan.
     */
    publicUrl: z.string().optional(),
    /** The session the desktop window is on, so the phone can land there. */
    attached: z.object({
      sessionId: z.string().nullable(),
      cwd: z.string().nullable(),
      running: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal("result"),
    id: z.string(),
    ok: z.boolean(),
    payload: z.unknown(),
    error: z.string().optional(),
  }),
  /** One frame per AgentHost flush batch, filtered to subscribed sessions. */
  z.object({ type: z.literal("events"), envelopes: z.array(AgentEventEnvelopeSchema) }),
  /** A REMOTE_ALERT_EVENT_TYPES event from an unsubscribed session. */
  z.object({ type: z.literal("alert"), envelope: AgentEventEnvelopeSchema }),
  z.object({ type: z.literal("usage-warning"), warning: UsageWarningSchema }),
  z.object({ type: z.literal("pong") }),
]);
export type RemoteServerMessage = z.infer<typeof RemoteServerMessageSchema>;

/** WS close codes past the handshake. Bad tokens are rejected pre-upgrade with HTTP 401. */
export const REMOTE_CLOSE_CODES = {
  /** hello carried an incompatible protocolVersion. */
  protocolMismatch: 4002,
  /** Device was revoked while connected. */
  revoked: 4001,
  /** Client never sent hello in time. */
  helloTimeout: 4008,
} as const;

/**
 * Contents of the pairing QR shown by the desktop Settings → Remote tab —
 * also accepted as pasted JSON by the app's manual pairing flow, which is
 * how provisioned payloads (with `token`) are delivered to a phone that
 * isn't in front of the desktop.
 */
export const QrPayloadSchema = z.object({
  v: z.literal(1),
  app: z.literal("whalex"),
  computerId: z.string(),
  /** Human-readable machine name for the phone's computer list. */
  name: z.string(),
  /** Every LAN address the bridge listens on; the phone tries them in order. */
  addrs: z.array(z.object({ ip: z.string(), port: z.number().int() })),
  /**
   * Public https base the bridge is reachable at through a reverse proxy /
   * tunnel with a real certificate (e.g. "https://example.com/whalex").
   * The app prefers this over LAN addrs: wss://…/ws from anywhere.
   */
  url: z.string().optional(),
  /** Single-use pairing secret, valid for the open pairing window only. */
  secret: z.string(),
  /**
   * Provisioned pairing: a device token minted on the desktop side ahead of
   * time. When present the app stores it directly and never calls /pair —
   * `secret` is ignored.
   */
  token: z.string().optional(),
  /** SHA-256 hex of the bridge's self-signed TLS cert — the phone pins this. */
  fp: z.string(),
  /** Bridge is in plaintext dev mode — connect with ws:// and skip pinning. */
  insecure: z.boolean().optional(),
  /**
   * Tunnel mode: `addrs` carry no session traffic — the bridge answers only
   * GET /info there. They exist so a phone back on the home network can look
   * up the current tunnel address after the desktop restarted and its
   * quick-tunnel URL changed.
   */
  lanInfoOnly: z.boolean().optional(),
});
export type QrPayload = z.infer<typeof QrPayloadSchema>;

/** POST /pair body and response (over the pinned TLS listener). */
export const PairRequestSchema = z.object({
  secret: z.string().max(128),
  deviceName: z.string().min(1).max(64),
});
export type PairRequest = z.infer<typeof PairRequestSchema>;

export const PairResponseSchema = z.object({
  deviceId: z.string(),
  /** The long-lived bearer token; stored in the phone's keystore, never on disk here. */
  deviceToken: z.string(),
  computerId: z.string(),
  name: z.string(),
});
export type PairResponse = z.infer<typeof PairResponseSchema>;

/**
 * UDP discovery: the phone broadcasts `WHALEX_DISCOVER v1 <nonce>` on the
 * bridge port; the desktop answers with DiscoveryReply. Carries no secrets —
 * the phone still verifies its *pinned* fingerprint before trusting anything.
 */
export const DISCOVERY_MAGIC = "WHALEX_DISCOVER v1";

export const DiscoveryReplySchema = z.object({
  app: z.literal("whalex"),
  nonce: z.string(),
  port: z.number().int(),
  name: z.string(),
  computerId: z.string(),
  fp: z.string(),
});
export type DiscoveryReply = z.infer<typeof DiscoveryReplySchema>;
