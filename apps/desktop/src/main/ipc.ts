import { app, dialog, ipcMain, shell, type BrowserWindow } from "electron";
import { OpenAICompatProvider, SessionStore } from "@whalex/core";
import {
  IPC_INVOKE,
  type IpcInvokeChannel,
  type IpcRequest,
  type IpcResponse,
} from "@whalex/shared";
import type { AgentHost } from "./AgentHost.js";
import type { SettingsManager } from "./settings.js";
import type { SecretVault } from "./secrets.js";

type Handlers = {
  [C in IpcInvokeChannel]: (req: IpcRequest<C>) => Promise<IpcResponse<C>> | IpcResponse<C>;
};

export function registerIpc(deps: {
  getWindow: () => BrowserWindow | null;
  host: AgentHost;
  settings: SettingsManager;
  vault: SecretVault;
}): void {
  const { getWindow, host, settings, vault } = deps;

  const makeProvider = (providerId: string, apiKeyOverride?: string) => {
    const p = settings.get().providers.find((x) => x.id === providerId);
    if (!p) throw new Error(`Unknown provider: ${providerId}`);
    const apiKey = apiKeyOverride ?? (p.apiKeyRef ? vault.get(p.apiKeyRef) : null);
    return new OpenAICompatProvider({ baseUrl: p.baseUrl, apiKey });
  };

  const handlers: Handlers = {
    "app:getState": () => {
      const s = settings.get();
      const refs = s.providers.flatMap((p) => (p.apiKeyRef ? [p.apiKeyRef] : []));
      return { version: app.getVersion(), settings: s, secrets: vault.maskedAll(refs) };
    },
    "settings:update": (req) => settings.update(req),
    "secrets:set": (req) => {
      vault.set(req.ref, req.value);
    },
    "provider:test": async (req) => {
      try {
        const provider = makeProvider(req.providerId, req.apiKey);
        const models = await provider.listModels();
        return { ok: true, models };
      } catch (err) {
        return {
          ok: false,
          models: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    "models:list": async (req) => makeProvider(req.providerId).listModels(),
    "session:list": (req) => SessionStore.list(req.cwd),
    "session:start": (req) => host.start(req.cwd, req.resumeSessionId),
    "session:send": (req) => {
      host.send(req.sessionId, req.text, req.model);
    },
    "session:abort": (req) => {
      host.abort(req.sessionId);
    },
    "permission:respond": (req) => {
      host.respondPermission(req);
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
      const schema = IPC_INVOKE[channel].req;
      const req = schema.parse(raw);
      return handlers[channel](req as never);
    });
  }
}
