/**
 * One-shot headless WhaleX run using the API key from the local vault.
 * Runs under Electron (needs safeStorage/DPAPI): decrypts the DeepSeek key
 * in-process and passes it to the CLI child via env — never printed.
 *
 *   apps/desktop/node_modules/.bin/electron scripts/headless-run.cjs <workdir> <promptFile>
 */
const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

app.disableHardwareAcceleration();
// safeStorage on Windows derives its key from the app's Chromium "Local State"
// — point userData at the real WhaleX profile so the vault decrypts.
app.setPath("userData", path.join(app.getPath("appData"), "@whalex", "desktop"));

app.whenReady().then(() => {
  try {
    const [workdir, promptFile] = process.argv.slice(2);
    if (!workdir || !promptFile) {
      console.error("usage: electron headless-run.cjs <workdir> <promptFile>");
      app.exit(2);
      return;
    }
    const prompt = fs.readFileSync(promptFile, "utf8").trim();
    const store = JSON.parse(
      fs.readFileSync(path.join(os.homedir(), ".whalex", "secrets.bin"), "utf8"),
    );
    const entry = store["deepseek-api-key"];
    if (!entry) {
      console.error("deepseek-api-key not found in vault");
      app.exit(3);
      return;
    }
    const buf = Buffer.from(entry.v, "base64");
    const key = entry.plain ? buf.toString("utf8") : safeStorage.decryptString(buf);

    const cliMain = path.join(__dirname, "..", "packages", "cli", "dist", "main.js");
    const child = spawn("node", [cliMain, workdir], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: undefined,
        DEEPSEEK_API_KEY: key,
        WHALEX_PROMPT: prompt,
        WHALEX_PERMISSION_MODE: "bypassPermissions",
        WHALEX_MODEL: process.env.WHALEX_MODEL || "deepseek-v4-flash",
      },
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => app.exit(code ?? 0));
    child.on("error", (err) => {
      console.error(String(err));
      app.exit(4);
    });
  } catch (err) {
    console.error(String(err));
    app.exit(5);
  }
});
