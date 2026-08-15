// Drives the Whalex desktop app over CDP like a real user: onboarding →
// API key → folder pick (native dialog via SendKeys) → chat → approvals.
//   WHALEX_CDP_PORT=9222 pnpm dev   (app must be running)
//   DEEPSEEK_API_KEY=... node scripts/ui-test.mjs <shots-dir> <workdir> "<prompt>"
import { execFile } from "node:child_process";
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const [shotsDir, workdir, prompt] = process.argv.slice(2);
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!shotsDir || !workdir || !prompt || !apiKey) {
  console.error("usage: DEEPSEEK_API_KEY=... node scripts/ui-test.mjs <shotsDir> <workdir> <prompt>");
  process.exit(1);
}
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(workdir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let shotNo = 0;

const runPs = (file, args = []) =>
  new Promise((resolve) => {
    const child = execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file, ...args],
      { maxBuffer: 1_000_000 },
      (err, stdout, stderr) => resolve({ err, stdout, stderr }),
    );
    child.on("error", () => resolve({ err: new Error("spawn failed") }));
  });

// Electron's CDP captureScreenshot hangs on occluded windows — capture the
// real window via GDI instead (also brings it to the foreground, which the
// native-dialog automation needs anyway).
const shot = async (_page, name) => {
  const file = `${shotsDir}\\${String(++shotNo).padStart(2, "0")}-${name}.png`;
  const { stderr } = await runPs("scripts/ps/capture.ps1", [file]);
  console.log(`[shot] ${file}${stderr ? ` (capture error: ${String(stderr).slice(0, 120)})` : ""}`);
};

// Focus-independent input: set the value through the native setter and fire
// an 'input' event so React's onChange runs even when the window is backgrounded.
const setInputValue = async (page, selector, value) => {
  const len = await page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return -1;
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return el.value.length;
    },
    selector,
    value,
  );
  if (len !== value.length) throw new Error(`setInputValue failed for ${selector} (len=${len})`);
  console.log(`[input] ${selector} ← ${value.length} chars`);
};

const clickByText = async (page, selector, text) => {
  const ok = await page.evaluate(
    (sel, t) => {
      const els = [...document.querySelectorAll(sel)];
      const el = els.find((e) => (e.textContent ?? "").trim().includes(t));
      if (el) {
        el.click();
        return true;
      }
      return false;
    },
    selector,
    text,
  );
  if (!ok) throw new Error(`clickByText failed: ${selector} "${text}"`);
  console.log(`[click] "${text}"`);
};

const waitForText = async (page, text, timeoutMs = 30_000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await page.evaluate((t) => document.body.innerText.includes(t), text);
    if (found) return;
    await sleep(300);
  }
  throw new Error(`waitForText timeout: "${text}"`);
};

const hasText = (page, text) =>
  page.evaluate((t) => document.body.innerText.includes(t), text);

// ---- connect ----
let browser = null;
for (let i = 0; i < 30 && !browser; i++) {
  try {
    browser = await puppeteer.connect({
      browserURL: "http://127.0.0.1:9222",
      defaultViewport: null,
    });
  } catch {
    await sleep(1000);
  }
}
if (!browser) {
  console.error("Could not connect to CDP on :9222 — is the app running with WHALEX_CDP_PORT?");
  process.exit(1);
}
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("localhost:5173")) ?? pages[0];
console.log(`[connected] ${page.url()}`);
await sleep(1000);

// ---- onboarding (resumable from any step) ----
{
  const start = Date.now();
  while (Date.now() - start < 20_000) {
    const len = await page.evaluate(() => document.body.innerText.trim().length);
    if (len > 10) break;
    await sleep(300);
  }
}
await shot(page, "welcome");
if (await hasText(page, "시작하기")) {
  await clickByText(page, "button", "시작하기");
  await sleep(400);
}
if (await hasText(page, "API 키 연결")) {
  await page.waitForSelector('input[type="password"]', { timeout: 10_000 });
  await shot(page, "apikey-empty");
  await setInputValue(page, 'input[type="password"]', apiKey);
  await sleep(200);
  await clickByText(page, "button", "연결 확인");
  await waitForText(page, "연결 성공", 30_000);
  await shot(page, "apikey-verified");
  await clickByText(page, "button", "다음");
  await sleep(400);
}
if (await hasText(page, "작업 폴더 선택")) {
  // Native dialog driven with UI Automation.
  await shot(page, "folder-step");
  const picker = runPs("scripts/ps/pickfolder.ps1", [workdir]);
  await clickByText(page, "button", "폴더 선택");
  const pickResult = await picker;
  console.log(
    `[dialog] ${String(pickResult.stdout ?? "").trim()} ${String(pickResult.stderr ?? "").slice(0, 200)}`,
  );
  await sleep(1200);
  await shot(page, "folder-picked");
  const folderShown = await hasText(page, workdir.split("\\").pop());
  if (!folderShown) throw new Error("Folder was not picked — dialog automation failed");
  await clickByText(page, "button", "Whalex 시작");
  await waitForText(page, "무엇이든 시켜보세요", 15_000);
}
await shot(page, "appshell");

// ---- chat ----
await page.waitForSelector("textarea", { timeout: 10_000 });
await setInputValue(page, "textarea", prompt);
await shot(page, "prompt-typed");
await page.evaluate(() => {
  const btn = document.querySelector('button[aria-label="전송"], button[aria-label="Send"]');
  if (!btn) throw new Error("send button not found");
  btn.click();
});
console.log("[sent] prompt");

// ---- approve permissions until done ----
const start = Date.now();
let approvals = 0;
let doneIdle = 0;
while (Date.now() - start < 300_000) {
  await sleep(700);
  if (await hasText(page, "한 번 허용")) {
    await shot(page, `permission-${approvals + 1}`);
    await clickByText(page, "button", "한 번 허용");
    approvals++;
    await sleep(500);
    continue;
  }
  // Turn is over when the stop button is gone and status is idle.
  const running = await hasText(page, "중지");
  if (!running) {
    doneIdle++;
    if (doneIdle >= 3) break;
  } else {
    doneIdle = 0;
  }
}
await sleep(1000);
await shot(page, "final");
console.log(`[done] approvals=${approvals} elapsed=${((Date.now() - start) / 1000).toFixed(0)}s`);
await browser.disconnect();
process.exit(0);
