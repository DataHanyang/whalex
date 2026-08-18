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
        const p = spawn(process.execPath, [waiterJs, process.execPath, installerPath, waiterLog], {
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
    this.log(`[updater] waiter parked (${path.basename(process.execPath)}); exiting for update`);
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
 * argv = [exeName, installerPath, logPath]. Waits until NO process with the
 * app's exe name remains in tasklist (excluding itself — the waiter IS the
 * app binary) before launching the installer. tasklist-level death matters:
 * the app's shutdown can hang 20-100s in kernel teardown where even
 * taskkill /f doesn't reap it immediately, and the NSIS installer only
 * waits ~8s before silently giving up. The waiter has the patience the
 * installer lacks (150s), with AV-scanner-lock retries on the spawn.
 */
const WAITER_SRC = `
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const [appExe, installer, logPath] = process.argv.slice(2);
const exeName = require("path").basename(appExe);
const log = (m) => { try { fs.appendFileSync(logPath, new Date().toISOString() + " " + m + "\\n"); } catch {} };
// The waiter runs AS the app binary; ELECTRON_RUN_AS_NODE must not leak to
// the installer or the relaunched app comes up as a bare node process.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
log("parked; waiting for " + exeName + " (except pid " + process.pid + ") to vanish");
const t0 = Date.now();
const others = (cb) =>
  execFile("tasklist", ["/FI", "IMAGENAME eq " + exeName, "/FO", "CSV", "/NH"], (err, out) => {
    if (err) return cb([]);
    const pids = [];
    for (const line of String(out).split(/\\r?\\n/)) {
      const m = line.match(/^"[^"]+","(\\d+)"/);
      if (m && Number(m[1]) !== process.pid) pids.push(Number(m[1]));
    }
    cb(pids);
  });
const relaunchIfNeeded = () => {
  // --force-run usually restarts the app; if not (or if the installer killed
  // this waiter's tracking of it), start it ourselves and be done.
  others((pids) => {
    if (pids.length === 0) {
      try {
        spawn(appExe, [], { detached: true, stdio: "ignore", env }).unref();
        log("relaunched app directly");
      } catch (e) {
        log("relaunch failed: " + e);
      }
    } else log("app already relaunched (" + pids.join(",") + ")");
    process.exit(0);
  });
};
let attempt = 0;
const install = () => {
  attempt++;
  // Supervised, NOT detached: Defender's block-at-first-sight can kill the
  // first execution of a freshly downloaded unsigned installer; the verdict
  // is cached, so a retried run goes through. Exit code tells us which.
  let child;
  try {
    child = spawn(installer, ["--updated", "/S", "--force-run"], { stdio: "ignore", env });
  } catch (e) {
    log("spawn threw (attempt " + attempt + "): " + e);
    return retry();
  }
  const timer = setTimeout(() => {
    log("installer timeout (attempt " + attempt + ")");
    try { child.kill(); } catch {}
    retry();
  }, 300000);
  child.once("error", (e) => {
    clearTimeout(timer);
    log("spawn error (attempt " + attempt + "): " + e);
    retry();
  });
  child.once("exit", (code) => {
    clearTimeout(timer);
    log("installer exited code " + code + " (attempt " + attempt + ")");
    if (code === 0) return setTimeout(relaunchIfNeeded, 15000);
    retry();
  });
};
let retried = false;
const retry = () => {
  if (retried) return; // exit/error can both fire
  retried = true;
  setTimeout(() => {
    retried = false;
    if (attempt < 5) install();
    else { log("giving up after " + attempt + " attempts"); process.exit(1); }
  }, 8000);
};
(function wait() {
  others((pids) => {
    if (pids.length > 0 && Date.now() - t0 < 150000) return setTimeout(wait, 1000);
    if (pids.length > 0) log("timeout; stragglers " + pids.join(",") + " — installing anyway");
    else log("app fully gone at +" + Math.round((Date.now() - t0) / 1000) + "s");
    install();
  });
})();
`;

function releaseNotes(info: { releaseNotes?: string | Array<{ note?: string | null }> | null }): string {
  const notes = info.releaseNotes;
  if (typeof notes === "string") return notes.replace(/<[^>]+>/g, "").slice(0, 1000);
  if (Array.isArray(notes)) return notes.map((n) => n.note ?? "").join("\n").slice(0, 1000);
  return "";
}
