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
   * binary got taskkilled by the installer's own app-check; a detached
   * cmd.exe supervisor survived — but flashed a visible console (windowsHide
   * is ineffective for detached console apps), and its tasklist-by-name wait
   * deadlocked when the user relaunched the app during the 20-100s teardown
   * hang, silently stranding the update (seen on 0.2.22 → 0.2.25).
   *
   * The supervisor is now a wscript.exe VBS shim (GUI subsystem: no console
   * to show, survives parent death) that runs one hidden PowerShell doing
   * everything: wait for the exiting app's PID (not its image name), bail
   * out fast if the user relaunches meanwhile (the new instance re-offers
   * the update), then install, verify by the app exe's mtime changing —
   * exit codes are unreliable from hidden consoles — with up to 5 retries,
   * and relaunch if --force-run didn't. Log: ~/.whalex/waiter.log.
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
    const vbsPath = path.join(app.getPath("temp"), "whalex-update-waiter.vbs");
    const ps1Path = path.join(app.getPath("temp"), "whalex-update-waiter.ps1");
    const waiterLog = path.join(os.homedir(), ".whalex", "waiter.log");
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const ok = await new Promise<boolean>((resolve) => {
      try {
        // UTF-16LE with BOM: wscript parses BOM-less files as ANSI, which
        // mangles non-ASCII temp paths (this user dir contains Hangul).
        fs.writeFileSync(vbsPath, String.fromCharCode(0xfeff) + waiterVbs(ps1Path), "utf16le");
        fs.writeFileSync(ps1Path, WAITER_PS1);
        // detached + unref: the supervisor must be in its own process group.
        // Field history: a non-detached child was reaped along with the
        // app's teardown on exit — the waiter logged "parked" and vanished,
        // stranding a downloaded update forever (seen on 0.2.19 → 0.2.21).
        const p = spawn("wscript.exe", ["//B", "//NOLOGO", vbsPath], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
          env: {
            ...env,
            WX_LOG: waiterLog,
            WX_EXENAME: path.basename(process.execPath),
            WX_APPEXE: process.execPath,
            WX_APPPID: String(process.pid),
            WX_INSTALLER: installerPath,
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
 * VBS shim: wscript.exe is a GUI-subsystem host — no console window exists
 * at all (spawn's windowsHide can't hide a detached console app, which is
 * how the old cmd supervisor flashed a visible window). Its only job is to
 * start the PowerShell worker hidden (window style 0) and not wait.
 */
function waiterVbs(ps1Path: string): string {
  const cmd =
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " +
    `""${ps1Path}""`;
  return `CreateObject("WScript.Shell").Run "${cmd}", 0, False\r\n`;
}

/**
 * The whole supervisor in ONE hidden PowerShell process (multi-stage cmd
 * layers are where field supervisors vanished before):
 *
 * 1. Wait for the exiting app's main PID to die — by PID, not image name,
 *    so a user relaunching the app doesn't read as "still shutting down".
 * 2. Wait for lingering same-exe children (kernel teardown can hold them
 *    20-100s). A process whose StartTime is AFTER the supervisor parked is
 *    a user relaunch → abort; the relaunched app re-offers the update.
 * 3. Install silently; success is the app exe's mtime changing (exit codes
 *    are advisory; null from hidden consoles). Five attempts ride out
 *    Defender's block-at-first-sight on the fresh unsigned installer.
 * 4. Relaunch if the installer's --force-run didn't.
 */
const WAITER_PS1 = String.raw`
$log = $env:WX_LOG
function L($m) { Add-Content -Encoding UTF8 $log ((Get-Date -Format HH:mm:ss.f) + " " + $m) }
$parkedAt = Get-Date
$name = [IO.Path]::GetFileNameWithoutExtension($env:WX_EXENAME)
L ("supervisor parked, waiting on pid " + $env:WX_APPPID)

$deadline = (Get-Date).AddSeconds(150)
while ((Get-Date) -lt $deadline -and (Get-Process -Id ([int]$env:WX_APPPID) -ErrorAction SilentlyContinue)) {
  Start-Sleep -Milliseconds 800
}
if (Get-Process -Id ([int]$env:WX_APPPID) -ErrorAction SilentlyContinue) {
  L "old app process never exited - aborting, not installing over a live app"
  exit 1
}
L "old main process gone"

$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
  $procs = @(Get-Process -Name $name -ErrorAction SilentlyContinue)
  if ($procs.Count -eq 0) { break }
  $relaunched = @($procs | Where-Object {
    try { $_.StartTime -gt $parkedAt } catch { $false }
  })
  if ($relaunched.Count -gt 0) {
    L "app was relaunched by the user - aborting; the new instance re-offers the update"
    exit 1
  }
  Start-Sleep -Milliseconds 800
}
if (@(Get-Process -Name $name -ErrorAction SilentlyContinue).Count -gt 0) {
  L "lingering app processes never cleared - aborting"
  exit 1
}
L "all app processes gone"

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
