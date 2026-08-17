import net from "node:net";
import { execa, type ResultPromise } from "execa";

interface PreviewServer {
  proc: ResultPromise;
  url: string;
}

/** True when something is accepting TCP connections on localhost:port. */
function portOpen(port: number, timeoutMs = 750): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const done = (up: boolean) => {
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

const READY_TIMEOUT_MS = 20_000;
const POLL_MS = 500;

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
    // Fail fast on a port squatter instead of "starting" over someone else's server.
    if (await portOpen(port)) {
      return { ok: false, error: `Port ${port} is already in use by another process.` };
    }
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

      // Keep a small output tail for the error message when startup fails.
      let tail = "";
      const capture = (chunk: Buffer) => {
        tail = (tail + chunk.toString()).slice(-2000);
      };
      proc.stdout?.on("data", capture);
      proc.stderr?.on("data", capture);
      let exited = false;
      // reject:false — the promise settles on exit for crashes too. Prune the
      // map so a dead server doesn't shadow-block the session's next start.
      void proc.then(() => {
        exited = true;
        if (this.servers.get(sessionId)?.proc === proc) this.servers.delete(sessionId);
      });

      this.servers.set(sessionId, { proc, url });

      // Ready = the port accepts connections; dead early exit or a silent
      // never-binding command both surface as errors instead of ok:true.
      const deadline = Date.now() + READY_TIMEOUT_MS;
      for (;;) {
        if (exited) {
          return {
            ok: false,
            error: `Dev server exited before binding port ${port}.${tail ? `\n${tail.trim()}` : ""}`,
          };
        }
        if (await portOpen(port)) return { ok: true, url };
        if (Date.now() > deadline) break;
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      await this.stop(sessionId);
      return {
        ok: false,
        error: `Dev server did not open port ${port} within ${READY_TIMEOUT_MS / 1000}s.${tail ? `\n${tail.trim()}` : ""}`,
      };
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

  /** Awaitable so before-quit can hold the app open until trees are killed. */
  stopAll(): Promise<void> {
    return Promise.all([...this.servers.keys()].map((id) => this.stop(id))).then(() => undefined);
  }
}
