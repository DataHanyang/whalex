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
    await pipeline(
      (async function* () {
        for await (const chunk of reader) {
          seen += chunk.byteLength;
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

  /** Bring up a quick tunnel in front of the loopback bridge. */
  async start(port: number): Promise<void> {
    this.stopping = false;
    await this.ensureBinary();
    this.spawnTunnel(port);
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
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    this.proc = proc;

    const onChunk = (buf: Buffer): void => {
      const text = buf.toString("utf8");
      const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(text);
      if (match && this.current.state !== "up") {
        this.attempt = 0;
        this.setState({ state: "up", url: match[0] });
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

  stop(): void {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.proc?.kill();
    this.proc = null;
    this.attempt = 0;
    this.setState({ state: "off" });
  }
}
