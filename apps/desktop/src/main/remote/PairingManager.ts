import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { RemoteDevice } from "@whalex/shared";
import type { SettingsManager } from "../settings.js";

const WINDOW_TTL_MS = 120_000;
const MAX_FAILS = 5;
/** lastSeen writes hit settings.json; keep them to one per device per minute. */
const TOUCH_THROTTLE_MS = 60_000;

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Constant-time compare of two hex digests of equal length. */
function digestsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Pairing window + device-token registry for the remote bridge. Tokens are
 * minted once per pairing and stored only as SHA-256 hashes; the plaintext
 * lives exclusively on the phone.
 */
export class PairingManager {
  private window: { secret: string; expiresAt: number; fails: number } | null = null;
  private lastTouch = new Map<string, number>();

  constructor(private settings: SettingsManager) {}

  /** Opens (or replaces) the single pairing window. */
  open(): { secret: string; expiresAt: number } {
    const secret = randomBytes(16).toString("base64url");
    this.window = { secret, expiresAt: Date.now() + WINDOW_TTL_MS, fails: 0 };
    return { secret, expiresAt: this.window.expiresAt };
  }

  cancel(): void {
    this.window = null;
  }

  isOpen(): boolean {
    return this.window !== null && Date.now() < this.window.expiresAt;
  }

  /**
   * Trade the QR secret for a long-lived device token. Single-use: success
   * closes the window; so do MAX_FAILS bad attempts (someone on the LAN is
   * guessing — make them ask the user to reopen it).
   */
  redeem(
    secret: string,
    deviceName: string,
    remoteIp: string,
  ): { deviceId: string; deviceToken: string } | { error: string } {
    const w = this.window;
    if (!w || Date.now() >= w.expiresAt) {
      this.window = null;
      return { error: "no pairing window open" };
    }
    if (!digestsEqual(sha256Hex(secret), sha256Hex(w.secret))) {
      w.fails += 1;
      if (w.fails >= MAX_FAILS) this.window = null;
      return { error: "invalid pairing secret" };
    }
    this.window = null;
    const deviceToken = randomBytes(32).toString("base64url");
    const device: RemoteDevice = {
      id: randomUUID(),
      name: deviceName,
      tokenHash: sha256Hex(deviceToken),
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      lastIp: remoteIp,
    };
    const bridge = this.settings.get().remoteBridge;
    this.settings.update({ remoteBridge: { ...bridge, devices: [...bridge.devices, device] } });
    return { deviceId: device.id, deviceToken };
  }

  /** Bearer-token check on WS upgrade; null means reject with 401. */
  verifyToken(token: string): RemoteDevice | null {
    const hash = sha256Hex(token);
    for (const device of this.settings.get().remoteBridge.devices) {
      if (digestsEqual(hash, device.tokenHash)) return device;
    }
    return null;
  }

  revoke(deviceId: string): void {
    const bridge = this.settings.get().remoteBridge;
    this.settings.update({
      remoteBridge: { ...bridge, devices: bridge.devices.filter((d) => d.id !== deviceId) },
    });
    this.lastTouch.delete(deviceId);
  }

  touch(deviceId: string, ip: string): void {
    const now = Date.now();
    const last = this.lastTouch.get(deviceId) ?? 0;
    if (now - last < TOUCH_THROTTLE_MS) return;
    this.lastTouch.set(deviceId, now);
    const bridge = this.settings.get().remoteBridge;
    this.settings.update({
      remoteBridge: {
        ...bridge,
        devices: bridge.devices.map((d) =>
          d.id === deviceId ? { ...d, lastSeenAt: now, lastIp: ip } : d,
        ),
      },
    });
  }
}
