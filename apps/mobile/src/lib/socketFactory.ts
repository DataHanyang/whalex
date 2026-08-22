import { WS_PROTOCOL, WS_TOKEN_PROTOCOL } from "@whalex/shared";
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
  // In tunnel mode the LAN addresses answer /info only — never a session.
  if (!computer.lanInfoOnly) {
    const scheme = computer.insecure ? "ws" : "wss";
    for (const addr of computer.addrs) out.push(`${scheme}://${addr.ip}:${addr.port}/ws`);
  }
  return out;
}

/**
 * Ask the desktop over the local network where its tunnel currently lives.
 * A quick-tunnel address dies with every desktop restart, so this is what
 * turns "phone stopped working after I rebooted the PC" into a silent
 * refresh the next time the phone is home.
 */
export async function probePublicUrl(computer: PairedComputer): Promise<string | null> {
  for (const addr of computer.addrs) {
    for (const scheme of computer.lanInfoOnly || computer.insecure ? ["http"] : ["https", "http"]) {
      try {
        const res = await fetch(`${scheme}://${addr.ip}:${addr.port}/info`);
        if (!res.ok) continue;
        const body = (await res.json()) as { computerId?: string; publicUrl?: string };
        // Guard against a stale DHCP lease now held by someone else's machine.
        if (body.computerId !== computer.computerId) continue;
        if (body.publicUrl) return body.publicUrl.replace(/\/+$/, "");
      } catch {
        // unreachable on this address — try the next
      }
    }
  }
  return null;
}

/**
 * Opens the socket with the device token presented two ways.
 *
 * The Authorization header is the right place for it, but React Native's
 * Android WebSocket does not reliably forward custom headers — when it drops
 * them the bridge sees an anonymous client, answers 401, and the app treats a
 * perfectly good pairing as revoked. The subprotocol list always survives the
 * handshake, so the token rides there too and the server takes whichever
 * arrives.
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
  const protocols = [WS_PROTOCOL, `${WS_TOKEN_PROTOCOL}.${token}`];
  return () =>
    new RNWebSocket(url, protocols, { headers: { authorization: `Bearer ${token}` } });
}
