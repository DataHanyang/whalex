// Drives a real SuperCode workflow through the UI and captures the progress panel.
import { execFile } from "node:child_process";
import puppeteer from "puppeteer-core";

const shotsDir = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (name) =>
  new Promise((resolve) =>
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/ps/capture.ps1", `${shotsDir}\\${name}.png`],
      () => resolve(),
    ),
  );

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes("5173"));
await sleep(600);

const setInput = (v) =>
  page.evaluate((val) => {
    const ta = document.querySelector("textarea");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, val);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);
const hasText = (t) => page.evaluate((x) => document.body.innerText.includes(x), t);

// Enable SuperCode, then ask for a parallel task.
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "SuperCode");
  btn?.click();
});
await sleep(400);
await setInput(
  "슈퍼코드로 진행해줘. 3개의 에이전트를 병렬로 띄워서 각각 '좋은 코딩 습관' 한 가지씩 제안하게 하고, 결과를 종합해줘.",
);
await sleep(200);
await page.evaluate(() => document.querySelector('button[aria-label="전송"], button[aria-label="Send"]').click());
console.log("[sent] supercode request");

let sawWorkflow = false;
const start = Date.now();
while (Date.now() - start < 240_000) {
  await sleep(1000);
  if (await hasText("한 번 허용")) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("한 번 허용"));
      b?.click();
    });
  }
  if (await hasText("SuperCode:")) {
    if (!sawWorkflow) {
      sawWorkflow = true;
      await shot("60-supercode-running");
      console.log("[workflow panel visible]");
    }
  }
  if (!(await hasText("중지"))) break;
}
await sleep(1500);
await shot("61-supercode-done");
const done = await hasText("완료");
console.log(`[RESULT] workflowPanel=${sawWorkflow} completed=${done}`);
await browser.disconnect();
process.exit(sawWorkflow ? 0 : 1);
