/**
 * One-shot: store a vision API key in the WhaleX vault (DPAPI via the app's
 * own safeStorage profile) and point settings.vision at an endpoint/model.
 * Key comes from env WHALEX_SET_VISION_KEY — never from argv, never printed.
 *
 *   WHALEX_SET_VISION_KEY=... electron scripts/set-vision.cjs <baseUrl> <model>
 */
const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

app.disableHardwareAcceleration();
app.setPath("userData", path.join(app.getPath("appData"), "@whalex", "desktop"));

const dbg = (m) => fs.appendFileSync(path.join(os.tmpdir(), "set-vision-dbg.log"), m + "\n");
dbg("boot " + new Date().toISOString());
process.on("uncaughtException", (e) => { dbg("uncaught: " + (e.stack ?? e)); app.exit(9); });

app.whenReady().then(() => {
  dbg("ready");
  try {
    // Everything via env: Electron intercepts an https:// argv entry as a URL
    // to open and never runs the script.
    const baseUrl = process.env.WHALEX_SET_VISION_URL;
    const model = process.env.WHALEX_SET_VISION_MODEL;
    const key = process.env.WHALEX_SET_VISION_KEY;
    if (!baseUrl || !model || !key) {
      console.error("set WHALEX_SET_VISION_URL / _MODEL / _KEY env vars");
      app.exit(2);
      return;
    }
    const home = path.join(os.homedir(), ".whalex");
    const secretsFile = path.join(home, "secrets.bin");
    const store = fs.existsSync(secretsFile) ? JSON.parse(fs.readFileSync(secretsFile, "utf8")) : {};
    if (!safeStorage.isEncryptionAvailable()) throw new Error("safeStorage unavailable");
    store["vision-api-key"] = { v: safeStorage.encryptString(key).toString("base64") };
    fs.writeFileSync(secretsFile, JSON.stringify(store), "utf8");

    const settingsFile = path.join(home, "settings.json");
    const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    settings.vision = { ...settings.vision, baseUrl, model, apiKeyRef: "vision-api-key" };
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), "utf8");
    console.log(`vision configured: ${baseUrl} / ${model} (key stored encrypted)`);
    app.exit(0);
  } catch (err) {
    console.error(String(err));
    app.exit(1);
  }
});
