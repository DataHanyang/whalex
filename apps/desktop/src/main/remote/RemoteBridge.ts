import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import selfsigned from "selfsigned";
import { whalexHome } from "@whalex/core";
import {
  IPC_INVOKE,
  PairRequestSchema,
  QrPayloadSchema,
  REMOTE_ALERT_EVENT_TYPES,
  REMOTE_CLOSE_CODES,
  REMOTE_PROTOCOL_VERSION,
  RemoteClientMessageSchema,
  isRemoteChannel,
  type AgentEventEnvelope,
  type PairResponse,
  type RemoteServerMessage,
  type RemoteStatus,
  type UsageWarning,
} from "@whalex/shared";
import type { Handlers } from "../ipc.js";
import type { SettingsManager } from "../settings.js";
import { PairingManager } from "./PairingManager.js";
import { DiscoveryResponder } from "./discovery.js";

/** Structural slices of Electron types so this file (and its tests) never load Electron. */
interface VaultLike {
  get(ref: string): string | null;
  set(ref: string, value: string): void;
}
interface WindowLike {
  isDestroyed(): boolean;
  webContents: { send(channel: string, payload: unknown): void };
}

interface ConnState {
  deviceId: string;
  deviceName: string;
  ip: string;
  since: number;
  helloDone: boolean;
  subscriptions: Set<string>;
  alive: boolean;
}

const TLS_KEY_REF = "remote-bridge-tls-key";
const HELLO_TIMEOUT_MS = 10_000;
const KEEPALIVE_MS = 30_000;
const MAX_HTTP_BODY = 4096;

const ALERT_TYPES: readonly string[] = REMOTE_ALERT_EVENT_TYPES;

/**
 * The mobile remote-control server: one HTTPS+WSS listener in the main
 * process, active only while settings.remoteBridge.enabled. Speaks the
 * @whalex/shared remote protocol; invokes are dispatched into the same
 * handler table the renderer's IPC uses, behind the REMOTE_CHANNELS
 * whitelist, so behavior and validation can't drift between surfaces.
 */
export class RemoteBridge {
  private server: https.Server | http.Server | null = null;
  private insecureActive = false;
  private wss: WebSocketServer | null = null;
  private conns = new Map<WebSocket, ConnState>();
  private keepalive: NodeJS.Timeout | null = null;
  private discovery: DiscoveryResponder | null = null;
  private handlers: Handlers | null = null;
  private port = 0;
  private fingerprint = "";
  readonly pairing: PairingManager;
  private log: (msg: string) => void;

  constructor(
    private deps: {
      settings: SettingsManager;
      vault: VaultLike;
      getWindow: () => WindowLike | null;
      version: string;
      log?: (msg: string) => void;
      /** Where remote-cert.pem lives; defaults to ~/.whalex (tests inject a temp dir). */
      certDir?: string;
    },
  ) {
    this.pairing = new PairingManager(deps.settings);
    this.log = deps.log ?? (() => {});
  }

  /** Wired after construction — the handler table needs the bridge in its deps. */
  setHandlers(handlers: Handlers): void {
    this.handlers = handlers;
  }

  computerId(): string {
    const bridge = this.deps.settings.get().remoteBridge;
    if (bridge.computerId) return bridge.computerId;
    const id = randomUUID();
    this.deps.settings.update({ remoteBridge: { ...bridge, computerId: id } });
    return id;
  }

  machineName(): string {
    return os.hostname();
  }

