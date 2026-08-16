import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, app, nativeTheme, shell } from "electron";
import { AgentHost } from "./AgentHost.js";
import { SettingsManager } from "./settings.js";
import { SecretVault } from "./secrets.js";
import { registerIpc } from "./ipc.js";
import { Updater } from "./updater.js";
import { PreviewManager } from "./PreviewManager.js";
import { PluginManager } from "./PluginManager.js";
import { BrowserManager } from "./BrowserManager.js";
import { ComputerManager } from "./ComputerManager.js";
import { AuthManager } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal boot log — a packaged GUI app has no console, so startup failures
// are invisible without this. Kept always-on; a few lines per launch.
const bootLog = path.join(os.homedir(), ".whalex", "main.log");
function logLine(msg: string): void {
  try {
    fs.mkdirSync(path.dirname(bootLog), { recursive: true });
    fs.appendFileSync(bootLog, `${new Date().toISOString()} ${msg}\n`, "utf8");
  } catch {
    // logging must never break the app
  }
}
logLine(`boot pid=${process.pid} packaged=${app.isPackaged} version=${app.getVersion()}`);
process.on("uncaughtException", (err) => logLine(`uncaughtException: ${err.stack ?? err}`));
process.on("unhandledRejection", (reason) => logLine(`unhandledRejection: ${String(reason)}`));

// Dev/CI only: expose CDP so UI tests can drive the app like a user.
if (process.env.WHALEX_CDP_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.WHALEX_CDP_PORT);
}

// Single-instance lock so protocol deep links (auth callback) route to the
// running window instead of spawning a second process.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
AuthManager.registerProtocol();

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    // The composer control row and side panel need this much to stay intact.
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#111113" : "#fafafa",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "rgba(0,0,0,0)",
      symbolColor: nativeTheme.shouldUseDarkColors ? "#9a9aa3" : "#5c5c66",
      height: 40,
    },
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // ESM preload requires an unsandboxed renderer; contextIsolation
      // remains the security boundary.
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    logLine("ready-to-show");
    mainWindow?.show();
  });
  // Fallback: some packaged environments never fire ready-to-show reliably.
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      logLine("show fallback fired");
      mainWindow.show();
    }
  }, 3000);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) =>
    logLine(`did-fail-load ${code} ${desc} ${url}`),
  );
  mainWindow.webContents.on("did-finish-load", () => logLine("did-finish-load"));
  mainWindow.webContents.on("render-process-gone", (_e, details) =>
    logLine(`render-process-gone: ${JSON.stringify(details)}`),
  );

  // External links open in the system browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

void app.whenReady().then(() => {
  logLine("app ready");
  const settings = new SettingsManager();
  const vault = new SecretVault();
  const host = new AgentHost(() => mainWindow, settings, vault);
  const updater = new Updater(() => mainWindow);
  const preview = new PreviewManager();
  const plugins = new PluginManager(settings);
  const browser = new BrowserManager(() => mainWindow);
  browser.setActivityListener((url, title) => host.notifyBrowserNavigated(url, title));
  host.setBrowser(browser);
  host.setComputer(new ComputerManager(settings, vault));
  const auth = new AuthManager(vault);
  auth.wire(() => mainWindow);

  registerIpc({ getWindow: () => mainWindow, host, settings, vault, updater, preview, plugins, browser, auth });
  createWindow();
  logLine("window created");

  // MCP servers connect in the background; the UI shows their status live.
  void host.init().catch((err) => logLine(`mcp init: ${String(err)}`));
  if (app.isPackaged) updater.start();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on("before-quit", () => {
    host.disposeAll();
    preview.stopAll();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
