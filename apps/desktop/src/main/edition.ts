/**
 * Two editions from one codebase, selected at build time via WHALEX_EDITION.
 *   oss   — open-source BYOK: user supplies their own DeepSeek key, GitHub updates.
 *   cloud — subscription: login + hosted API proxy, generic HTTPS updates.
 * The renderer/main gate auth UI, provider defaults, and the update feed on this.
 */
export type Edition = "oss" | "cloud";

export const EDITION: Edition =
  (process.env.WHALEX_EDITION as Edition | undefined) ?? "oss";

export const isCloud = EDITION === "cloud";

export const CLOUD_CONFIG = {
  apiBaseUrl: "https://api.whalex.app/v1",
  authUrl: "https://whalex.app/auth",
  updateFeedUrl: "https://updates.whalex.app/stable/",
};
