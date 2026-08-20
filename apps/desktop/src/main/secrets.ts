import fs from "node:fs";
import path from "node:path";
import { safeStorage } from "electron";
import { whalexHome } from "@whalex/core";

/**
 * API-key vault backed by Electron safeStorage (DPAPI on Windows).
 * Keys are decrypted only in the main process; the renderer sees a masked
 * tail at most. Falls back to plaintext-marked storage only when the OS
 * keychain is unavailable (rare; e.g. some Linux setups).
 */
export class SecretVault {
  private file = path.join(whalexHome(), "secrets.bin");
  private store: Record<string, { v: string; plain?: boolean }> = {};

  constructor() {
    try {
      this.store = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      this.store = {};
    }
  }

  set(ref: string, value: string): void {
    if (safeStorage.isEncryptionAvailable()) {
      this.store[ref] = { v: safeStorage.encryptString(value).toString("base64") };
    } else {
      console.warn(
        "[secrets] OS keychain unavailable — storing secret base64-encoded (NOT encrypted) in secrets.bin",
      );
      this.store[ref] = { v: Buffer.from(value, "utf8").toString("base64"), plain: true };
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    // Owner-only where the OS honors it (no-op on Windows ACLs).
    fs.writeFileSync(this.file, JSON.stringify(this.store), { encoding: "utf8", mode: 0o600 });
    try {
      fs.chmodSync(this.file, 0o600); // mode above only applies on create
    } catch {
      // best effort
    }
  }

  /** Forget a secret entirely — deleting a saved key must not leave the
   *  value behind in the file. */
  delete(ref: string): void {
    if (!(ref in this.store)) return;
    delete this.store[ref];
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.store), { encoding: "utf8", mode: 0o600 });
    } catch {
      // best effort — the entry is already gone from the in-memory store
    }
  }

  get(ref: string): string | null {
    const entry = this.store[ref];
    if (!entry) return null;
    try {
      const buf = Buffer.from(entry.v, "base64");
      return entry.plain ? buf.toString("utf8") : safeStorage.decryptString(buf);
    } catch {
      return null;
    }
  }

  /** e.g. "...a1b2" for the settings UI, or null when unset. */
  maskedTail(ref: string): string | null {
    const value = this.get(ref);
    return value ? `...${value.slice(-4)}` : null;
  }

  maskedAll(refs: string[]): Record<string, string | null> {
    return Object.fromEntries(refs.map((r) => [r, this.maskedTail(r)]));
  }
}
