// Rewind test: agent creates a file across two turns, then /rewind restores it.
import { execFile } from "node:child_process";
import fs from "node:fs";
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
const send = () => page.evaluate(() => document.querySelector('button[aria-label="전송"], button[aria-label="Send"]').click());
const runTurn = async (prompt) => {
  await setInput(prompt);
  await sleep(150);
  await send();
  const start = Date.now();
  while (Date.now() - start < 120_000) {
    await sleep(700);
    if (await hasText("한 번 허용"))
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("한 번 허용"))?.click());
    else if (!(await hasText("중지"))) break;
  }
  await sleep(1000);
};

const target = "C:\\nginx\\whalex-testbed2\\rewind-test.txt";
try { fs.rmSync(target, { force: true }); } catch {}

// Turn 1: create the file.
await runTurn("write_file 도구로 C:/nginx/whalex-testbed2/rewind-test.txt 파일을 만들고 내용은 'VERSION-1'로 해줘.");
const afterCreate = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "(missing)";
console.log("after create:", afterCreate);

// Turn 2: modify it.
await runTurn("방금 그 파일 내용을 'VERSION-2'로 바꿔줘.");
const afterEdit = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "(missing)";
console.log("after edit:", afterEdit);

// Open /rewind and rewind to the second checkpoint (undo VERSION-2).
await setInput("/rewind");
await sleep(400);
await send();
await sleep(1000);
await shot("90-rewind-dialog");
const dialogShown = await hasText("되돌리기");
console.log("rewind dialog shown:", dialogShown);

// Click the last checkpoint (the "VERSION-2" turn) to undo it.
await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")].filter((b) => (b.textContent ?? "").includes("바꿔줘") || /#\d/.test(b.textContent ?? ""));
  const last = btns[btns.length - 1];
  last?.click();
});
await sleep(2000);
const afterRewind = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "(missing)";
console.log("after rewind:", afterRewind);

await shot("91-after-rewind");
await browser.disconnect();
const ok = afterEdit.includes("VERSION-2") && afterRewind.includes("VERSION-1");
console.log(`[RESULT] created=${afterCreate.includes("VERSION-1")} edited=${afterEdit.includes("VERSION-2")} rewound=${afterRewind.includes("VERSION-1")}`);
process.exit(ok ? 0 : 1);
