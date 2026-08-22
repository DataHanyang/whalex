// Screenshots the desktop Settings tabs against a throwaway profile, so
// layout and copy can be reviewed without touching the running app or its
// real ~/.whalex.
//
//   pnpm --filter @whalex/desktop build && node scripts/settings-shots.mjs [outDir] [lang]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(root, process.argv[2] ?? "apps/desktop/docs/shots");
const lang = process.argv[3] ?? "ko";
const CDP_PORT = 9233;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const iso = fs.mkdtempSync(path.join(os.tmpdir(), "whalex-shots-"));
fs.mkdirSync(path.join(iso, "AppData", "Roaming"), { recursive: true });
fs.mkdirSync(path.join(iso, "AppData", "Local"), { recursive: true });
const home = path.join(iso, ".whalex");
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(
  path.join(home, "settings.json"),
  JSON.stringify({
    onboardingComplete: true,
    language: lang,
    theme: "dark",
    // Bridge on so the Remote tab renders its real controls. A publicUrl
    // stands the built-in tunnel down, which is what keeps this from spawning
    // cloudflared or reaching the network.
    remoteBridge: { enabled: true, publicUrl: "https://example.com/whalex", port: 48699 },
  }),
);

const desktop = path.join(root, "apps", "desktop");
const binName = process.platform === "win32" ? "electron.CMD" : "electron";
const electronBin = [
  path.join(root, "node_modules", ".bin", binName),
  path.join(desktop, "node_modules", ".bin", binName),
].find((p) => fs.existsSync(p));
if (!electronBin) throw new Error("electron binary not found");

const child = spawn(electronBin, ["."], {
  cwd: desktop,
  shell: process.platform === "win32",
  env: {
    ...process.env,
    USERPROFILE: iso,
    HOME: iso,
    APPDATA: path.join(iso, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(iso, "AppData", "Local"),
    WHALEX_CDP_PORT: String(CDP_PORT),
    ELECTRON_DISABLE_SANDBOX: "1",
  },
  stdio: "ignore",
});

const killApp = () => {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else child.kill("SIGKILL");
};

try {
  fs.mkdirSync(outDir, { recursive: true });
  let browser = null;
  for (let i = 0; i < 60 && !browser; i++) {
    await sleep(1000);
    browser = await puppeteer
      .connect({ browserURL: `http://127.0.0.1:${CDP_PORT}`, defaultViewport: null })
      .catch(() => null);
  }
  if (!browser) throw new Error("app never exposed CDP");

  const pages = await browser.pages();
  const page = pages.find((p) => !p.url().startsWith("devtools://")) ?? pages[0];
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
  await sleep(3000);

  // The sidebar's own Settings button is the only entry point; open it once,
  // then switch tabs by their visible label.
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /설定|설정|Settings|Einstellungen|Paramètres|設定|设置|Cài đặt|ตั้งค่า|Pengaturan|Настройки/.test(
        b.textContent ?? "",
      ),
    );
    btn?.click();
    return Boolean(btn);
  });
  if (!clicked) throw new Error("settings button not found");
  await sleep(1500);

  const TAB_LABEL = { general: ["일반", "General"], remote: ["원격", "Remote"] };
  for (const tab of process.argv[4] ? [process.argv[4]] : ["general", "remote"]) {
    const ok = await page.evaluate((labels) => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        labels.includes(b.textContent?.trim() ?? ""),
      );
      btn?.click();
      return Boolean(btn);
    }, TAB_LABEL[tab] ?? [tab]);
    if (!ok) console.warn(`tab not found: ${tab}`);
    await sleep(1100);
    const file = path.join(outDir, `settings-${tab}.png`);
    await page.screenshot({ path: file });
    console.log("wrote", file);
  }
  await browser.disconnect();
} catch (err) {
  console.error("shots failed:", err.message);
  process.exitCode = 1;
} finally {
  killApp();
}
