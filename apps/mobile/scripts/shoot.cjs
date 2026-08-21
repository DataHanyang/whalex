/**
 * Screenshots the web preview of the app at phone dimensions.
 *
 * Run the preview first:
 *   EXPO_PUBLIC_DEMO=1 pnpm expo start --web --port 8090
 * then:
 *   npx electron scripts/shoot.cjs <outDir> [url]
 *
 * Electron is already a desktop dependency, so this needs no extra tooling —
 * and it renders the same Chromium the phone's WebView-adjacent stack uses.
 */
const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const outDir = process.argv[2] || ".";
const url = process.argv[3] || "http://localhost:8090";
const WIDTH = 390;
const HEIGHT = 844;

const shots = [
  { name: "1-projects", env: {} },
  { name: "2-chat", env: { screen: "chat" } },
  { name: "3-permission", env: { screen: "chat", permission: "1" } },
  { name: "4-menu", env: { screen: "chat", menu: "1" } },
  { name: "5-pair", env: { screen: "pair" } },
];

async function capture(win, shot) {
  // The preview reads its scenario from the query string so a single bundle
  // can produce every screen without a rebuild per shot.
  const q = new URLSearchParams();
  if (shot.env.screen) q.set("screen", shot.env.screen);
  if (shot.env.permission) q.set("permission", "1");
  if (shot.env.menu) q.set("menu", "1");
  await win.loadURL(`${url}?${q.toString()}`);
  await new Promise((r) => setTimeout(r, 3500));
  const image = await win.webContents.capturePage();
  const file = path.join(outDir, `${shot.name}.png`);
  fs.writeFileSync(file, image.toPNG());
  console.log("wrote", file);
}

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    webPreferences: { offscreen: false },
  });
  win.setContentSize(WIDTH, HEIGHT);
  try {
    for (const shot of shots) await capture(win, shot);
  } catch (err) {
    console.error("capture failed:", err);
    process.exitCode = 1;
  }
  app.quit();
});
