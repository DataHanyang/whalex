// End-to-end demo: build a polished single-file web app and preview it.
import { execFile } from "node:child_process";
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const shotsDir = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runPs = (file, args = []) =>
  new Promise((resolve) =>
    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file, ...args], () => resolve()),
  );
const shot = async (name) => {
  await runPs("scripts/ps/capture.ps1", [`${shotsDir}\\${name}.png`]);
  console.log(`[shot] ${name}`);
};

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

// Switch the session to the fresh demo folder via the folder picker.
await runPs("scripts/ps/close-dialogs.ps1");
const picker = runPs("scripts/ps/pickfolder.ps1", ["C:\\nginx\\whalex-demo"]);
await page.evaluate(() => {
  const b = [...document.querySelectorAll("aside button")].find((x) => (x.textContent ?? "").includes("whalex") || (x.textContent ?? "").match(/^\s*[A-Za-z]/));
  // Click the folder button (first button in the sidebar header area).
  const folderBtn = document.querySelector("aside button");
  folderBtn?.click();
});
await picker;
await sleep(1500);
console.log("[folder] switched to demo folder:", await hasText("whalex-demo"));

const prompt =
  "이 폴더에 pomodoro.html 이라는 단일 파일로 뽀모도로 타이머 웹앱을 만들어줘. " +
  "요구사항: 25분 집중/5분 휴식 전환, 시작·일시정지·리셋 버튼, 남은 시간 큰 숫자 표시, " +
  "진행 원형 프로그레스, 다크 테마의 세련된 디자인, 완료 시 부드러운 알림. " +
  "만든 뒤 present_file로 미리보기에 띄워줘.";

await setInput(prompt);
await sleep(200);
await send();
console.log("[sent] build request");

const start = Date.now();
let approvals = 0;
while (Date.now() - start < 240_000) {
  await sleep(1000);
  if (await hasText("한 번 허용")) {
    await page.evaluate(() =>
      [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("한 번 허용"))?.click(),
    );
    approvals++;
  } else if (await hasText("미리보기 열기") || (await hasText("present_file"))) {
    // artifact created
    if (!(await hasText("중지"))) break;
  } else if (!(await hasText("중지"))) break;
}
await sleep(3000);
await shot("100-pomodoro-demo");

const built = fs.existsSync("C:\\nginx\\whalex-demo\\pomodoro.html");
const size = built ? fs.statSync("C:\\nginx\\whalex-demo\\pomodoro.html").size : 0;
console.log(`[RESULT] built=${built} size=${size} approvals=${approvals}`);
await browser.disconnect();
process.exit(built ? 0 : 1);
