import type { WhalexApi } from "@whalex/shared";

/** The preload bridge: the typed IPC surface plus direct helpers. */
export interface WhalexBridge extends WhalexApi {
  /**
   * Absolute filesystem path of an attached/dropped File (Electron's
   * webUtils.getPathForFile). Optional so a stale preload degrades gracefully.
   */
  getPathForFile?(file: File): string;
}

declare global {
  interface Window {
    whalex: WhalexBridge;
  }
}

export const whalex = window.whalex;
