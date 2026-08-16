import { app, dialog, ipcMain, shell, type BrowserWindow } from "electron";
import { OpenAICompatProvider, SessionStore, VisionBridge, searchFiles } from "@whalex/core";
import {
  IPC_INVOKE,
  type IpcInvokeChannel,
  type IpcRequest,
  type IpcResponse,
} from "@whalex/shared";
import type { AgentHost } from "./AgentHost.js";
import type { SettingsManager } from "./settings.js";
import type { SecretVault } from "./secrets.js";
import type { Updater } from "./updater.js";
import type { PreviewManager } from "./PreviewManager.js";
import type { PluginManager } from "./PluginManager.js";
import type { AuthManager } from "./auth.js";
import { EDITION, isCloud, CLOUD_CONFIG } from "./edition.js";

type Handlers = {
  [C in IpcInvokeChannel]: (req: IpcRequest<C>) => Promise<IpcResponse<C>> | IpcResponse<C>;
};

export function registerIpc(deps: {
  getWindow: () => BrowserWindow | null;
  host: AgentHost;
  settings: SettingsManager;
  vault: SecretVault;
  updater: Updater;
  preview: PreviewManager;
  plugins: PluginManager;
  browser: import("./BrowserManager.js").BrowserManager;
  auth: AuthManager;
}): void {
  const { getWindow, host, settings, vault, updater, preview, plugins, browser, auth } = deps;

  const makeProvider = (providerId: string, apiKeyOverride?: string) => {
    // Cloud edition routes through the hosted proxy with the session token.
    if (isCloud) {
      return new OpenAICompatProvider({ baseUrl: CLOUD_CONFIG.apiBaseUrl, apiKey: auth.token() });
    }
    const p = settings.get().providers.find((x) => x.id === providerId);
    if (!p) throw new Error(`Unknown provider: ${providerId}`);
    const apiKey = apiKeyOverride ?? (p.apiKeyRef ? vault.get(p.apiKeyRef) : null);
    return new OpenAICompatProvider({ baseUrl: p.baseUrl, apiKey });
  };

  const handlers: Handlers = {
    "app:getState": () => {
      const s = settings.get();
      const refs = s.providers.flatMap((p) => (p.apiKeyRef ? [p.apiKeyRef] : []));
      return {
        version: app.getVersion(),
        settings: s,
        secrets: vault.maskedAll(refs),
        edition: EDITION,
        signedIn: auth.isSignedIn(),
      };
    },
    "auth:signIn": () => auth.signIn(),
    "auth:signOut": () => {
      auth.signOut();
    },
    "settings:update": (req) => settings.update(req),
    "secrets:set": (req) => {
      vault.set(req.ref, req.value);
    },
    "provider:test": async (req) => {
      try {
        const models = await makeProvider(req.providerId, req.apiKey).listModels();
        return { ok: true, models };
      } catch (err) {
        return { ok: false, models: [], error: err instanceof Error ? err.message : String(err) };
      }
    },
    "models:list": async (req) => makeProvider(req.providerId).listModels(),
    "session:list": (req) => SessionStore.list(req.cwd),
    "session:delete": (req) => SessionStore.delete(req.cwd, req.sessionId),
    "session:start": (req) => host.start(req.cwd, req.resumeSessionId),
    "session:send": (req) => {
      host.send(req.sessionId, req.text, req.model);
    },
    "session:abort": (req) => {
      host.abort(req.sessionId);
    },
    "session:setMode": (req) => {
      host.setMode(req.sessionId, req.mode);
    },
    "session:setGoalMode": (req) => {
      host.setGoalMode(req.sessionId, req.on);
    },
    "mcp:enablePreset": (req) => host.enablePreset(req.name, req.cwd),
    "permission:respond": (req) => {
      host.respondPermission(req);
    },
    "question:respond": (req) => {
      host.answerQuestion(req.id, req.answer);
    },
    "session:command": (req) => host.command(req.sessionId, req.command, req.args),
    "checkpoint:list": (req) => host.listCheckpoints(req.sessionId),
    "checkpoint:rewind": (req) => host.rewind(req.sessionId, req.boundary),
    "commands:list": (req) => host.slashCommands(req.cwd),
    "files:search": (req) => searchFiles(req.cwd, req.query, req.limit),
    "mcp:status": () => host.mcp.statuses(),
    "mcp:restart": (req) => host.restartMcp(req.name),
    "skills:list": async (req) => {
      if (req.cwd) await host.skills.scan(req.cwd);
      return host.skills.list();
    },
    "plugins:install": (req) => plugins.install(req.source, req.location),
    "plugins:remove": (req) => plugins.remove(req.name),
    "artifact:read": (req) => host.getArtifact(req.artifactId),
    "preview:start": (req) =>
      preview.start(req.sessionId, req.command, req.port, req.cwd ?? process.cwd()),
    "preview:stop": (req) => preview.stop(req.sessionId),
    "update:check": () => updater.check(),
    "update:download": () => updater.download(),
    "update:install": () => {
      updater.install();
    },
    "browser:setBounds": (req) => {
      browser.setBounds(req);
    },
    "browser:hide": () => {
      browser.hide();
    },
    "vision:test": async (req) => {
      const apiKey = req.apiKey ?? vault.get("vision-api-key");
      const bridge = new VisionBridge({ baseUrl: req.baseUrl, model: req.model, apiKey });
      return bridge.test();
    },
    "vision:describe": async (req) => {
      const v = settings.get().vision;
      if (!v.baseUrl || !v.model) return { ok: false, configured: false };
      try {
        const bridge = new VisionBridge({
          baseUrl: v.baseUrl,
          model: v.model,
          apiKey: vault.get(v.apiKeyRef),
        });
        const description = await bridge.describe(req.imageDataUrl, req.question);
        return { ok: true, description, configured: true };
      } catch (err) {
        return { ok: false, configured: true, error: err instanceof Error ? err.message : String(err) };
      }
    },
    "dialog:pickFolder": async () => {
      const win = getWindow();
      if (!win) return { path: null };
      const res = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
      return { path: res.canceled ? null : (res.filePaths[0] ?? null) };
    },
    "shell:openExternal": async (req) => {
      await shell.openExternal(req.url);
    },
  };

  for (const channel of Object.keys(IPC_INVOKE) as IpcInvokeChannel[]) {
    ipcMain.handle(channel, async (_event, raw: unknown) => {
      const req = IPC_INVOKE[channel].req.parse(raw);
      return handlers[channel](req as never);
    });
  }
}