  /** Reconcile the server with settings; called at boot and on settings:update. */
  applySettings(): void {
    const cfg = this.deps.settings.get().remoteBridge;
    if (!cfg.enabled) {
      const wasRunning = this.isRunning();
      this.stop();
      if (wasRunning) this.emitStatus();
      return;
    }
    if (this.server && this.port === cfg.port && this.insecureActive === cfg.insecure) {
      // Port/transport unchanged — only the discovery toggle may need reconciling.
      if (cfg.discovery && !this.discovery) this.startDiscovery();
      if (!cfg.discovery && this.discovery) {
        this.discovery.stop();
        this.discovery = null;
      }
      return;
    }
    this.stop();
    this.start(cfg.port, cfg.discovery, cfg.insecure);
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  private start(port: number, discovery: boolean, insecure = false): void {
    this.port = port;
    this.insecureActive = insecure;
    let server: https.Server | http.Server;
    if (insecure) {
      // DEV ONLY plaintext mode — the phone's TLS pinning work isn't on
      // devices yet. The QR carries insecure:true and no fingerprint.
      this.fingerprint = "";
      server = http.createServer((req, res) => {
        void this.handleHttp(req, res);
      });
      this.log("remote bridge starting in INSECURE (plaintext) dev mode");
    } else {
      const { key, cert } = this.ensureCert();
      server = https.createServer({ key, cert }, (req, res) => {
        void this.handleHttp(req, res);
      });
    }
    this.wss = new WebSocketServer({ noServer: true });
    server.on("upgrade", (req, socket, head) => this.handleUpgrade(req, socket, head));
    server.on("error", (err) => {
      this.log(`remote bridge server error: ${String(err)}`);
      this.stop();
      this.emitStatus();
    });
    server.listen(port, () => {
      this.log(`remote bridge listening on :${port}`);
      this.emitStatus();
    });
    this.server = server;
    this.keepalive = setInterval(() => this.reapDead(), KEEPALIVE_MS);
    if (discovery) this.startDiscovery();
  }

  stop(): void {
    if (this.keepalive) {
      clearInterval(this.keepalive);
      this.keepalive = null;
    }
    this.discovery?.stop();
    this.discovery = null;
    for (const ws of this.conns.keys()) ws.terminate();
    this.conns.clear();
    this.wss?.close();
    this.wss = null;
    this.server?.close();
    this.server = null;
    this.port = 0;
  }

  private startDiscovery(): void {
    this.discovery = new DiscoveryResponder(() => ({
      port: this.port,
      name: this.machineName(),
      computerId: this.computerId(),
      fp: this.fingerprint,
    }));
    this.discovery.start(this.port, this.log);
  }

  // ---- pairing UI surface (invoked from the renderer via remote:* channels) ----

  startPairing(): { qrPayload: string; expiresAt: number } {
    if (!this.server) throw new Error("Remote bridge is not running — enable it first.");
    const { secret, expiresAt } = this.pairing.open();
    const payload = QrPayloadSchema.parse({
      v: 1,
      app: "whalex",
      computerId: this.computerId(),
      name: this.machineName(),
      addrs: this.lanAddresses().map((ip) => ({ ip, port: this.port })),
      ...(this.deps.settings.get().remoteBridge.publicUrl
        ? { url: this.deps.settings.get().remoteBridge.publicUrl }
        : {}),
      secret,
      fp: this.fingerprint,
      ...(this.insecureActive ? { insecure: true } : {}),
    });
    return { qrPayload: JSON.stringify(payload), expiresAt };
  }

  cancelPairing(): void {
    this.pairing.cancel();
  }

  revokeDevice(id: string): void {
    this.pairing.revoke(id);
    for (const [ws, st] of this.conns) {
      if (st.deviceId === id) ws.close(REMOTE_CLOSE_CODES.revoked, "device revoked");
    }
    this.emitStatus();
  }

  status(): RemoteStatus {
    const cfg = this.deps.settings.get().remoteBridge;
    return {
      enabled: cfg.enabled,
      running: this.isRunning(),
      port: cfg.port,
      addresses: this.isRunning() ? this.lanAddresses() : [],
      devices: cfg.devices,
      connected: [...this.conns.values()]
        .filter((c) => c.helloDone)
        .map((c) => ({ deviceId: c.deviceId, name: c.deviceName, ip: c.ip, since: c.since })),
    };
  }

  // ---- event fan-out (registered as an AgentHost envelope sink) ----

  broadcast(batch: AgentEventEnvelope[]): void {
    if (this.conns.size === 0) return;
    for (const [ws, st] of this.conns) {
      if (!st.helloDone) continue;
      const subscribed = batch.filter((env) => st.subscriptions.has(env.sessionId));
      if (subscribed.length > 0) this.send(ws, { type: "events", envelopes: subscribed });
      for (const env of batch) {
        if (st.subscriptions.has(env.sessionId)) continue;
        if (ALERT_TYPES.includes(env.event.type)) this.send(ws, { type: "alert", envelope: env });
      }
    }
  }

  broadcastUsageWarning(warning: UsageWarning): void {
    for (const [ws, st] of this.conns) {
      if (st.helloDone) this.send(ws, { type: "usage-warning", warning });
    }
  }

  // ---- HTTP: pairing + probe ----

  private async handleHttp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const respond = (code: number, body: unknown): void => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === "GET" && req.url === "/info") {
        respond(200, {
          app: "whalex",
          version: this.deps.version,
          protocolVersion: REMOTE_PROTOCOL_VERSION,
          computerId: this.computerId(),
          name: this.machineName(),
        });
        return;
      }
      if (req.method === "POST" && req.url === "/pair") {
        // 404 (not 403) while no window is open: the endpoint's existence
        // shouldn't advertise that pairing is a thing to random LAN scanners.
        if (!this.pairing.isOpen()) {
          respond(404, { error: "not found" });
          return;
        }
        const raw = await readBody(req, MAX_HTTP_BODY);
        const body = PairRequestSchema.parse(JSON.parse(raw));
        const ip = req.socket.remoteAddress ?? "";
        const result = this.pairing.redeem(body.secret, body.deviceName, ip);
        if ("error" in result) {
          respond(403, { error: result.error });
          return;
        }
        const out: PairResponse = {
          deviceId: result.deviceId,
          deviceToken: result.deviceToken,
          computerId: this.computerId(),
          name: this.machineName(),
        };
        this.log(`remote device paired: ${body.deviceName} (${ip})`);
        this.emitStatus();
        respond(200, out);
        return;
      }
      respond(404, { error: "not found" });
    } catch (err) {
      respond(400, { error: err instanceof Error ? err.message : "bad request" });
    }
  }

  // ---- WS lifecycle ----

  private handleUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): void {
    // Browsers always send Origin; native clients don't. Rejecting it kills
    // any browser-page CSRF against the local port.
    if (req.headers.origin !== undefined || req.url !== "/ws") {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const device = token ? this.pairing.verifyToken(token) : null;
    if (!device) {
      // Pre-upgrade 401 — the client reads this as "token revoked, re-pair".
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    this.wss?.handleUpgrade(req, socket, head, (ws) => {
      const ip = req.socket.remoteAddress ?? "";
      const st: ConnState = {
        deviceId: device.id,
        deviceName: device.name,
        ip,
        since: Date.now(),
        helloDone: false,
        subscriptions: new Set(),
        alive: true,
      };
      this.conns.set(ws, st);
      this.pairing.touch(device.id, ip);
      const helloTimer = setTimeout(() => {
        if (!st.helloDone) ws.close(REMOTE_CLOSE_CODES.helloTimeout, "hello timeout");
      }, HELLO_TIMEOUT_MS);
      ws.on("pong", () => {
        st.alive = true;
      });
      ws.on("message", (data) => {
        void this.handleMessage(ws, st, data);
      });
      ws.on("close", () => {
        clearTimeout(helloTimer);
        this.conns.delete(ws);
        this.emitStatus();
      });
      ws.on("error", () => ws.terminate());
    });
  }

  private async handleMessage(ws: WebSocket, st: ConnState, data: unknown): Promise<void> {
    let msg: import("@whalex/shared").RemoteClientMessage;
    try {
      msg = RemoteClientMessageSchema.parse(JSON.parse(String(data)));
    } catch {
      return; // unparseable frames are dropped, not fatal — versions may skew
    }
    switch (msg.type) {
      case "hello": {
        if (msg.protocolVersion !== REMOTE_PROTOCOL_VERSION) {
          ws.close(REMOTE_CLOSE_CODES.protocolMismatch, `protocol v${REMOTE_PROTOCOL_VERSION}`);
          return;
        }
        st.helloDone = true;
        st.deviceName = msg.client.name || st.deviceName;
        const attached = this.handlers
          ? await Promise.resolve(this.handlers["session:attached"](undefined))
          : { sessionId: null, cwd: null, running: false };
        this.send(ws, {
          type: "hello-ok",
          protocolVersion: REMOTE_PROTOCOL_VERSION,
          serverVersion: this.deps.version,
          computerId: this.computerId(),
          name: this.machineName(),
          deviceId: st.deviceId,
          attached,
        });
        this.emitStatus();
        return;
      }
      case "subscribe": {
        if (!st.helloDone) return;
        st.subscriptions = new Set(msg.sessionIds);
        return;
      }
      case "ping": {
        this.send(ws, { type: "pong" });
        return;
      }
      case "invoke": {
        if (!st.helloDone) return;
        await this.handleInvoke(ws, msg.id, msg.channel, msg.payload);
        return;
      }
    }
  }

  private async handleInvoke(
    ws: WebSocket,
    id: string,
    channel: string,
    payload: unknown,
  ): Promise<void> {
    const fail = (error: string): void => {
      this.send(ws, { type: "result", id, ok: false, payload: undefined, error });
    };
    if (!this.handlers) {
      fail("bridge not ready");
      return;
    }
    if (!isRemoteChannel(channel)) {
      fail(`channel not allowed: ${channel}`);
      return;
    }
    try {
      let req = IPC_INVOKE[channel].req.parse(payload) as unknown;
      // A phone attaching must never steal the desktop window's session.
      if (channel === "session:start") req = { ...(req as object), observe: true };
      const res = await Promise.resolve(
        (this.handlers[channel] as (r: unknown) => unknown)(req),
      );
      this.send(ws, { type: "result", id, ok: true, payload: res ?? undefined });
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  }

  private send(ws: WebSocket, msg: RemoteServerMessage): void {
    if (ws.readyState !== ws.OPEN) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // dead socket — the keepalive reaper will collect it
    }
  }

  private reapDead(): void {
    for (const [ws, st] of this.conns) {
      if (!st.alive) {
        ws.terminate();
        this.conns.delete(ws);
        continue;
      }
      st.alive = false;
      try {
        ws.ping();
      } catch {
        ws.terminate();
        this.conns.delete(ws);
      }
    }
  }

  private emitStatus(): void {
    const win = this.deps.getWindow();
    if (win && !win.isDestroyed()) win.webContents.send("remote:status", this.status());
  }

  // ---- TLS material ----

  /**
   * One long-lived self-signed cert per machine: the private key sits in the
   * OS-encrypted vault, the public PEM on disk, and the QR pins the SHA-256
   * fingerprint so the phone accepts exactly this cert and nothing else.
   */
  private ensureCert(): { key: string; cert: string } {
    const certFile = path.join(this.deps.certDir ?? whalexHome(), "remote-cert.pem");
    let key = this.deps.vault.get(TLS_KEY_REF);
    let cert: string | null = null;
    try {
      cert = fs.readFileSync(certFile, "utf8");
    } catch {
      // stays null — minted below
    }
    if (!key || !cert) {
      const pems = selfsigned.generate([{ name: "commonName", value: "whalex" }], {
        days: 3650,
        keySize: 2048,
      });
      key = pems.private;
      cert = pems.cert;
      this.deps.vault.set(TLS_KEY_REF, key);
      fs.mkdirSync(path.dirname(certFile), { recursive: true });
      fs.writeFileSync(certFile, cert, "utf8");
      this.log("remote bridge minted a new TLS certificate");
    }
    this.fingerprint = certFingerprint(cert);
    return { key, cert };
  }

  private lanAddresses(): string[] {
    const out: string[] = [];
    for (const ifaces of Object.values(os.networkInterfaces())) {
      for (const iface of ifaces ?? []) {
        if (iface.family === "IPv4" && !iface.internal) out.push(iface.address);
      }
    }
    return out;
  }
}

/** SHA-256 hex over the certificate's DER bytes — what the phone pins. */
export function certFingerprint(pem: string): string {
  const der = Buffer.from(
    pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, ""),
    "base64",
  );
  return createHash("sha256").update(der).digest("hex");
}

function readBody(req: http.IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
