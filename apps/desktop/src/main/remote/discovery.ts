import dgram from "node:dgram";
import { DISCOVERY_MAGIC, type DiscoveryReply } from "@whalex/shared";

/**
 * UDP responder so a paired phone can re-find this machine after its LAN IP
 * changed: the phone broadcasts `WHALEX_DISCOVER v1 <nonce>` on the bridge
 * port and gets the current address back. Replies carry no secrets — the
 * phone still verifies its pinned TLS fingerprint before trusting the answer.
 */
export class DiscoveryResponder {
  private socket: dgram.Socket | null = null;

  constructor(private info: () => Omit<DiscoveryReply, "app" | "nonce">) {}

  start(port: number, log?: (msg: string) => void): void {
    if (this.socket) return;
    const socket = dgram.createSocket("udp4");
    socket.on("error", (err) => {
      log?.(`remote discovery socket error: ${String(err)}`);
      this.stop();
    });
    socket.on("message", (msg, rinfo) => {
      const text = msg.toString("utf8");
      if (!text.startsWith(`${DISCOVERY_MAGIC} `)) return;
      const nonce = text.slice(DISCOVERY_MAGIC.length + 1).trim();
      if (!nonce || nonce.length > 64) return;
      const reply: DiscoveryReply = { app: "whalex", nonce, ...this.info() };
      socket.send(JSON.stringify(reply), rinfo.port, rinfo.address);
    });
    socket.bind(port);
    this.socket = socket;
  }

  stop(): void {
    this.socket?.close();
    this.socket = null;
  }
}
