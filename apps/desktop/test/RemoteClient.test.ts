import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { DEFAULT_SETTINGS, type AgentEventEnvelope, type QrPayload, type Settings } from "@whalex/shared";
import { RemoteClient, type WebSocketLike } from "@whalex/client-core";
import { RemoteBridge } from "../src/main/remote/RemoteBridge.js";
import type { SettingsManager } from "../src/main/settings.js";
import type { Handlers } from "../src/main/ipc.js";

// End-to-end: the same RemoteClient the mobile app ships, against the real
// bridge, over real TLS websockets. Only the socket factory is Node-specific.

function makeSettings(port: number): SettingsManager {
  let s: Settings = structuredClone(DEFAULT_SETTINGS);
  s = { ...s, remoteBridge: { ...s.remoteBridge, enabled: true, port, discovery: false } };
  return {
    get: () => s,
    update: (partial: Partial<Settings>) => {
      s = { ...s, ...partial };
      return s;
    },
  } as unknown as SettingsManager;
}

const handlers = new Proxy({} as Handlers, {
  get: (_t, channel: string) => {
    if (channel === "session:attached") return () => ({ sessionId: "sA", cwd: "C:/p", running: true });
    if (channel === "session:list") return () => [{ sessionId: "sA", cwd: "C:/p", updatedAt: 1 }];
    throw new Error(`unexpected handler: ${channel}`);
  },
});

let nextPort = 47000 + Math.floor(Math.random() * 3000);
const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn();
});

async function bridgeAndToken(): Promise<{ bridge: RemoteBridge; port: number; token: string }> {
  const port = nextPort++;
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), "whalex-rc-"));
  const vaultStore = new Map<string, string>();
  const bridge = new RemoteBridge({
    settings: makeSettings(port),
    vault: { get: (r) => vaultStore.get(r) ?? null, set: (r, v) => void vaultStore.set(r, v) },
    // Client↔bridge over the real TLS listener; no tunnel, no network.
    tunnel: false,
    getWindow: () => null,
    version: "0.0.0-test",
    certDir,
  });
  bridge.setHandlers(handlers);
  bridge.applySettings();
  cleanup.push(() => {
    bridge.stop();
    fs.rmSync(certDir, { recursive: true, force: true });
  });
  const { qrPayload } = bridge.startPairing();
  const qr = JSON.parse(qrPayload) as QrPayload;
  const token = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      { host: "127.0.0.1", port, method: "POST", path: "/pair", rejectUnauthorized: false },
      (res) => {
        let data = "";
        res.on("data", (c: Buffer) => (data += c.toString()));
        res.on("end", () => resolve((JSON.parse(data) as { deviceToken: string }).deviceToken));
      },
    );
    req.on("error", reject);
    req.end(JSON.stringify({ secret: qr.secret, deviceName: "E2EPhone" }));
  });
  return { bridge, port, token };
}

/** What the mobile app's factory does with RN's WebSocket, done with ws here. */
function nodeSocketFactory(port: number, token: string): () => WebSocketLike {
  return () =>
    new WebSocket(`wss://127.0.0.1:${port}/ws`, {
      rejectUnauthorized: false,
      headers: { authorization: `Bearer ${token}` },
    }) as unknown as WebSocketLike;
}

describe("RemoteClient ⇄ RemoteBridge", () => {
  it("connects, invokes, subscribes, and receives events and alerts", async () => {
    const { bridge, port, token } = await bridgeAndToken();
    const events: AgentEventEnvelope[] = [];
    const alerts: AgentEventEnvelope[] = [];
    const client = new RemoteClient({
      createSocket: nodeSocketFactory(port, token),
      client: { name: "E2EPhone", platform: "test", appVersion: "0" },
      onEvent: (env) => events.push(env),
      onAlert: (env) => alerts.push(env),
      pingIntervalMs: 0,
    });
    cleanup.push(() => client.close());

    const hello = await client.connect();
    expect(hello.attached).toMatchObject({ sessionId: "sA", running: true });
    expect(hello.computerId).toBeTruthy();

    const sessions = await client.invoke("session:list", {});
    expect(sessions).toHaveLength(1);

    client.subscribe(["sA"]);
    await new Promise((r) => setTimeout(r, 100));
    bridge.broadcast([
      { sessionId: "sA", seq: 1, event: { type: "text-delta", messageId: "m", delta: "hi" } },
      { sessionId: "sB", seq: 9, event: { type: "done", stopReason: "stop" } },
    ] as AgentEventEnvelope[]);
    await new Promise((r) => setTimeout(r, 200));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ sessionId: "sA", seq: 1 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ sessionId: "sB", seq: 9 });
  });

  it("rejects invokes for non-whitelisted channels with the server's error", async () => {
    const { port, token } = await bridgeAndToken();
    const client = new RemoteClient({
      createSocket: nodeSocketFactory(port, token),
      client: { name: "E2EPhone", platform: "test", appVersion: "0" },
      onEvent: () => {},
      pingIntervalMs: 0,
    });
    cleanup.push(() => client.close());
    await client.connect();
    await expect(
      client.invoke("secrets:reveal" as never, { ref: "k" } as never),
    ).rejects.toThrow(/not allowed/);
  });

  it("fails pending invokes and reports onClose when the server goes away", async () => {
    const { bridge, port, token } = await bridgeAndToken();
    let closedCode = 0;
    const client = new RemoteClient({
      createSocket: nodeSocketFactory(port, token),
      client: { name: "E2EPhone", platform: "test", appVersion: "0" },
      onEvent: () => {},
      onClose: (ev) => {
        closedCode = ev.code;
      },
      pingIntervalMs: 0,
    });
    cleanup.push(() => client.close());
    await client.connect();
    const deviceId = bridge.status().connected[0]!.deviceId;
    bridge.revokeDevice(deviceId);
    await new Promise((r) => setTimeout(r, 300));
    expect(closedCode).toBe(4001);
    await expect(client.invoke("session:list", {})).rejects.toThrow();
  });

  it("a stale token is refused at the handshake", async () => {
    const { bridge, port, token } = await bridgeAndToken();
    bridge.revokeDevice(bridge.status().devices[0]!.id);
    const client = new RemoteClient({
      createSocket: nodeSocketFactory(port, token),
      client: { name: "E2EPhone", platform: "test", appVersion: "0" },
      onEvent: () => {},
      pingIntervalMs: 0,
      timeoutMs: 3000,
    });
    cleanup.push(() => client.close());
    await expect(client.connect()).rejects.toThrow();
  });
});
