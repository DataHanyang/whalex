import {
  REMOTE_PROTOCOL_VERSION,
  RemoteServerMessageSchema,
  type AgentEventEnvelope,
  type IpcRequest,
  type IpcResponse,
  type RemoteChannel,
  type RemoteClientMessage,
  type RemoteServerMessage,
  type UsageWarning,
} from "@whalex/shared";

/**
 * The W3C WebSocket surface both React Native's WebSocket and Node's `ws`
 * expose. The factory bakes in URL, the Authorization header, and TLS
 * pinning — platform concerns the client never sees.
 */
export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export type HelloOk = Extract<RemoteServerMessage, { type: "hello-ok" }>;

export interface RemoteClientOptions {
  createSocket(): WebSocketLike;
  client: { name: string; platform: string; appVersion: string };
  /** Envelopes for sessions passed to subscribe(). */
  onEvent(env: AgentEventEnvelope): void;
  /** Low-frequency events from unsubscribed sessions (badges, notifications). */
  onAlert?(env: AgentEventEnvelope): void;
  onUsageWarning?(warning: UsageWarning): void;
  /** The socket died (after a successful connect) — caller decides on backoff. */
  onClose?(ev: { code: number; reason: string }): void;
  /** App-level ping cadence; 0 disables. Detects half-open mobile sockets. */
  pingIntervalMs?: number;
  /** Overridable for tests. */
  protocolVersion?: number;
  /** hello / invoke round-trip timeout. */
  timeoutMs?: number;
}

interface PendingInvoke {
  resolve(value: unknown): void;
  reject(err: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * One live connection to a desktop's remote bridge: hello handshake, invoke
 * round-trips with correlation ids, event/alert dispatch, and an app-level
 * ping. Reconnect policy (backoff, address rotation, snapshot catch-up)
 * belongs to the caller — this class is deliberately single-shot.
 */
export class RemoteClient {
  private ws: WebSocketLike | null = null;
  private pending = new Map<string, PendingInvoke>();
  private nextId = 1;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(private opts: RemoteClientOptions) {}

  /** Opens the socket and completes the hello handshake. */
  connect(): Promise<HelloOk> {
    const timeoutMs = this.opts.timeoutMs ?? 10_000;
    return new Promise<HelloOk>((resolve, reject) => {
      let settled = false;
      const fail = (err: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.dispose();
        reject(err);
      };
      const timer = setTimeout(() => fail(new Error("connect timeout")), timeoutMs);
      let ws: WebSocketLike;
      try {
        ws = this.opts.createSocket();
      } catch (err) {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      this.ws = ws;
      ws.onopen = () => {
        this.sendMsg({
          type: "hello",
          protocolVersion: this.opts.protocolVersion ?? REMOTE_PROTOCOL_VERSION,
          client: this.opts.client,
        });
      };
      ws.onmessage = (ev) => {
        const msg = this.parse(ev.data);
        if (!msg) return;
        if (!settled) {
          if (msg.type === "hello-ok") {
            settled = true;
            clearTimeout(timer);
            this.startPing();
            resolve(msg);
          }
          return;
        }
        this.dispatch(msg);
      };
      ws.onerror = () => {
        // onclose carries the useful code; onerror alone means handshake death.
        if (!settled) fail(new Error("socket error"));
      };
      ws.onclose = (ev) => {
        if (!settled) {
          fail(new Error(`closed during handshake: ${ev.code} ${ev.reason}`.trim()));
          return;
        }
        this.teardown(new Error(`connection closed: ${ev.code}`));
        this.opts.onClose?.(ev);
      };
    });
  }

  invoke<C extends RemoteChannel>(channel: C, req: IpcRequest<C>): Promise<IpcResponse<C>> {
    const ws = this.ws;
    if (!ws || this.closed) return Promise.reject(new Error("not connected"));
    const id = String(this.nextId++);
    return new Promise<IpcResponse<C>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`invoke timeout: ${channel}`));
      }, this.opts.timeoutMs ?? 30_000);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.sendMsg({ type: "invoke", id, channel, payload: req ?? {} });
    });
  }

  /** Replaces the high-volume subscription set. */
  subscribe(sessionIds: string[]): void {
    this.sendMsg({ type: "subscribe", sessionIds });
  }

  close(): void {
    this.closed = true;
    this.dispose();
  }

  private dispatch(msg: RemoteServerMessage): void {
    switch (msg.type) {
      case "result": {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.ok) p.resolve(msg.payload);
        else p.reject(new Error(msg.error ?? "invoke failed"));
        return;
      }
      case "events":
        for (const env of msg.envelopes) this.opts.onEvent(env);
        return;
      case "alert":
        this.opts.onAlert?.(msg.envelope);
        return;
      case "usage-warning":
        this.opts.onUsageWarning?.(msg.warning);
        return;
      case "pong":
      case "hello-ok":
        return;
    }
  }

  private parse(data: unknown): RemoteServerMessage | null {
    try {
      // Never trust a half-upgraded desktop: unparseable frames are dropped.
      return RemoteServerMessageSchema.parse(JSON.parse(String(data)));
    } catch {
      return null;
    }
  }

  private sendMsg(msg: RemoteClientMessage): void {
    try {
      this.ws?.send(JSON.stringify(msg));
    } catch {
      // a dead socket surfaces through onclose; nothing to do here
    }
  }

  private startPing(): void {
    const interval = this.opts.pingIntervalMs ?? 15_000;
    if (interval <= 0) return;
    this.pingTimer = setInterval(() => this.sendMsg({ type: "ping" }), interval);
  }

  private teardown(err: Error): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
    this.ws = null;
  }

  private dispose(): void {
    const ws = this.ws;
    this.teardown(new Error("client closed"));
    try {
      ws?.close();
    } catch {
      // already dead
    }
  }
}
