// Resumes the previous session from the sidebar and sends a follow-up
// request, approving permissions as they appear.
import { execFile } from "node:child_process";
import puppeteer from "puppeteer-core";

const [shotsDir, followUp] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let shotNo = 10;

const runPs = (file, args = []) =>
  new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file, ...args],
      { maxBuffer: 1_000_000 },
      (err, stdout, stderr) => resolve({ err, stdout, stderr }),
    );
  });
const shot = async (name) => {
  const file = `${shotsDir}\\${String(++shotNo)}-${name}.png`;
  await runPs("scripts/ps/capture.ps1", [file]);
  console.log(`[shot] ${file}`);
};

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});
const page = (await browser.pages()).find((p) => p.url().includes("5173"));
await sleep(500);

// Click the previous session in the sidebar (resume).
const resumed = await page.evaluate(() => {
  const items = [...document.querySelectorAll("aside button")];
  const item = items.find((b) => (b.textContent ?? "").includes("계산기"));
  if (item) {
    item.click();
    return true;
  }
  return false;
});
if (!resumed) throw new Error("previous session not found in sidebar");
console.log("[resume] clicked previous session");
await sleep(1500);

const hasHistory = await page.evaluate(() =>
  document.body.innerText.includes("calculator.html"),
);
console.log(`[resume] transcript restored: ${hasHistory}`);
await shot("resumed-transcript");

// Send the follow-up.
await page.evaluate((val) => {
  const ta = document.querySelector("textarea");
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, val);
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}, followUp);
await page.evaluate(() => {
  document.querySelector('button[aria-label="전송"], button[aria-label="Send"]').click();
});
console.log("[sent] follow-up");

const start = Date.now();
let approvals = 0;
let idle = 0;
while (Date.now() - start < 300_000) {
  await sleep(700);
  const state = await page.evaluate(() => ({
    permission: document.body.innerText.includes("한 번 허용"),
    running: document.body.innerText.includes("중지"),
  }));
  if (state.permission) {
    await shot(`resume-permission-${approvals + 1}`);
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        (b.textContent ?? "").includes("한 번 허용"),
      );
      btn?.click();
    });
    approvals++;
    console.log(`[approve] #${approvals}`);
    await sleep(500);
    continue;
  }
  if (!state.running) {
    if (++idle >= 3) break;
  } else idle = 0;
}
await sleep(800);
await shot("resume-final");
const tail = await page.evaluate(() => document.body.innerText.slice(-500));
console.log("[tail]", tail.replace(/\n+/g, " | "));
await browser.disconnect();
