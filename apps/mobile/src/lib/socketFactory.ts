import type { WebSocketLike } from "@whalex/client-core";
import type { PairedComputer } from "./computers";

/**
 * React Native's WebSocket accepts an options object with headers as the
 * third argument — that's where the bearer token rides, same as the desktop
 * test client.
 *
 * TLS NOTE: the bridge serves a self-signed certificate whose SHA-256 the
 * phone pinned at pairing (computer.fp). Stock RN/OkHttp rejects unknown
 * CAs, so release builds need the dev-client TLS trust plugin that installs
 * a TrustManager honoring exactly this fingerprint (M5 — on-device work).
 * Until that lands, point the app at a bridge whose cert the OS trusts, or
 * run against a dev build with the plugin applied.
 */
export function makeSocketFactory(
  computer: PairedComputer,
  token: string,
  addrIndex = 0,
): () => WebSocketLike {
  const addr = computer.addrs[addrIndex % computer.addrs.length] ?? computer.addrs[0];
  if (!addr) throw new Error("computer has no known addresses");
  // RN's WebSocket takes an options object with headers as a third argument;
  // the DOM typings don't know about it.
  const RNWebSocket = WebSocket as unknown as new (
    url: string,
    protocols?: string[] | null,
    options?: { headers: Record<string, string> },
  ) => WebSocketLike;
  return () =>
    new RNWebSocket(`wss://${addr.ip}:${addr.port}/ws`, null, {
      headers: { authorization: `Bearer ${token}` },
    });
}
