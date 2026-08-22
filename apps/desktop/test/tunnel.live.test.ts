import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "@whalex/shared";
import { RemoteBridge } from "../src/main/remote/RemoteBridge.js";
import type { SettingsManager } from "../src/main/settings.js";
import type { Handlers } from "../src/main/ipc.js";

/**
 * End-to-end proof that the zero-config path works: a real Cloudflare quick
 * tunnel in front of the loopback bridge, reached back over the public
 * internet. Opt-in (WHALEX_LIVE_TUNNEL=1) because it needs the network, the
 * cloudflared binary, and ~30s — none of which belong in the default suite.
 *
 *   WHALEX_LIVE_TUNNEL=1 WHALEX_CLOUDFLARED=<path> pnpm vitest run test/tunnel.live.test.ts
 */
const live = process.env.WHALEX_LIVE_TUNNEL === "1";

function makeSettings(port: number): SettingsManager {
  let s: Settings = structuredClone(DEFAULT_SETTINGS);
  s = {
    ...s,
    // Enabling mobile access is the whole configuration — the tunnel follows.
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

const handlers = new Proxy({} as Handlers, {
  get: (_t, channel: string) => {
    if (channel === "session:attached")
      return () => ({ sessionId: null, cwd: null, running: false });
    throw new Error(`unexpected handler: ${channel}`);
  },
});

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn();
});

describe.runIf(live)("live quick tunnel", () => {
  it("comes up and serves /info over the public internet", async () => {
    const port = 49500 + Math.floor(Math.random() * 400);
    const certDir = fs.mkdtempSync(path.join(os.tmpdir(), "whalex-live-"));
    const store = new Map<string, string>();
    const bridge = new RemoteBridge({
      settings: makeSettings(port),
      vault: { get: (r) => store.get(r) ?? null, set: (r, v) => void store.set(r, v) },
      getWindow: () => null,
      version: "0.0.0-test",
      certDir,
      bundledCloudflared: () => process.env.WHALEX_CLOUDFLARED ?? null,
      log: (m) => console.log(`[bridge] ${m}`),
    });
    bridge.setHandlers(handlers);
    cleanup.push(() => {
      bridge.stop();
      fs.rmSync(certDir, { recursive: true, force: true });
    });
    bridge.applySettings();

    // Quick tunnels usually register within ~10s; allow generous headroom.
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline && bridge.status().tunnel.state !== "up") {
      await new Promise((r) => setTimeout(r, 1000));
    }
    const state = bridge.status().tunnel;
    expect(state.state, `tunnel never came up: ${JSON.stringify(state)}`).toBe("up");

    const url = bridge.publicUrl();
    expect(url).toMatch(/^https:\/\/.+\.trycloudflare\.com$/);
    console.log(`[tunnel] ${url}`);

    // Cloudflare needs a moment to propagate a freshly registered hostname.
    let body: unknown = null;
    let lastError = "never attempted";
    for (let i = 0; i < 20 && body === null; i++) {
      try {
        const res = await fetch(`${url}/info`);
        if (res.ok) {
          body = await res.json();
          break;
        }
        lastError = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
      } catch (err) {
        lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      }
      console.log(`[probe ${i}] ${lastError}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
    expect(body, `public fetch never succeeded — last: ${lastError}`).not.toBeNull();
    expect(body).toMatchObject({ app: "whalex" });
    // The bridge tells phones its own address, so they can refresh a stale one.
    expect((body as { publicUrl?: string }).publicUrl).toBe(url);
  }, 180_000);
});
