import { app, shell, type BrowserWindow } from "electron";
import { CLOUD_CONFIG, isCloud } from "./edition.js";
import type { SecretVault } from "./secrets.js";

const TOKEN_REF = "whalex-cloud-token";
const PROTOCOL = "whalex";

/**
 * Subscription (cloud edition) auth. The login opens the browser to our OAuth
 * page; the provider redirects to whalex://auth-callback?token=... which the
 * OS routes back to the app via the custom protocol. The token is stored in
 * safeStorage and used as the bearer for the hosted API proxy.
 *
 * This is the client-side flow; it requires the hosted auth server to exist.
 * In the OSS edition it is inert.
 */
export class AuthManager {
  private onChange?: (signedIn: boolean) => void;

  constructor(private vault: SecretVault) {}

  static registerProtocol(): void {
    if (!isCloud) return;
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [process.argv[1]!]);
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL);
    }
  }

  setListener(fn: (signedIn: boolean) => void): void {
    this.onChange = fn;
  }

  isSignedIn(): boolean {
    return !!this.vault.get(TOKEN_REF);
  }

  token(): string | null {
    return this.vault.get(TOKEN_REF);
  }

  async signIn(): Promise<void> {
    await shell.openExternal(`${CLOUD_CONFIG.authUrl}?redirect=${PROTOCOL}://auth-callback`);
  }

  signOut(): void {
    this.vault.set(TOKEN_REF, "");
    this.onChange?.(false);
  }

  /** Called from the second-instance / open-url handlers with the deep link. */
  handleCallback(url: string): void {
    try {
      const parsed = new URL(url);
      const token = parsed.searchParams.get("token");
      if (token) {
        this.vault.set(TOKEN_REF, token);
        this.onChange?.(true);
      }
    } catch {
      // ignore malformed callback
    }
  }

  /** Wire OS deep-link delivery (macOS open-url + Windows second-instance argv). */
  wire(getWindow: () => BrowserWindow | null): void {
    if (!isCloud) return;
    app.on("open-url", (_e, url) => this.handleCallback(url));
    app.on("second-instance", (_e, argv) => {
      const deepLink = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
      if (deepLink) this.handleCallback(deepLink);
      getWindow()?.focus();
    });
  }
}
