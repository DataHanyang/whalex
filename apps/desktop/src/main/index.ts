import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  app,
  nativeTheme,
  powerMonitor,
  protocol,
  shell,
} from "electron";
import { AgentHost } from "./AgentHost.js";
import { injectCanvasHost, wantsCanvasMode } from "./canvasHost.js";
import { SettingsManager } from "./settings.js";
import { SecretVault } from "./secrets.js";
import { registerIpc } from "./ipc.js";
import { Updater } from "./updater.js";
import { PreviewManager } from "./PreviewManager.js";
import { PluginManager } from "./PluginManager.js";
import { BrowserManager } from "./BrowserManager.js";
import { ComputerManager } from "./ComputerManager.js";
import { AuthManager } from "./auth.js";
import { RoutineManager } from "./RoutineManager.js";
import { UsageLedger } from "./UsageLedger.js";
import { RemoteBridge } from "./remote/RemoteBridge.js";

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
// A second window for side-by-side sessions: WHALEX_INSTANCE isolates the
// Electron userData (and its single-instance lock); ~/.whalex stays shared.
if (process.env.WHALEX_INSTANCE) {
  const primaryUserData = app.getPath("userData");
  const instanceDir = path.join(primaryUserData, `instance-${process.env.WHALEX_INSTANCE}`);
  // safeStorage (Chromium OSCrypt) keeps its AES key in userData/"Local
  // State". A fresh instance dir would mint its OWN key, and the shared
  // ~/.whalex/secrets.bin — encrypted under the primary key — would silently
  // stop decrypting: second windows ran keyless. Seed every instance with the
  // primary key file so all instances read and write the same vault.
  try {
    const src = path.join(primaryUserData, "Local State");
    if (fs.existsSync(src)) {
      fs.mkdirSync(instanceDir, { recursive: true });
      // Overwrite on every boot: an instance that once minted its own key
      // must be pulled back onto the primary key, not left diverged.
      fs.copyFileSync(src, path.join(instanceDir, "Local State"));
    }
  } catch (err) {
    // Worst case the instance mints a fresh key and API keys need re-entering
    // there — boot must not fail over vault seeding.
    logLine(`instance Local State seed failed: ${String(err)}`);
  }
  app.setPath("userData", instanceDir);
}
if (!app.requestSingleInstanceLock()) {
  // app.quit() is async and doesn't stop this script — whenReady would still
  // fire and boot a second full app. Exit synchronously instead.
  logLine("second instance — exiting");
  app.exit(0);
}
AuthManager.registerProtocol();

// HTML artifacts are served from their own isolated origin instead of an
// iframe srcdoc. A srcdoc document inherits the app window's strict CSP
// (default-src 'self'), which blocks the CDN scripts/textures three.js-style
// artifacts need — the "LOADING…" hang. Served from whalex-artifact:// the
// document carries no such CSP (CDNs load) AND lives cross-origin from the
// privileged renderer, so its scripts can't reach window.parent.whalex.
// Must be declared before app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "whalex-artifact",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

function createTray(): void {
  if (tray) return;
  const iconPath = path.join(__dirname, "../../build/icon.png");
  try {
    tray = new Tray(iconPath);
  } catch {
    return; // no tray on this platform/session — closing will quit as before
  }
  tray.setToolTip("WhaleX");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open WhaleX", click: () => showWindow() },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", () => showWindow());
}

function showWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

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
    // Windows caption buttons drawn as an overlay on the right; ignored on
    // macOS/Linux (they have no such overlay).
    titleBarOverlay: {
      color: "rgba(0,0,0,0)",
      symbolColor: nativeTheme.shouldUseDarkColors ? "#9a9aa3" : "#5c5c66",
      height: 40,
    },
    // macOS: center the traffic lights in the 40px-tall custom title bar
    // (otherwise they sit too high). The renderer insets its logo to clear
    // them — see AppShell's mac padding.
    ...(process.platform === "darwin"
      ? { trafficLightPosition: { x: 14, y: 13 } }
      : {}),
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
  // Closing the window keeps the app (and any running agents) alive in the
  // tray; only the tray's Quit or OS shutdown actually exits.
  mainWindow.on("close", (e) => {
    if (!quitting && tray) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
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

  // Waking up doesn't revive the sockets that died on suspend; a turn caught
  // mid-stream would hang on "thinking" with nothing left to deliver.
  powerMonitor.on("resume", () => {
    logLine("system resumed — settling any turn that was in flight");
    host.onSystemResume();
  });

  // Serve HTML artifacts by id from the in-process cache (see the privileged
  // scheme registration above). Only html artifacts with content are served;
  // anything else 404s.
  protocol.handle("whalex-artifact", (request) => {
    const url = new URL(request.url);
    const id = decodeURIComponent(url.pathname.replace(/^\//, "")) || url.hostname;
    const art = host.getArtifact(id);
    if (!art || art.kind !== "html" || !art.content) {
      return new Response("Artifact not found", { status: 404, headers: { "content-type": "text/plain" } });
    }
    // Design-canvas opt-in: documents declaring design_doc_mode=canvas get the
    // pan/zoom host injected, so option stacks wider than the viewport stay
    // navigable (see the design pack's `options` skill).
    const content = wantsCanvasMode(art.content) ? injectCanvasHost(art.content) : art.content;
    return new Response(content, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  });

  const updater = new Updater(() => mainWindow);
  updater.log = logLine;
  const preview = new PreviewManager();
  const plugins = new PluginManager(settings);
  host.pluginSkillDirs = () => plugins.skillDirs();
  // Default skill pack shipped with the app (Settings → Skills can switch
  // individual ones off). Packaged builds carry it via extraResources.
  host.bundledSkillsDir = () =>
    app.isPackaged
      ? path.join(process.resourcesPath, "bundled-skills")
      : path.join(__dirname, "../../resources/bundled-skills");
  const browser = new BrowserManager(() => mainWindow);
  browser.setActivityListener((url, title, tabs, activeTabId) =>
    host.notifyBrowserNavigated(url, title, tabs, activeTabId),
  );
  host.setBrowser(browser);
  host.setComputer(new ComputerManager(settings, vault));
  // view_image: route local image files through the vision sidecar. Reads the
  // vision settings at call time so a mid-session settings change applies to
  // the next session without a restart.
  host.describeImage = async (dataUrl, question) => {
    const v = settings.get().vision;
    if (!v.baseUrl || !v.model) throw new Error("No vision model configured.");
    const { VisionBridge } = await import("@whalex/core");
    return new VisionBridge({
      baseUrl: v.baseUrl,
      model: v.model,
      apiKey: vault.get(v.apiKeyRef),
    }).describe(dataUrl, question);
  };
  const auth = new AuthManager(vault);
  auth.wire(() => mainWindow);
  // Routines fire while the app is tray-resident too — that's the point.
  const routines = new RoutineManager(settings, host);
  routines.start();

  // Mobile remote-control bridge — inert until settings.remoteBridge.enabled.
  const bridge = new RemoteBridge({
    settings,
    vault,
    getWindow: () => mainWindow,
    version: app.getVersion(),
    log: logLine,
    // Shipped via extraResources so a bare machine needs no extra download.
    bundledCloudflared: () =>
      path.join(
        app.isPackaged
          ? path.join(process.resourcesPath, "cloudflared")
          : path.join(__dirname, "../../resources/cloudflared"),
        process.platform === "win32" ? "cloudflared.exe" : "cloudflared",
      ),
  });
  host.addEnvelopeSink((batch) => bridge.broadcast(batch));

  const usage = new UsageLedger(settings);
  host.usageLedger = usage;
  usage.onWarning = (w) => {
    // Surface in-app (status bar banner) and as an OS toast — a spend alert
    // is exactly the kind of thing that must reach a tray-resident app's user.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("usage:warning", w);
    }
    if (Notification.isSupported()) {
      const body =
        w.kind === "balance"
          ? `Balance low: ${w.usd.toFixed(2)} (threshold ${w.limit.toFixed(2)})`
          : `${w.kind === "daily" ? "Daily" : "Monthly"} spend $${w.usd.toFixed(2)} — ${w.pct}% of your $${w.limit.toFixed(2)} limit`;
      new Notification({ title: "WhaleX usage", body }).show();
    }
    bridge.broadcastUsageWarning(w);
  };

  const handlers = registerIpc({ getWindow: () => mainWindow, host, settings, vault, updater, preview, plugins, browser, auth, routines, usage, bridge });
  bridge.setHandlers(handlers);
  bridge.applySettings();
  createWindow();
  createTray();
  // Relaunching the app (e.g. from the Start menu) while it sits in the tray
  // restores the hidden window instead of spawning a second instance.
  app.on("second-instance", () => showWindow());
  logLine("window created");

  // MCP servers connect in the background; the UI shows their status live.
  void host.init().catch((err) => logLine(`mcp init: ${String(err)}`));
  if (app.isPackaged) updater.start();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // One-shot: hold the quit until dev-server trees are killed (bounded at 3s),
  // otherwise they end up orphaned on Windows and squat the ports.
  let cleanupDone = false;
  const shutdownCleanup = async (opts?: { keepTunnel?: boolean }) => {
    bridge.stop({ keepTunnel: opts?.keepTunnel });
    routines.stop();
    usage.flush();
    host.disposeAll();
    await Promise.race([preview.stopAll(), new Promise((r) => setTimeout(r, 3000))]);
  };
  app.on("before-quit", (e) => {
    quitting = true;
    if (cleanupDone) return;
    cleanupDone = true;
    e.preventDefault();
    void shutdownCleanup().finally(() => app.quit());
  });
  // The updater runs the same cleanup BEFORE handing off to the installer;
  // with cleanupDone already set, its app.quit() sails through un-prevented
  // and the installer never sees a lingering process.
  updater.prepareShutdown = async () => {
    quitting = true;
    if (cleanupDone) return;
    cleanupDone = true;
    // The app is coming straight back: keep the tunnel so its public address
    // survives the update and paired phones stay pointed at the right place.
    await shutdownCleanup({ keepTunnel: true });
  };
});

app.on("window-all-closed", () => {
  // Stay resident: background work continues until the user quits from the
  // tray (or the machine shuts down).
  if (!tray && process.platform !== "darwin") app.quit();
});
