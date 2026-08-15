import type { BrowserWindow } from "electron";
import electronUpdater from "electron-updater";
import type { UpdateStatus } from "@whalex/shared";

const { autoUpdater } = electronUpdater;

/**
 * Wraps electron-updater. autoDownload is off — the user clicks to download
 * from the toast. Status is pushed to the renderer via `update:status`.
 * Errors degrade to a status line, never a blocking dialog.
 */
export class Updater {
  private lastStatus: UpdateStatus = { state: "idle" };

  constructor(private getWindow: () => BrowserWindow | null) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

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

  async download(): Promise<void> {
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      this.set({ state: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  install(): void {
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
