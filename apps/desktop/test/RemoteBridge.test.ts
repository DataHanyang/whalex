import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import {
  DEFAULT_SETTINGS,
  REMOTE_PROTOCOL_VERSION,
  RemoteServerMessageSchema,
  type AgentEventEnvelope,
  type QrPayload,
  type RemoteServerMessage,
  type Settings,
} from "@whalex/shared";
import { RemoteBridge, certFingerprint } from "../src/main/remote/RemoteBridge.js";
import type { SettingsManager } from "../src/main/settings.js";
import type { Handlers } from "../src/main/ipc.js";

// ---- stubs: everything in-memory, no Electron, no ~/.whalex ----

function makeSettings(port: number): SettingsManager {
  let s: Settings = structuredClone(DEFAULT_SETTINGS);
  s = {
    ...s,
    remoteBridge: { ...s.remoteBridge, enabled: true, port, discovery: false },
  };
  return {
    get: () => s,
    update: (partial: Partial<Settings>) => {
      s = { ...s, ...partial };
      return s;
    },
  } as unknown as SettingsManager;
}

function makeVault(): { get(ref: string): string | null; set(ref: string, v: string): void } {
  const store = new Map<string, string>();
  return { get: (ref) => store.get(ref) ?? null, set: (ref, v) => void store.set(ref, v) };
}

/** Only the channels the tests exercise; the rest throw loudly if reached. */
function makeHandlers(calls: Array<{ channel: string; req: unknown }>): Handlers {
  const record =
    (channel: string, result: unknown) =>
    (req: unknown): unknown => {
      calls.push({ channel, req });
      return result;
    };
  return new Proxy({} as Handlers, {
    get: (_t, channel: string) => {
      if (channel === "session:attached")
        return record(channel, { sessionId: null, cwd: null, running: false });
      if (channel === "session:list") return record(channel, []);
      if (channel === "session:start")
        return record(channel, { sessionId: "s1", cwd: "/x", transcript: [], seq: 0 });
      if (channel === "secrets:reveal") return record(channel, { value: "LEAK" });
      throw new Error(`unexpected handler access: ${channel}`);
    },
  });
}

let nextPort = 41000 + Math.floor(Math.random() * 5000);
const tmpDirs: string[] = [];
const bridges: RemoteBridge[] = [];

function makeBridge(): { bridge: RemoteBridge; port: number; calls: Array<{ channel: string; req: unknown }> } {
  const port = nextPort++;
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), "whalex-bridge-"));
  tmpDirs.push(certDir);
  const calls: Array<{ channel: string; req: unknown }> = [];
  const bridge = new RemoteBridge({
    settings: makeSettings(port),
    vault: makeVault(),
    getWindow: () => null,
    version: "0.0.0-test",
    certDir,
  });
  bridge.setHandlers(makeHandlers(calls));
  bridge.applySettings();
  bridges.push(bridge);
  return { bridge, port, calls };
}

