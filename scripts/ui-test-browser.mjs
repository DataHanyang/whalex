// Browser-use test: agent opens a local page, reads DOM, reports elements.
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

await setInput(
  "browser_navigate 도구로 file:///C:/nginx/whalex-testbed2/calculator.html 을 열고, browser_read_page로 페이지를 읽어서 버튼이 몇 개 보이는지 알려줘.",
);
await sleep(200);
await page.evaluate(() => document.querySelector('button[aria-label="전송"], button[aria-label="Send"]').click());
console.log("[sent] browser request");

let browserPanel = false;
let navigated = false;
const start = Date.now();
while (Date.now() - start < 180_000) {
  await sleep(1000);
  if (await hasText("한 번 허용")) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("한 번 허용"));
      b?.click();
    });
  }
  if (await hasText("browser_navigate")) navigated = true;
  if (await hasText("browser_read_page")) {
    if (!browserPanel) {
      browserPanel = true;
      await sleep(1500);
      await shot("70-browser-use");
      console.log("[browser tools used]");
    }
  }
  if (!(await hasText("중지"))) break;
}
await sleep(1500);
await shot("71-browser-done");
console.log(`[RESULT] navigated=${navigated} readPage=${browserPanel}`);
await browser.disconnect();
process.exit(navigated ? 0 : 1);
