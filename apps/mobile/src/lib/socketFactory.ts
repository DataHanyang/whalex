import type { WebSocketLike } from "@whalex/client-core";
import type { PairedComputer } from "./computers";

/** Every way to reach a computer, public tunnel first. */
export function wsEndpoints(computer: PairedComputer): string[] {
  const out: string[] = [];
  if (computer.publicUrl) {
    // https://host/path → wss://host/path/ws — real cert via the tunnel/proxy,
    // trusted by the system store, reachable from anywhere.
    out.push(`${computer.publicUrl.replace(/^http/, "ws").replace(/\/+$/, "")}/ws`);
  }
  const scheme = computer.insecure ? "ws" : "wss";
  for (const addr of computer.addrs) out.push(`${scheme}://${addr.ip}:${addr.port}/ws`);
  return out;
}

/**
 * React Native's WebSocket accepts an options object with headers as the
 * third argument — that's where the bearer token rides, same as the desktop
 * test client.
 *
 * TLS NOTE: LAN wss:// endpoints use the bridge's self-signed cert, which
 * stock RN/OkHttp rejects until the fingerprint-pinning native work lands —
 * use the publicUrl (real cert) or the bridge's dev mode until then.
 */
export function makeSocketFactory(
  computer: PairedComputer,
  token: string,
  attempt = 0,
): () => WebSocketLike {
  const endpoints = wsEndpoints(computer);
  const url = endpoints[attempt % endpoints.length];
  if (!url) throw new Error("computer has no known addresses");
  // RN's WebSocket takes an options object with headers as a third argument;
  // the DOM typings don't know about it.
  const RNWebSocket = WebSocket as unknown as new (
    url: string,
    protocols?: string[] | null,
    options?: { headers: Record<string, string> },
  ) => WebSocketLike;
  return () => new RNWebSocket(url, null, { headers: { authorization: `Bearer ${token}` } });
}
