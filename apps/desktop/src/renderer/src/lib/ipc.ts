import type { WhalexApi } from "@whalex/shared";

declare global {
  interface Window {
    whalex: WhalexApi;
  }
}

export const whalex = window.whalex;
