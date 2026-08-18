import { spawn } from "node:child_process";
import { app, shell, type BrowserWindow } from "electron";
import electronUpdater from "electron-updater";
import type { UpdateStatus } from "@whalex/shared";
import { isCloud, CLOUD_CONFIG } from "./edition.js";

const { autoUpdater } = electronUpdater;

// macOS builds ship unsigned zips, which Squirrel.Mac refuses to install.
// Until we sign, degrade mac to "check + open the Releases page" — checking
// still works (it only fetches the feed), but download/install must not run.
// Flip to a real signing check once mac builds are signed.
const MAC_NO_INSTALL = process.platform === "darwin";
const RELEASES_URL = isCloud
  ? "https://whalex.app"
  : "https://github.com/leejoong/whalex/releases/latest";

/**
 * Wraps electron-updater. autoDownload is off — the user clicks to download
 * from the toast. Status is pushed to the renderer via `update:status`.
 * Errors degrade to a status line, never a blocking dialog.
 */
export class Updater {
  private lastStatus: UpdateStatus = { state: "idle" };

  /**
   * Set by main: runs the app's shutdown cleanup (dispose sessions, kill dev
   * servers, release the before-quit preventDefault) BEFORE the installer is
   * handed the baton. Without this the process outlives the handoff and the
   * installer complains it cannot close the app.
   */
  prepareShutdown: () => Promise<void> = async () => {};

  /** Set by main: appends to ~/.whalex/main.log so updater failures are visible. */
  log: (msg: string) => void = () => {};

  constructor(private getWindow: () => BrowserWindow | null) {
    autoUpdater.logger = {
      info: (m: unknown) => this.log(`[updater] ${String(m)}`),
      warn: (m: unknown) => this.log(`[updater] warn: ${String(m)}`),
      error: (m: unknown) => this.log(`[updater] error: ${String(m)}`),
      debug: () => {},
    };
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = !MAC_NO_INSTALL;
    // Cloud edition ships from our own bucket; OSS uses the GitHub feed
    // baked into electron-builder config.
    if (isCloud) {
      autoUpdater.setFeedURL({ provider: "generic", url: CLOUD_CONFIG.updateFeedUrl });
    }

    autoUpdater.on("checking-for-update", () => this.set({ state: "checking" }));
    autoUpdater.on("update-available", (info) =>
      this.set({ state: "available", version: info.version, notes: releaseNotes(info) }),
    );
    autoUpdater.on("update-not-available", () => this.set({ state: "current" }));
    autoUpdater.on("download-progress", (p) =>
      this.set({ state: "downloading", percent: Math.round(p.percent) }),
    );
    autoUpdater.on("update-downloaded", (info) =>
      this.set({ state: "downloaded", version: info.version }),
    );
    autoUpdater.on("error", (err) =>
      this.set({ state: "error", error: err instanceof Error ? err.message : String(err) }),
    );
  }

  /** Periodic + on-launch check. No-op when unpackaged or no feed configured. */
  start(): void {
    void this.check();
    setInterval(() => void this.check(), 4 * 60 * 60 * 1000);
  }

  async check(): Promise<void> {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      this.set({ state: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  private downloadInFlight = false;

  async download(): Promise<void> {
    // Unsigned mac: the update action sends the user to the
    // Releases page instead — the closest the current status schema allows.
    if (MAC_NO_INSTALL) {
      await shell.openExternal(RELEASES_URL);
      return;
    }
    // The renderer disables its buttons, but a second window or a slow click
    // path must not start a concurrent download of the same update.
    if (this.downloadInFlight) return;
    this.downloadInFlight = true;
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      this.set({ state: "error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.downloadInFlight = false;
    }
  }

  install(): void {
    if (MAC_NO_INSTALL) {
      // Unreachable in practice (nothing downloads on mac), but never hand
      // an unsigned zip to Squirrel.Mac.
      void shell.openExternal(RELEASES_URL);
      return;
    }
    // Silent install + relaunch: no NSIS wizard, the app just comes back on
    // the new version. Cleanup must finish first so quit isn't intercepted.
    void this.prepareShutdown().finally(() => void this.launchInstallerAndQuit());
  }

  /**
   * Die first, install second. Every install-before-quit ordering lost some
   * race in the field: quitAndInstall's fire-and-forget spawn lost to the AV
   * scanner holding the fresh exe, and even a confirmed spawn lost to the
   * app's own half-quit wedge (window closed, process alive ~50s) — the
   * silent installer sees a running app and gives up. So on Windows we park
   * a detached waiter that blocks on our PID actually exiting, THEN runs the
   * installer (with its own retries for scanner locks), and we exit — with a
   * force-exit watchdog in case quit wedges again.
   */
  private async launchInstallerAndQuit(): Promise<void> {
    const installerPath = (autoUpdater as unknown as { installerPath: string | null }).installerPath;
    if (!installerPath || process.platform !== "win32") {
      // Nothing downloaded through this session (or non-NSIS platform) —
      // let electron-updater try its own path.
      autoUpdater.quitAndInstall(true, true);
      return;
    }
    autoUpdater.autoInstallOnAppQuit = false; // we own the handoff now
    const waiterScript =
      `Wait-Process -Id ${process.pid} -Timeout 120 -ErrorAction SilentlyContinue; ` +
      `Start-Sleep -Milliseconds 500; ` +
      `for ($i = 0; $i -lt 10; $i++) { ` +
      `try { Start-Process -FilePath '${installerPath.replace(/'/g, "''")}' -ArgumentList '--updated','/S','--force-run'; break } ` +
      `catch { Start-Sleep -Seconds 2 } }`;
    const ok = await new Promise<boolean>((resolve) => {
      try {
        const p = spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", waiterScript], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        let settled = false;
        p.once("error", (err) => {
          this.log(`[updater] waiter spawn error: ${String(err)}`);
          if (!settled) {
            settled = true;
            resolve(false);
          }
        });
        p.unref();
        setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve(p.pid !== undefined);
          }
        }, 500);
      } catch (err) {
        this.log(`[updater] waiter spawn threw: ${String(err)}`);
        resolve(false);
      }
    });
    if (!ok) {
      // PowerShell unavailable?! Fall back to the stock path rather than
      // stranding the user with a downloaded-but-never-installed update.
      this.log("[updater] waiter failed to start — falling back to quitAndInstall");
      autoUpdater.quitAndInstall(true, true);
      return;
    }
    this.log(`[updater] waiter parked on pid ${process.pid}; quitting for update`);
    app.quit();
    // Half-quit wedge guard: window closed but process alive starves the
    // waiter's Wait-Process. If quit hasn't terminated us shortly, force it.
    setTimeout(() => {
      this.log("[updater] quit wedged — forcing exit for installer");
      app.exit(0);
    }, 8000);
  }

  current(): UpdateStatus {
    return this.lastStatus;
  }

  private set(status: UpdateStatus): void {
    this.lastStatus = status;
    const win = this.getWindow();
    if (win && !win.isDestroyed()) win.webContents.send("update:status", status);
  }
}

function releaseNotes(info: { releaseNotes?: string | Array<{ note?: string | null }> | null }): string {
  const notes = info.releaseNotes;
  if (typeof notes === "string") return notes.replace(/<[^>]+>/g, "").slice(0, 1000);
  if (Array.isArray(notes)) return notes.map((n) => n.note ?? "").join("\n").slice(0, 1000);
  return "";
}
