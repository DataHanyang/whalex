import { execa, type ResultPromise } from "execa";

interface PreviewServer {
  proc: ResultPromise;
  url: string;
}

/**
 * Runs a project's dev server for the preview panel. One server per session;
 * killed on stop or session end. Windows: kill the whole process tree.
 */
export class PreviewManager {
  private servers = new Map<string, PreviewServer>();

  async start(
    sessionId: string,
    command: string,
    port: number,
    cwd: string,
  ): Promise<{ ok: boolean; url?: string; error?: string }> {
    await this.stop(sessionId);
    try {
      const shell = process.platform === "win32" ? "powershell.exe" : "bash";
      const args =
        process.platform === "win32"
          ? ["-NoProfile", "-NonInteractive", "-Command", command]
          : ["-c", command];
      const proc = execa(shell, args, {
        cwd,
        windowsHide: true,
        detached: false,
        reject: false,
        stdio: "pipe",
      });
      const url = `http://localhost:${port}`;
      this.servers.set(sessionId, { proc, url });
      // Give the dev server a moment to bind.
      await new Promise((r) => setTimeout(r, 2500));
      return { ok: true, url };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async stop(sessionId: string): Promise<void> {
    const server = this.servers.get(sessionId);
    if (!server) return;
    this.servers.delete(sessionId);
    try {
      if (process.platform === "win32" && server.proc.pid) {
        await execa("taskkill", ["/PID", String(server.proc.pid), "/T", "/F"], { reject: false });
      } else {
        server.proc.kill("SIGTERM");
      }
    } catch {
      // best effort
    }
  }

  stopAll(): void {
    for (const id of [...this.servers.keys()]) void this.stop(id);
  }
}
