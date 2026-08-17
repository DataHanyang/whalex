import { contextBridge, ipcRenderer, webUtils } from "electron";
import { IPC_EVENTS, IPC_INVOKE, type WhalexApi } from "@whalex/shared";

// Single-sourced from the shared IPC contract so this whitelist can never
// drift from the channels main actually registers.
const INVOKE_CHANNELS = new Set(Object.keys(IPC_INVOKE));

const EVENT_CHANNELS = new Set(Object.keys(IPC_EVENTS));

/** The typed IPC surface plus direct helpers that need preload privileges. */
interface WhalexBridge extends WhalexApi {
  /**
   * Absolute filesystem path of an attached/dropped File.
   * `File.path` was removed in Electron 32; this wraps webUtils.getPathForFile.
   */
  getPathForFile(file: File): string;
}

const api: WhalexBridge = {
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
  getPathForFile: (file) => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld("whalex", api);
