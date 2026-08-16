import { contextBridge, ipcRenderer } from "electron";
import type { WhalexApi } from "@whalex/shared";

const INVOKE_CHANNELS = new Set([
  "app:getState",
  "auth:signIn",
  "auth:signOut",
  "settings:update",
  "secrets:set",
  "provider:test",
  "models:list",
  "session:list",
  "session:delete",
  "session:start",
  "session:send",
  "session:abort",
  "session:setMode",
  "session:setGoalMode",
  "mcp:enablePreset",
  "permission:respond",
  "session:command",
  "checkpoint:list",
  "checkpoint:rewind",
  "commands:list",
  "files:search",
  "mcp:status",
  "mcp:restart",
  "skills:list",
  "plugins:install",
  "plugins:remove",
  "artifact:read",
  "preview:start",
  "preview:stop",
  "update:check",
  "update:download",
  "update:install",
  "browser:setBounds",
  "browser:hide",
  "vision:test",
  "vision:describe",
  "question:respond",
  "dialog:pickFolder",
  "shell:openExternal",
]);

const EVENT_CHANNELS = new Set(["agent:event", "mcp:status", "update:status"]);

const api: WhalexApi = {
  invoke: (channel, req) => {
    if (!INVOKE_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`Unknown IPC channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, req);
  },
  on: (channel, listener) => {
    if (!EVENT_CHANNELS.has(channel)) throw new Error(`Unknown event channel: ${channel}`);
    const wrapped = (_e: Electron.IpcRendererEvent, payload: unknown) =>
      listener(payload as never);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
};

contextBridge.exposeInMainWorld("whalex", api);
