#!/usr/bin/env node
/**
 * Downloads the cloudflared binary for the platform being packaged into
 * apps/desktop/resources/cloudflared/, so the installer ships it and a user
 * with a bare machine gets working phone access without fetching anything.
 *
 * Runs before electron-builder (see the desktop `dist` script). Skips the
 * download when the binary is already present.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "apps/desktop/resources/cloudflared");
const RELEASE_BASE = "https://github.com/cloudflare/cloudflared/releases/latest/download";

// electron-builder fails on an extraResources path that doesn't exist, so the
// directory is created even when we end up skipping the download.
fs.mkdirSync(outDir, { recursive: true });

const platform = process.env.WHALEX_TARGET_PLATFORM ?? process.platform;
const arch = process.env.WHALEX_TARGET_ARCH ?? process.arch;
const goArch = arch === "arm64" ? "arm64" : arch === "x64" ? "amd64" : null;

if (!goArch) {
  console.warn(`[cloudflared] no build for arch ${arch}; skipping (tunnel falls back to download)`);
  process.exit(0);
}

const asset =
  platform === "win32"
    ? `cloudflared-windows-${goArch}.exe`
    : platform === "darwin"
      ? `cloudflared-darwin-${goArch}.tgz`
      : platform === "linux"
        ? `cloudflared-linux-${goArch}`
        : null;

if (!asset) {
  console.warn(`[cloudflared] no build for platform ${platform}; skipping`);
  process.exit(0);
}

const binName = platform === "win32" ? "cloudflared.exe" : "cloudflared";
const target = path.join(outDir, binName);

if (fs.existsSync(target)) {
  console.log(`[cloudflared] already present: ${target}`);
  process.exit(0);
}

console.log(`[cloudflared] downloading ${asset}…`);

const res = await fetch(`${RELEASE_BASE}/${asset}`, { redirect: "follow" });
if (!res.ok || !res.body) {
  console.error(`[cloudflared] download failed: HTTP ${res.status}`);
  process.exit(1);
}

const tmp = `${target}.part`;
await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));

if (asset.endsWith(".tgz")) {
  const tar = spawnSync("tar", ["-xzf", tmp, "-C", outDir], { stdio: "inherit" });
  if (tar.status !== 0) {
    console.error("[cloudflared] tar extraction failed");
    process.exit(1);
  }
  fs.rmSync(tmp, { force: true });
} else {
  fs.renameSync(tmp, target);
}
if (platform !== "win32") fs.chmodSync(target, 0o755);

const mb = (fs.statSync(target).size / 1024 / 1024).toFixed(1);
console.log(`[cloudflared] ready: ${target} (${mb} MB)`);
