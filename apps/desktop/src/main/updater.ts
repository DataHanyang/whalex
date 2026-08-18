import { shell, type BrowserWindow } from "electron";
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

  constructor(private getWindow: () => BrowserWindow | null) {
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
    autoUpdater.quitAndInstall();
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
