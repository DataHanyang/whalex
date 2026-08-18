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
   * Die first, install second, supervised by something that isn't us.
   * Field history: quitAndInstall's fire-and-forget spawn lost to Defender's
   * block-at-first-sight on the fresh unsigned exe; the app's own shutdown
   * wedges 20-100s so the NSIS installer (which only waits ~8s) saw a
   * "running app" and silently gave up; a node waiter running AS the app
   * binary got taskkilled by the installer's own app-check. The supervisor
   * is therefore a hidden cmd.exe batch (not the app's exe name, survives
   * parent death, PowerShell can't start detached): it waits until tasklist
   * shows no app processes, then runs the installer and verifies success by
   * the app exe's mtime actually changing — exit codes are unreliable from a
   * hidden console — retrying up to 5 times, and relaunches the app if
   * --force-run didn't. Log: ~/.whalex/waiter.log.
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
    const batPath = path.join(app.getPath("temp"), "whalex-update-waiter.cmd");
    const ps1Path = path.join(app.getPath("temp"), "whalex-update-waiter.ps1");
    const waiterLog = path.join(os.homedir(), ".whalex", "waiter.log");
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const ok = await new Promise<boolean>((resolve) => {
      try {
        fs.writeFileSync(batPath, WAITER_BAT.replace(/\n/g, "\r\n"));
        fs.writeFileSync(ps1Path, WAITER_PS1);
        // detached + unref: the supervisor must be in its own process group.
        // Field history: a non-detached child was reaped along with the
        // app's teardown on exit — the waiter logged "parked" and vanished,
        // stranding a downloaded update forever (seen on 0.2.19 → 0.2.21).
        const p = spawn("cmd.exe", ["/c", batPath], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
          env: {
            ...env,
            WX_LOG: waiterLog,
            WX_EXENAME: path.basename(process.execPath),
            WX_APPEXE: process.execPath,
            WX_INSTALLER: installerPath,
            WX_PS1: ps1Path,
          },
        });
        let settled = false;
        p.once("error", (err) => {
          this.log(`[updater] supervisor spawn error: ${String(err)}`);
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
        this.log(`[updater] supervisor spawn threw: ${String(err)}`);
        resolve(false);
      }
    });
    if (!ok) {
      // Supervisor unavailable?! Fall back to the stock path rather than
      // stranding the user with a downloaded-but-never-installed update.
      this.log("[updater] supervisor failed to start — falling back to quitAndInstall");
      autoUpdater.quitAndInstall(true, true);
      return;
    }
    this.log("[updater] cmd supervisor parked; exiting for update");
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
/**
 * Hidden cmd.exe supervisor (parameterized via WX_* env vars). Waits for
 * every app process to leave tasklist, runs the installer, verifies the
 * app exe's mtime changed (ground truth — exit codes are null from hidden
 * consoles), retries up to 5 times, relaunches if --force-run didn't.
 * Validated end-to-end against a fake installer before shipping.
 */
const WAITER_BAT = `@echo off
setlocal enabledelayedexpansion
echo [%time%] supervisor parked>>"%WX_LOG%"
set /a w=0
:waitloop
tasklist /FI "IMAGENAME eq %WX_EXENAME%" /NH 2>nul | find /I "%WX_EXENAME%" >nul
if not errorlevel 1 (
  set /a w+=1
  if !w! lss 240 (ping -n 2 127.0.0.1 >nul & goto waitloop)
  echo [%time%] app still running after !w! polls - aborting, not installing over a live app>>"%WX_LOG%"
  exit
)
echo [%time%] app gone after !w! polls>>"%WX_LOG%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%WX_PS1%"
exit
`;

/**
 * Install + verify + retry, all in ONE PowerShell process — the cmd layer's
 * between-attempt gap is where the field supervisor once vanished. Success
 * is the app exe's mtime changing (exit codes are advisory; null from
 * hidden consoles). Five attempts ride out Defender's block-at-first-sight
 * on the freshly downloaded unsigned installer.
 */
const WAITER_PS1 = String.raw`
$log = $env:WX_LOG
function L($m) { Add-Content -Encoding UTF8 $log ((Get-Date -Format HH:mm:ss.f) + " " + $m) }
for ($i = 1; $i -le 5; $i++) {
  L ("attempt " + $i)
  try {
    $before = (Get-Item $env:WX_APPEXE -ErrorAction Stop).LastWriteTimeUtc
    $p = Start-Process -FilePath $env:WX_INSTALLER -ArgumentList '--updated','/S','--force-run' -PassThru -ErrorAction Stop
    $p.WaitForExit()
    Start-Sleep 3
    $after = (Get-Item $env:WX_APPEXE -ErrorAction Stop).LastWriteTimeUtc
    L ("exit=" + $p.ExitCode + " changed=" + ($after -gt $before))
    if ($after -gt $before) {
      Start-Sleep 8
      $name = [IO.Path]::GetFileNameWithoutExtension($env:WX_EXENAME)
      if (-not (Get-Process -Name $name -ErrorAction SilentlyContinue)) {
        Start-Process -FilePath $env:WX_APPEXE
        L "relaunched directly"
      } else { L "already relaunched" }
      exit 0
    }
  } catch { L ("EXCEPTION " + $_) }
  Start-Sleep 8
}
L "giving up"
exit 1
`;

function releaseNotes(info: { releaseNotes?: string | Array<{ note?: string | null }> | null }): string {
  const notes = info.releaseNotes;
  if (typeof notes === "string") return notes.replace(/<[^>]+>/g, "").slice(0, 1000);
  if (Array.isArray(notes)) return notes.map((n) => n.note ?? "").join("\n").slice(0, 1000);
  return "";
}
