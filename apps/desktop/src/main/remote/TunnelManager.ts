import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { whalexHome } from "@whalex/core";

/**
 * Zero-config public address for the remote bridge, via a Cloudflare quick
 * tunnel. No account, no domain, no port forwarding: cloudflared dials out
 * and Cloudflare hands back a random https://<words>.trycloudflare.com that
 * fronts the loopback bridge with a real certificate.
 *
 * That real cert is why this is the default path — a phone can trust it
 * outright, where the bridge's own self-signed cert needs native pinning.
 */

const RELEASE_BASE = "https://github.com/cloudflare/cloudflared/releases/latest/download";

/** Asset name for this platform, or null when cloudflared ships none. */
function assetName(): string | null {
  const arch = process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "amd64" : null;
  if (!arch) return null;
  if (process.platform === "win32") return `cloudflared-windows-${arch}.exe`;
  if (process.platform === "darwin") return `cloudflared-darwin-${arch}.tgz`;
  if (process.platform === "linux") return `cloudflared-linux-${arch}`;
  return null;
}

export function binaryName(): string {
  return process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
}

/** Where a self-downloaded copy lands, when the installer didn't ship one. */
export function binaryPath(): string {
  return path.join(whalexHome(), "bin", binaryName());
}

export type TunnelState =
  | { state: "off" }
  | { state: "downloading"; percent: number }
  | { state: "starting" }
  | { state: "up"; url: string }
  | { state: "error"; message: string };

export class TunnelManager {
  private proc: ChildProcess | null = null;
  /** PID of a tunnel inherited from a previous run; we have no handle on it. */
  private adoptedPid: number | null = null;
  private current: TunnelState = { state: "off" };
  private stopping = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private attempt = 0;

  constructor(
    private opts: {
      onState: (state: TunnelState) => void;
      log?: (msg: string) => void;
      /**
       * Copy shipped inside the installer (extraResources). Checked first so
       * a fresh machine with no toolchain works offline-of-setup: download is
       * only the fallback for dev runs and unpackaged platforms.
       */
      bundled?: () => string | null;
    },
  ) {}

  state(): TunnelState {
    return this.current;
  }

  url(): string | null {
    return this.current.state === "up" ? this.current.url : null;
  }

  private setState(state: TunnelState): void {
    this.current = state;
    this.opts.onState(state);
  }

  private bin(): string {
    const shipped = this.opts.bundled?.();
    if (shipped && fs.existsSync(shipped)) return shipped;
    return binaryPath();
  }

  /**
   * Fallback for installs without a bundled binary: fetch cloudflared into
   * ~/.whalex/bin. Needing the network here costs nothing — a tunnel is
   * useless offline anyway.
   */
  async ensureBinary(): Promise<void> {
    const target = this.bin();
    if (fs.existsSync(target)) return;
    const asset = assetName();
    if (!asset) throw new Error(`No cloudflared build for ${process.platform}/${process.arch}`);

    this.setState({ state: "downloading", percent: 0 });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const res = await fetch(`${RELEASE_BASE}/${asset}`, { redirect: "follow" });
    if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);

    const total = Number(res.headers.get("content-length") ?? 0);
    let seen = 0;
    const tmp = `${target}.part`;
    const out = fs.createWriteStream(tmp);
    const reader = res.body as unknown as AsyncIterable<Uint8Array>;
    // Report in 5% steps: this is tens of megabytes on a first run, and a bar
    // stuck at 0 reads as a hang.
    let reported = 0;
    const onProgress = (pct: number): void => {
      if (pct < reported + 5) return;
      reported = pct;
      this.setState({ state: "downloading", percent: pct });
    };
    await pipeline(
      (async function* () {
        for await (const chunk of reader) {
          seen += chunk.byteLength;
          if (total) onProgress(Math.floor((seen / total) * 100));
          yield chunk;
        }
      })(),
      out,
    );
    if (total && seen !== total) {
      fs.rmSync(tmp, { force: true });
      throw new Error("Download truncated");
    }

