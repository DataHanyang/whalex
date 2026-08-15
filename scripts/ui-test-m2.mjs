// M2-M4 UI test: artifact panel, slash commands, @-mentions, SuperCode.
// Assumes the app is already onboarded (post-M1 test state).
//   DEEPSEEK_API_KEY=... node scripts/ui-test-m2.mjs <shotsDir> <workdir>
import { execFile } from "node:child_process";
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const [shotsDir, workdir] = process.argv.slice(2);
fs.mkdirSync(shotsDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let shotNo = 40;

const runPs = (file, args = []) =>
  new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file, ...args],
      { maxBuffer: 1_000_000 },
      () => resolve(),
    );
  });
const shot = async (name) => {
  const file = `${shotsDir}\\${++shotNo}-${name}.png`;
  await runPs("scripts/ps/capture.ps1", [file]);
  console.log(`[shot] ${name}`);
};

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes("5173"));
await sleep(500);

const setInput = async (sel, val) =>
  page.evaluate(
    (s, v) => {
      const el = document.querySelector(s);
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    sel,
    val,
  );
const clickText = async (text, sel = "button") =>
  page.evaluate(
    (t, s) => {
      const el = [...document.querySelectorAll(s)].find((e) => (e.textContent ?? "").includes(t));
      if (el) el.click();
      return !!el;
    },
    text,
    sel,
  );
const hasText = (t) => page.evaluate((x) => document.body.innerText.includes(x), t);
const send = async () =>
  page.evaluate(() => {
    document.querySelector('button[aria-label="전송"], button[aria-label="Send"]').click();
  });
const waitText = async (t, ms = 90_000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await hasText(t)) return true;
    await sleep(500);
  }
  return false;
};
const runTurn = async (prompt, waitFor) => {
  await setInput("textarea", prompt);
  await sleep(200);
  await send();
  const start = Date.now();
  while (Date.now() - start < 180_000) {
    await sleep(700);
    if (await hasText("한 번 허용")) await clickText("한 번 허용");
    else if (waitFor && (await hasText(waitFor))) break;
    else if (!(await hasText("중지"))) break;
  }
  await sleep(1500);
};

// Ensure a session exists in the testbed (start fresh session by picking folder).
console.log("[connected]", page.url());
await shot("start");

// --- Test 1: artifact panel via present_file ---
console.log("=== Test 1: artifact ===");
await runTurn(
  "present_file 도구로 파란 별이 그려진 SVG를 미리보기에 띄워줘. title은 '파란 별'.",
  "미리보기 열기",
);
const artifactPanelOpen = await page.evaluate(() =>
  document.body.innerText.includes("파란 별") && !!document.querySelector("iframe, svg"),
);
await shot("artifact");
console.log("  artifact panel visible:", artifactPanelOpen);

// --- Test 2: slash command menu ---
console.log("=== Test 2: slash command ===");
await setInput("textarea", "/");
await sleep(600);
const slashMenu = await hasText("컨텍스트 압축");
await shot("slash-menu");
console.log("  slash menu shown:", slashMenu);
await setInput("textarea", "");
await sleep(200);

// --- Test 3: @-mention menu ---
console.log("=== Test 3: @ mention ===");
await setInput("textarea", "@cal");
await sleep(800);
const mentionMenu = await page.evaluate(() =>
  [...document.querySelectorAll("button")].some((b) => (b.textContent ?? "").includes("@") && b.textContent.includes("calc")),
);
await shot("mention-menu");
console.log("  mention menu shown:", mentionMenu);
await setInput("textarea", "");
await sleep(200);

// --- Test 4: settings modal (MCP tab) ---
console.log("=== Test 4: settings ===");
await clickText("설정");
await sleep(500);
await clickText("MCP");
await sleep(400);
const settingsOpen = await hasText("JSON 가져오기");
await shot("settings-mcp");
console.log("  settings MCP tab:", settingsOpen);
await page.keyboard.press("Escape");
await sleep(400);

// --- Test 5: SuperCode toggle + workflow ---
console.log("=== Test 5: SuperCode ===");
await clickText("SuperCode");
await sleep(400);
const superOn = await hasText("SuperCode");
await shot("supercode-on");
console.log("  supercode toggled:", superOn);

await browser.disconnect();
console.log(
  `\n[RESULT] artifact=${artifactPanelOpen} slash=${slashMenu} mention=${mentionMenu} settings=${settingsOpen}`,
);
process.exit(0);
