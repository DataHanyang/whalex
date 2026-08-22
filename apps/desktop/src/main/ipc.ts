import os from "node:os";
import { app, dialog, ipcMain, shell, type BrowserWindow } from "electron";
import { OpenAICompatProvider, SessionStore, VisionBridge, searchFiles } from "@whalex/core";
import { installSkills } from "./SkillInstaller.js";
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
import type { RoutineManager } from "./RoutineManager.js";
import type { UsageLedger } from "./UsageLedger.js";
import type { RemoteBridge } from "./remote/RemoteBridge.js";
import { EDITION, isCloud, CLOUD_CONFIG } from "./edition.js";

export type Handlers = {
  [C in IpcInvokeChannel]: (req: IpcRequest<C>) => Promise<IpcResponse<C>> | IpcResponse<C>;
};

export interface IpcDeps {
  getWindow: () => BrowserWindow | null;
  host: AgentHost;
  settings: SettingsManager;
  vault: SecretVault;
  updater: Updater;
  preview: PreviewManager;
  plugins: PluginManager;
  browser: import("./BrowserManager.js").BrowserManager;
  auth: AuthManager;
  routines: RoutineManager;
  usage: UsageLedger;
  bridge: RemoteBridge;
}

/**
 * The single handler table behind both surfaces: ipcMain (renderer) and the
 * remote bridge (paired phones, whitelisted subset). Same functions, same
 * zod validation — the two can't drift.
 */