    if (asset.endsWith(".tgz")) {
      // macOS ships a tarball holding a single `cloudflared` binary.
      const dir = path.dirname(target);
      await new Promise<void>((resolve, reject) => {
        const tar = spawn("tar", ["-xzf", tmp, "-C", dir], { stdio: "ignore" });
        tar.on("error", reject);
        tar.on("exit", (code) =>
          code === 0 ? resolve() : reject(new Error(`tar exited ${code}`)),
        );
      });
      fs.rmSync(tmp, { force: true });
    } else {
      fs.renameSync(tmp, target);
    }
    if (process.platform !== "win32") fs.chmodSync(target, 0o755);
    this.opts.log?.(`cloudflared downloaded to ${target}`);
  }

  /**
   * Bring up a quick tunnel in front of the loopback bridge, reusing the one
   * from the previous run when it is still alive.
   *
   * Quick tunnels get a fresh random hostname every time cloudflared starts,
   * and a paired phone only re-learns the address from the local network — so
   * a desktop restart used to strand anyone who was out of the house. Letting
   * the tunnel outlive the app keeps the address fixed across restarts and
   * updates, which is when this bites.
   */
  async start(port: number): Promise<void> {
    this.stopping = false;
    try {
      await this.ensureBinary();
    } catch (err) {
      // A blocked or offline download leaves no tunnel and therefore no way
      // for a phone to connect. Say so: this used to leave "Preparing…" on
      // screen forever while the reason sat in a log file.
      this.setState({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    if (await this.adopt(port)) return;
    this.spawnTunnel(port);
  }

  /** Where the surviving tunnel's identity is recorded between runs. */
  private statePath(): string {
    return path.join(whalexHome(), "tunnel.json");
  }

  /**
   * Takes over the tunnel left by the previous run, if it still answers.
   * Probing the public URL is the whole check: it proves cloudflared is up
   * *and* still pointed at this machine's bridge, which a stale PID would not.
   */
  private async adopt(port: number): Promise<boolean> {
    let saved: { pid?: number; url?: string; port?: number };
    try {
      saved = JSON.parse(fs.readFileSync(this.statePath(), "utf8")) as typeof saved;
    } catch {
      return false;
    }
    if (!saved.url || saved.port !== port) return false;

    try {
      const res = await fetch(`${saved.url}/info`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return false;
      const body = (await res.json()) as { app?: string };
      if (body.app !== "whalex") return false;
    } catch {
      return false;
    }

    this.adoptedPid = saved.pid ?? null;
    this.setState({ state: "up", url: saved.url });
    this.opts.log?.(`reusing the tunnel from the last run: ${saved.url}`);
    return true;
  }

  private remember(url: string, port: number, pid: number | undefined): void {
    try {
      fs.mkdirSync(path.dirname(this.statePath()), { recursive: true });
      fs.writeFileSync(this.statePath(), JSON.stringify({ pid, url, port }), "utf8");
    } catch {
      // A tunnel we cannot remember still works for this run.
    }
  }

  private forget(): void {
    try {
      fs.rmSync(this.statePath(), { force: true });
    } catch {
      // best effort
    }
  }

  /**
   * cloudflared reads ~/.cloudflared/config.yml by default. On a machine that
   * already runs a named tunnel, that config's ingress rules hijack our quick
   * tunnel — every request lands on the user's own catch-all (typically a 404)
   * and never reaches the bridge. Point it at a config of our own instead.
   */
  private isolatedConfig(): string {
    const file = path.join(whalexHome(), "cloudflared-config.yml");
    if (!fs.existsSync(file)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        "# WhaleX quick tunnel — intentionally empty.\n" +
          "# Its only job is to stop cloudflared inheriting ~/.cloudflared/config.yml.\n",
        "utf8",
      );
    }
    return file;
  }

  private spawnTunnel(port: number): void {
    this.setState({ state: "starting" });
    // Detached, so an app restart or an update does not take the address with
    // it. stdout is piped for the URL and then unref'd — the child keeps
    // running with no parent handle holding it.
    const proc = spawn(
      this.bin(),
      [
        "tunnel",
        "--config",
        this.isolatedConfig(),
        "--no-autoupdate",
        // Quick tunnels are stdout-noisy; keep the log parseable.
        "--loglevel",
        "info",
        "--url",
        `http://127.0.0.1:${port}`,
      ],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: true },
    );
    this.proc = proc;
    proc.unref();

    const onChunk = (buf: Buffer): void => {
      const text = buf.toString("utf8");
      const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(text);
      if (match && this.current.state !== "up") {
        this.attempt = 0;
        this.setState({ state: "up", url: match[0] });
        this.remember(match[0], port, proc.pid);
        this.opts.log?.(`quick tunnel up: ${match[0]}`);
      }
    };
    proc.stdout?.on("data", onChunk);
    proc.stderr?.on("data", onChunk);

    proc.on("error", (err) => {
      this.setState({ state: "error", message: err.message });
    });
    proc.on("exit", (code) => {
      this.proc = null;
      if (this.stopping) return;
      // Cloudflare drops quick tunnels routinely; treat exit as transient and
      // climb a backoff rather than leaving the user with a dead address.
      const delay = Math.min(60_000, 2000 * 2 ** this.attempt++);
      this.setState({ state: "error", message: `tunnel exited (${code}), retrying` });
      this.opts.log?.(`quick tunnel exited ${code}; retry in ${delay}ms`);
      this.restartTimer = setTimeout(() => this.spawnTunnel(port), delay);
    });
  }

  /**
   * Lets go of the tunnel.
   *
   * `keepAlive` leaves cloudflared running so the next launch adopts the same
   * address — that is the point of the whole arrangement, and it covers app
   * restarts and updates. A deliberate shutdown (the user quitting, or turning
   * the feature off) takes the tunnel down with it, since nothing is coming
   * back to adopt it.
   */
  stop(opts?: { keepAlive?: boolean }): void {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (opts?.keepAlive) {
      // Drop our listeners but leave the process — the URL stays valid.
      this.proc?.stdout?.removeAllListeners();
      this.proc?.stderr?.removeAllListeners();
      this.proc?.removeAllListeners();
      this.proc = null;
      return;
    }
    this.kill();
    this.attempt = 0;
    this.setState({ state: "off" });
  }

  private kill(): void {
    try {
      this.proc?.kill();
    } catch {
      // A child that failed to spawn has no pid to signal, and Windows raises
      // EINVAL instead of ignoring it. Shutdown must not care.
    }
    this.proc = null;
    // A tunnel left by an earlier run has no handle here, only a recorded pid.
    let pid = this.adoptedPid;
    if (pid == null) {
      try {
        pid = (JSON.parse(fs.readFileSync(this.statePath(), "utf8")) as { pid?: number }).pid ?? null;
      } catch {
        pid = null;
      }
    }
    if (pid != null) {
      try {
        process.kill(pid);
      } catch {
        // already gone
      }
    }
    this.adoptedPid = null;
    this.forget();
  }
}
