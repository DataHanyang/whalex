// CI smoke test: boot the BUILT desktop app against a throwaway profile and
// assert the shell actually renders — sidebar, project group, composer.
// Catches "the app doesn't even open" regressions that typecheck can't see.
//
//   pnpm --filter @whalex/desktop build && node scripts/ui-smoke.mjs
//
// Requires no API key: the seeded profile skips onboarding and the assertions
// stop short of running a turn.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CDP_PORT = 9231;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- throwaway profile -------------------------------------------------------
const iso = fs.mkdtempSync(path.join(os.tmpdir(), "whalex-smoke-"));
const project = path.join(iso, "project");
fs.mkdirSync(project, { recursive: true });
fs.mkdirSync(path.join(iso, "AppData", "Roaming"), { recursive: true });
fs.mkdirSync(path.join(iso, "AppData", "Local"), { recursive: true });

const home = path.join(iso, ".whalex");
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(
  path.join(home, "settings.json"),
  JSON.stringify({ onboardingComplete: true, language: "en", theme: "light", defaultCwd: project }),
);

// Mirror of packages/core sanitizeCwd so the seeded session lands where list() looks.
function sanitizeCwd(cwd) {
  const resolved = path.resolve(cwd);
  const canonical = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 12);
  const base = (path.basename(canonical).replace(/[^a-zA-Z0-9가-힣_-]/g, "-").slice(0, 40)) || "root";
  return `${base}-${hash}`;
}
{
  const dir = path.join(home, "projects", sanitizeCwd(project));
  fs.mkdirSync(dir, { recursive: true });
  const id = randomUUID();
  const t = Date.now() - 60_000;
  fs.writeFileSync(
    path.join(dir, `${id}.jsonl`),
    [
      JSON.stringify({ type: "meta", sessionId: id, cwd: project, createdAt: t, title: "New session" }),
      JSON.stringify({ type: "user", id: randomUUID(), text: "smoke", ts: t + 1 }),
      JSON.stringify({ type: "assistant", id: randomUUID(), text: "ok", reasoning: "", toolCalls: [], ts: t + 2 }),
      JSON.stringify({ type: "title", title: "Smoke session", ts: t + 3 }),
    ].join("\n") + "\n",
  );
}

// --- launch the built app ----------------------------------------------------
const desktop = path.join(root, "apps", "desktop");
if (!fs.existsSync(path.join(desktop, "out", "main"))) {
  console.error("No build output — run `pnpm --filter @whalex/desktop build` first.");
  process.exit(1);
}
// pnpm hoists the electron bin to the workspace root; older layouts kept it
// under apps/desktop. Take whichever exists.
const binName = process.platform === "win32" ? "electron.CMD" : "electron";
const electronBin = [
  path.join(root, "node_modules", ".bin", binName),
  path.join(desktop, "node_modules", ".bin", binName),
].find((p) => fs.existsSync(p));
if (!electronBin) {
  console.error("electron binary not found in node_modules/.bin");
  process.exit(1);
}
const child = spawn(electronBin, ["."], {
  cwd: desktop,
  shell: process.platform === "win32", // .cmd shims need a shell
  env: {
    ...process.env,
    USERPROFILE: iso,
    HOME: iso,
    APPDATA: path.join(iso, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(iso, "AppData", "Local"),
    XDG_CONFIG_HOME: path.join(iso, "AppData", "Roaming"),
    WHALEX_CDP_PORT: String(CDP_PORT),
    ELECTRON_DISABLE_SANDBOX: "1",
  },
  stdio: "ignore",
});

function killApp() {
  if (child.pid) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: false });
    } else {
      child.kill("SIGKILL");
    }
  }
}

// --- assertions --------------------------------------------------------------
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
};

try {
  let browser = null;
  for (let i = 0; i < 60 && !browser; i++) {
    await sleep(1000);
    browser = await puppeteer
      .connect({ browserURL: `http://127.0.0.1:${CDP_PORT}`, defaultViewport: null })
      .catch(() => null);
  }
  if (!browser) throw new Error("CDP endpoint never came up — app failed to boot");

  const pageErrors = [];
  let page = null;
  for (let i = 0; i < 30 && !page; i++) {
    const pages = await browser.pages();
    page = pages.find((p) => /index\.html|localhost/.test(p.url())) ?? pages[0] ?? null;
    if (!page) await sleep(1000);
  }
  if (!page) throw new Error("renderer page never appeared");
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // Wait for React to mount; one reload as a slow-disk fallback.
  const mounted = async () =>
    page.evaluate(() => (document.getElementById("root")?.childElementCount ?? 0) > 0).catch(() => false);
  let ok = false;
  for (let i = 0; i < 20 && !ok; i++) {
    ok = await mounted();
    if (!ok) await sleep(500);
  }
  if (!ok) {
    await page.reload({ waitUntil: "load" }).catch(() => {});
    await sleep(3000);
    ok = await mounted();
  }
  check("renderer mounts", ok);

  // The sidebar refreshes its session list on a 10s tick — poll past one tick
  // before concluding the seeded session is missing.
  const readState = () =>
    page.evaluate(() => ({
      sidebarButtons: document.querySelectorAll("aside button").length,
      projectGroups: document.querySelectorAll(".group\\/proj").length,
      composer: !!document.querySelector("textarea"),
      text: document.body.innerText.slice(0, 2000),
    }));
  let state = await readState();
  for (let i = 0; i < 14 && state.projectGroups === 0; i++) {
    await sleep(1000);
    state = await readState();
  }
  check("sidebar renders with buttons", state.sidebarButtons >= 2);
  check("seeded project group is listed", state.projectGroups >= 1);
  check("per-project new-session + is present", state.projectGroups >= 1 && state.sidebarButtons >= 3);
  check("composer input exists", state.composer);
  check("seeded session title visible", state.text.includes("Smoke session"));
  check("no renderer page errors", pageErrors.length === 0);
  if (pageErrors.length) console.error(pageErrors.join("\n"));
  if (failures > 0) {
    console.error("--- sidebar text ---\n" + state.text);
    console.error("--- seeded store ---");
    for (const d of fs.readdirSync(path.join(home, "projects"), { recursive: true })) console.error(String(d));
  }

  await browser.disconnect();
} catch (err) {
  console.error(String(err));
  failures++;
} finally {
  killApp();
  await sleep(1500);
  // GPU caches under the throwaway LOCALAPPDATA can stay locked briefly;
  // best-effort cleanup, never fail the run over it.
  try {
    fs.rmSync(iso, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    console.error(`profile left behind (locked): ${iso}`);
  }
}

console.log(failures === 0 ? "SMOKE OK" : `SMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
