import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
   * app's own half-quit wedge (window closed, process alive 50-90s with
   * timers stalled) — the silent installer sees a running app and gives up.
   * So on Windows we park a detached waiter (this Electron binary re-run as
   * plain node — PowerShell cannot start detached without a console) that
   * polls for our PID to vanish, THEN runs the installer with scanner-lock
   * retries. We exit with app.exit(): cleanup already ran, and a graceful
   * quit is exactly the thing that wedges.
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
    const waiterJs = path.join(app.getPath("temp"), "whalex-update-waiter.js");
    const waiterLog = path.join(os.homedir(), ".whalex", "waiter.log");
    const ok = await new Promise<boolean>((resolve) => {
      try {
        fs.writeFileSync(waiterJs, WAITER_SRC);
        const p = spawn(process.execPath, [waiterJs, String(process.pid), installerPath, waiterLog], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
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
      // Waiter unavailable?! Fall back to the stock path rather than
      // stranding the user with a downloaded-but-never-installed update.
      this.log("[updater] waiter failed to start — falling back to quitAndInstall");
      autoUpdater.quitAndInstall(true, true);
      return;
    }
    this.log(`[updater] waiter parked on pid ${process.pid}; exiting for update`);
    app.exit(0);
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

/**
 * Runs as plain node (ELECTRON_RUN_AS_NODE) fully detached from the app:
 * argv = [appPid, installerPath, logPath]. Polls until the app PID is gone
 * (2 min cap), then launches the NSIS installer silently with retries — a
 * fresh download can still be locked by the AV scanner for a few seconds.
 */
const WAITER_SRC = `
const { spawn } = require("child_process");
const fs = require("fs");
const [pid, installer, logPath] = process.argv.slice(2);
const log = (m) => { try { fs.appendFileSync(logPath, new Date().toISOString() + " " + m + "\\n"); } catch {} };
const alive = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
log("parked watching pid " + pid);
const t0 = Date.now();
(function wait() {
  if (alive(+pid) && Date.now() - t0 < 120000) return setTimeout(wait, 500);
  log("app gone at +" + Math.round((Date.now() - t0) / 1000) + "s");
  let attempt = 0;
  (function run() {
    attempt++;
    try {
      const c = spawn(installer, ["--updated", "/S", "--force-run"], { detached: true, stdio: "ignore" });
      let failed = false;
      c.once("error", (e) => {
        failed = true;
        log("spawn error (attempt " + attempt + "): " + e);
        if (attempt < 10) setTimeout(run, 2000);
        else process.exit(1);
      });
      c.unref();
      setTimeout(() => {
        if (!failed) {
          log("installer launched (attempt " + attempt + ")");
          process.exit(0);
        }
      }, 1000);
    } catch (e) {
      log("spawn threw (attempt " + attempt + "): " + e);
      if (attempt < 10) setTimeout(run, 2000);
      else process.exit(1);
    }
  })();
})();
`;

function releaseNotes(info: { releaseNotes?: string | Array<{ note?: string | null }> | null }): string {
  const notes = info.releaseNotes;
  if (typeof notes === "string") return notes.replace(/<[^>]+>/g, "").slice(0, 1000);
  if (Array.isArray(notes)) return notes.map((n) => n.note ?? "").join("\n").slice(0, 1000);
  return "";
}