afterEach(() => {
  for (const b of bridges.splice(0)) b.stop();
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

// ---- fake-phone helpers ----

function httpsJson(
  port: number,
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: "127.0.0.1", port, method, path: urlPath, rejectUnauthorized: false },
      (res) => {
        let data = "";
        res.on("data", (c: Buffer) => (data += c.toString()));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, json: data ? JSON.parse(data) : null }),
        );
      },
    );
    req.on("error", reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

async function pairDevice(bridge: RemoteBridge, port: number): Promise<string> {
  const { qrPayload } = bridge.startPairing();
  const qr = JSON.parse(qrPayload) as QrPayload;
  const res = await httpsJson(port, "POST", "/pair", { secret: qr.secret, deviceName: "TestPhone" });
  expect(res.status).toBe(200);
  return (res.json as { deviceToken: string }).deviceToken;
}

class FakePhone {
  private ws: WebSocket;
  private inbox: RemoteServerMessage[] = [];
  private waiters: Array<() => void> = [];

  constructor(port: number, token: string) {
    this.ws = new WebSocket(`wss://127.0.0.1:${port}/ws`, {
      rejectUnauthorized: false,
      headers: { authorization: `Bearer ${token}` },
    });
    this.ws.on("message", (data) => {
      this.inbox.push(RemoteServerMessageSchema.parse(JSON.parse(String(data))));
      for (const w of this.waiters.splice(0)) w();
    });
  }

  opened(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.on("open", resolve);
      this.ws.on("error", reject);
    });
  }

  closed(): Promise<{ code: number }> {
    return new Promise((resolve) => this.ws.on("close", (code) => resolve({ code })));
  }

  send(msg: unknown): void {
    this.ws.send(JSON.stringify(msg));
  }

  async next<T extends RemoteServerMessage["type"]>(
    type: T,
    timeoutMs = 5000,
  ): Promise<Extract<RemoteServerMessage, { type: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const idx = this.inbox.findIndex((m) => m.type === type);
      if (idx >= 0) {
        return this.inbox.splice(idx, 1)[0] as Extract<RemoteServerMessage, { type: T }>;
      }
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${type}`);
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }

  async hello(): Promise<void> {
    this.send({
      type: "hello",
      protocolVersion: REMOTE_PROTOCOL_VERSION,
      client: { name: "TestPhone", platform: "android", appVersion: "0.0.0" },
    });
    await this.next("hello-ok");
  }

  close(): void {
    this.ws.close();
  }
}

async function connectedPhone(): Promise<{
  bridge: RemoteBridge;
  phone: FakePhone;
  calls: Array<{ channel: string; req: unknown }>;
}> {
  const { bridge, port, calls } = makeBridge();
  const token = await pairDevice(bridge, port);
  const phone = new FakePhone(port, token);
  await phone.opened();
  await phone.hello();
  return { bridge, phone, calls };
}

function envelope(sessionId: string, seq: number, event: object): AgentEventEnvelope {
  return { sessionId, seq, event } as AgentEventEnvelope;
}

// ---- tests ----

describe("RemoteBridge", () => {
  it("serves /info over TLS with a QR-pinnable fingerprint", async () => {
    const { bridge, port } = makeBridge();
    const res = await httpsJson(port, "GET", "/info");
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ app: "whalex", protocolVersion: REMOTE_PROTOCOL_VERSION });
    // The fingerprint in the QR matches the served certificate.
    const { qrPayload } = bridge.startPairing();
    const qr = JSON.parse(qrPayload) as QrPayload;
    const cert = await new Promise<string>((resolve, reject) => {
      const req = https.request(
        { host: "127.0.0.1", port, path: "/info", rejectUnauthorized: false },
        (r) => {
          const socket = r.socket as import("node:tls").TLSSocket;
          resolve(socket.getPeerCertificate().raw.toString("base64"));
          r.resume();
        },
      );
      req.on("error", reject);
      req.end();
    });
    const pem = `-----BEGIN CERTIFICATE-----\n${cert}\n-----END CERTIFICATE-----`;
    expect(certFingerprint(pem)).toBe(qr.fp);
  });

  it("pairing: closed window 404s, secret is single-use, bad secrets close after 5 tries", async () => {
    const { bridge, port } = makeBridge();
    // No window open → the endpoint plays dead.
    let res = await httpsJson(port, "POST", "/pair", { secret: "x", deviceName: "P" });
    expect(res.status).toBe(404);

    const { qrPayload } = bridge.startPairing();
    const qr = JSON.parse(qrPayload) as QrPayload;
    res = await httpsJson(port, "POST", "/pair", { secret: qr.secret, deviceName: "P" });
    expect(res.status).toBe(200);
    expect((res.json as { deviceToken: string }).deviceToken.length).toBeGreaterThan(30);
    // Single-use: the same secret no longer works (window closed on success).
    res = await httpsJson(port, "POST", "/pair", { secret: qr.secret, deviceName: "P" });
    expect(res.status).toBe(404);

    // Brute-force: 5 bad attempts close the window.
    bridge.startPairing();
    for (let i = 0; i < 5; i++) {
      res = await httpsJson(port, "POST", "/pair", { secret: `bad${i}`, deviceName: "P" });
      expect(res.status).toBe(403);
    }
    res = await httpsJson(port, "POST", "/pair", { secret: "bad", deviceName: "P" });
    expect(res.status).toBe(404);
  });

  it("rejects upgrades without a valid token or with an Origin header", async () => {
    const { bridge, port } = makeBridge();
    const token = await pairDevice(bridge, port);

    const tryWs = (opts: WebSocket.ClientOptions): Promise<string> =>
      new Promise((resolve) => {
        const ws = new WebSocket(`wss://127.0.0.1:${port}/ws`, { rejectUnauthorized: false, ...opts });
        ws.on("open", () => resolve("open"));
        ws.on("error", (err) => resolve(err.message));
      });

    expect(await tryWs({})).toContain("401");
    expect(await tryWs({ headers: { authorization: "Bearer wrong-token" } })).toContain("401");
    // Origin means a browser page is trying — always refused, even with a token.
    expect(
      await tryWs({ headers: { authorization: `Bearer ${token}`, origin: "https://evil.example" } }),
    ).toContain("403");
    expect(await tryWs({ headers: { authorization: `Bearer ${token}` } })).toBe("open");
  });

  it("handshakes hello ⇄ hello-ok and answers ping", async () => {
    const { phone } = await connectedPhone();
    phone.send({ type: "ping" });
    await phone.next("pong");
    phone.close();
  });

  it("dispatches whitelisted invokes and refuses everything else", async () => {
    const { phone, calls } = await connectedPhone();

    phone.send({ type: "invoke", id: "1", channel: "session:list", payload: {} });
    const ok = await phone.next("result");
    expect(ok).toMatchObject({ id: "1", ok: true });
    expect(calls.some((c) => c.channel === "session:list")).toBe(true);

    // secrets:reveal exists in IPC_INVOKE but is not remote-whitelisted.
    phone.send({ type: "invoke", id: "2", channel: "secrets:reveal", payload: { ref: "k" } });
    const denied = await phone.next("result");
    expect(denied).toMatchObject({ id: "2", ok: false });
    expect(denied.error).toContain("not allowed");
    expect(calls.some((c) => c.channel === "secrets:reveal")).toBe(false);
    phone.close();
  });

  it("forces observe on session:start so a phone never steals the window's session", async () => {
    const { phone, calls } = await connectedPhone();
    phone.send({ type: "invoke", id: "3", channel: "session:start", payload: { cwd: "C:/p" } });
    await phone.next("result");
    const call = calls.find((c) => c.channel === "session:start");
    expect(call?.req).toMatchObject({ cwd: "C:/p", observe: true });
    phone.close();
  });

  it("fans out subscribed events; unsubscribed sessions surface only alert-tier events", async () => {
    const { bridge, phone } = await connectedPhone();
    phone.send({ type: "subscribe", sessionIds: ["A"] });
    await new Promise((r) => setTimeout(r, 100)); // subscription is fire-and-forget

    bridge.broadcast([
      envelope("A", 1, { type: "text-delta", messageId: "m", delta: "hi" }),
      envelope("B", 1, { type: "text-delta", messageId: "m", delta: "secret stream" }),
      envelope("B", 2, { type: "done", stopReason: "stop" }),
    ]);

    const events = await phone.next("events");
    expect(events.envelopes.map((e) => e.sessionId)).toEqual(["A"]);
    const alert = await phone.next("alert");
    expect(alert.envelope).toMatchObject({ sessionId: "B", seq: 2 });
    // B's text-delta must never arrive in any frame.
    await expect(phone.next("events", 300)).rejects.toThrow();
    phone.close();
  });

  it("revoking a device closes its live connection with the revoked code", async () => {
    const { bridge, phone } = await connectedPhone();
    const deviceId = bridge.status().connected[0]?.deviceId;
    expect(deviceId).toBeTruthy();
    const closedP = phone.closed();
    bridge.revokeDevice(deviceId!);
    const { code } = await closedP;
    expect(code).toBe(4001);
    // Token is gone: a new connection with any token from this device fails at upgrade.
    expect(bridge.status().devices).toHaveLength(0);
  });
});