export function createHandlers(deps: IpcDeps): Handlers {
  const { getWindow, host, settings, vault, updater, preview, plugins, browser, auth, routines, usage, bridge } = deps;

  const makeProvider = (providerId: string, apiKeyOverride?: string, baseUrlOverride?: string) => {
    // Cloud edition routes through the hosted proxy with the session token.
    if (isCloud) {
      return new OpenAICompatProvider({ baseUrl: CLOUD_CONFIG.apiBaseUrl, apiKey: auth.token() });
    }
    const p = settings.get().providers.find((x) => x.id === providerId);
    // A key being added has no provider entry yet, so the caller passes the
    // endpoint and the key straight in.
    const baseUrl = baseUrlOverride ?? p?.baseUrl;
    if (!baseUrl) throw new Error(`Unknown provider: ${providerId}`);
    const apiKey = apiKeyOverride ?? (p?.apiKeyRef ? vault.get(p.apiKeyRef) : null);
    return new OpenAICompatProvider({ baseUrl, apiKey });
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
    "settings:update": (req) => {
      const out = settings.update(req);
      host.applyLiveSettings();
      bridge.applySettings();
      return out;
    },
    "secrets:reveal": (req) => ({ value: vault.get(req.ref) }),
    "secrets:delete": (req) => {
      vault.delete(req.ref);
      host.applyLiveSettings();
    },
    "secrets:set": (req) => {
      vault.set(req.ref, req.value);
      // Push the new key into live sessions — their providers were built
      // before the key existed and would otherwise keep the keyless fallback.
      host.applyLiveSettings();
    },
    "provider:test": async (req) => {
      try {
        const models = await makeProvider(req.providerId, req.apiKey, req.baseUrl).listModels();
        return { ok: true, models };
      } catch (err) {
        return { ok: false, models: [], error: err instanceof Error ? err.message : String(err) };
      }
    },
    "models:list": async (req) =>
      makeProvider(req.providerId ?? settings.get().activeProviderId).listModels(),
    "app:setEffort": (req) => {
      // Same effect as changing it in the desktop composer: a settings write
      // that live-tunes running sessions. Scoped so the phone never gets the
      // rest of settings:update.
      settings.update({ reasoningEffort: req.effort });
      host.applyLiveSettings();
    },
    "session:list": async (req) => {
      const list = await SessionStore.list(req.cwd);
      return list.map((m) => ({ ...m, running: host.isSessionRunning(m.sessionId) }));
    },
    "session:delete": (req) => SessionStore.delete(req.cwd, req.sessionId),
    "session:attached": () => host.attachedSession(),
    "session:start": (req) => host.start(req.cwd, req.resumeSessionId, { observe: req.observe }),
    "session:send": (req) => {
      host.send(req.sessionId, req.text, req.model, req.messageId);
    },
    "session:steerEdit": (req) => ({
      ok: host.editSteered(req.sessionId, req.messageId, req.text),
    }),
    "session:steerCancel": (req) => ({
      ok: host.cancelSteered(req.sessionId, req.messageId),
    }),
    "session:abort": (req) => {
      host.abort(req.sessionId);
    },
    "session:setMode": (req) => {
      host.setMode(req.sessionId, req.mode);
    },
    "session:setGoalMode": (req) => {
      host.setGoalMode(req.sessionId, req.on);
    },
    "session:setModel": (req) => host.setModel(req.sessionId, req.model),
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
    "skills:install": (req) => installSkills(req.source),
    "skills:list": async (req) => {
      await host.scanSkills(req.cwd ?? process.cwd());
      return host.skills.list();
    },
    "skills:toggle": (req) => {
      const cur = new Set(settings.get().disabledSkills);
      if (req.enabled) cur.delete(req.name);
      else cur.add(req.name);
      settings.update({ disabledSkills: [...cur] });
    },
    "skills:remove": async (req) => {
      // Only user-installed skills are deletable; bundled ones are toggled off.
      const skill = host.skills.get(req.name);
      if (!skill) return { ok: false, error: "unknown skill" };
      if (skill.source !== "user") return { ok: false, error: "not a user skill" };
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      await fs.rm(path.dirname(skill.path), { recursive: true, force: true });
      return { ok: true };
    },
    "plugins:install": (req) => plugins.install(req.source, req.location),
    "plugins:remove": (req) => plugins.remove(req.name),
    "artifact:read": (req) => host.getArtifact(req.artifactId),
    "preview:start": (req) =>
      preview.start(req.sessionId, req.command, req.port, req.cwd ?? process.cwd()),
    "preview:stop": (req) => preview.stop(req.sessionId),
    "routines:run": (req) => routines.runNow(req.id),
    "routines:save": async (req) => {
      try {
        const routine = await host.saveRoutine(req);
        return { ok: true, routine };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    "usage:summary": async (req) => {
      const s = usage.summary(req.days ?? 30);
      let balance: { currency: string; total: number; granted: number; toppedUp: number } | null =
        null;
      let balanceError: string | undefined;
      if (req.includeBalance) {
        // Balance is a DeepSeek platform API; other OpenAI-compatible
        // providers (Ollama etc.) simply have none — balance stays null.
        const st = settings.get();
        const p = st.providers.find((x) => x.id === st.activeProviderId);
        const key = p?.apiKeyRef ? vault.get(p.apiKeyRef) : null;
        if (p && key && /api\.deepseek\.com/i.test(p.baseUrl)) {
          try {
            const res = await fetch(`${p.baseUrl.replace(/\/+$/, "")}/user/balance`, {
              headers: { Authorization: `Bearer ${key}` },
              signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = (await res.json()) as {
              balance_infos?: Array<{
                currency?: string;
                total_balance?: string;
                granted_balance?: string;
                topped_up_balance?: string;
              }>;
            };
            const info = body.balance_infos?.[0];
            if (info) {
              balance = {
                currency: info.currency ?? "USD",
                total: Number(info.total_balance ?? 0),
                granted: Number(info.granted_balance ?? 0),
                toppedUp: Number(info.topped_up_balance ?? 0),
              };
              usage.checkBalance(balance.total);
            }
          } catch (err) {
            balanceError = err instanceof Error ? err.message : String(err);
          }
        }
      }
      return { ...s, balance, balanceError };
    },
    "update:check": () => updater.check(),
    "update:download": () => updater.download(),
    "update:install": () => {
      updater.install();
    },
    "browser:setBounds": (req) => {
      browser.setBounds(req);
    },
    "browser:navigate": (req) => {
      void browser.navigate(req.url);
    },
    "browser:selectTab": (req) => {
      browser.selectTab(req.tabId);
    },
    "browser:closeTab": (req) => {
      browser.closeTab(req.tabId);
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
    "remote:appInfo": () => {
      const s = settings.get();
      return {
        version: app.getVersion(),
        name: os.hostname(),
        computerId: bridge.computerId(),
        defaultModel: s.defaultModel,
        defaultCwd: s.defaultCwd,
        recentCwds: s.recentCwds,
        reasoningEffort: s.reasoningEffort,
      };
    },
    "remote:status": () => bridge.status(),
    "remote:pairingStart": () => bridge.startPairing(),
    "remote:pairingCancel": () => {
      bridge.cancelPairing();
    },
    "remote:revokeDevice": (req) => {
      bridge.revokeDevice(req.id);
    },
    "dialog:pickFolder": async () => {
      const win = getWindow();
      if (!win) return { path: null };
      const res = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
      return { path: res.canceled ? null : (res.filePaths[0] ?? null) };
    },
    "shell:openExternal": async (req) => {
      // Web/mail only — file://, smb:// etc. would hand the OS an arbitrary
      // local target on behalf of renderer-displayed (untrusted) content.
      const proto = new URL(req.url).protocol;
      if (proto !== "http:" && proto !== "https:" && proto !== "mailto:") {
        throw new Error(`Refusing to open ${proto} URL`);
      }
      await shell.openExternal(req.url);
    },
  };

  return handlers;
}

export function registerIpc(deps: IpcDeps): Handlers {
  const handlers = createHandlers(deps);
  for (const channel of Object.keys(IPC_INVOKE) as IpcInvokeChannel[]) {
    ipcMain.handle(channel, async (_event, raw: unknown) => {
      const req = IPC_INVOKE[channel].req.parse(raw);
      return handlers[channel](req as never);
    });
  }
  return handlers;
}
