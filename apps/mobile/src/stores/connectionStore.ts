import { create } from "zustand";
import { RemoteClient, type HelloOk } from "@whalex/client-core";
import type { AgentEventEnvelope } from "@whalex/shared";
import { getToken, saveComputer, type PairedComputer } from "../lib/computers";
import { makeSocketFactory, probePublicUrl } from "../lib/socketFactory";

export type ConnectionPhase =
  | "disconnected"
  | "connecting"
  | "connected"
  /** The desktop refused our token — the pairing was revoked; re-scan the QR. */
  | "pairingRequired";

const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000];

interface ConnectionState {
  phase: ConnectionPhase;
  computer: PairedComputer | null;
  hello: HelloOk | null;
  client: RemoteClient | null;
  lastError: string | null;
  attempt: number;
  /** Session event fan-in; the session store registers itself here. */
  onEvent: ((env: AgentEventEnvelope) => void) | null;
  onAlert: ((env: AgentEventEnvelope) => void) | null;

  connect(computer: PairedComputer): Promise<void>;
  disconnect(): void;
  /** Called by App on foreground/network-change to retry immediately. */
  kick(): void;
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  phase: "disconnected",
  computer: null,
  hello: null,
  client: null,
  lastError: null,
  attempt: 0,
  onEvent: null,
  onAlert: null,

  async connect(computer) {
    const gen = ++generation;
    if (retryTimer) clearTimeout(retryTimer);
    get().client?.close();
    set({ phase: "connecting", computer, lastError: null });

    const token = await getToken(computer.computerId);
    if (!token) {
      set({ phase: "pairingRequired", lastError: "no stored token" });
      return;
    }

    const attempt = get().attempt;
    const client = new RemoteClient({
      // Rotate through the known addresses across attempts.
      createSocket: makeSocketFactory(computer, token, attempt),
      client: { name: "WhaleX Android", platform: "android", appVersion: "0.1.0" },
      onEvent: (env) => get().onEvent?.(env),
      onAlert: (env) => get().onAlert?.(env),
      onClose: () => {
        if (gen !== generation) return;
        scheduleRetry(set, get, gen);
      },
    });
    try {
      const hello = await client.connect();
      if (gen !== generation) {
        client.close();
        return;
      }
      set({ phase: "connected", client, hello, attempt: 0 });
      // The desktop's quick-tunnel address changes on every restart, so adopt
      // whatever it reports now — that's what keeps the next trip out working.
      const fresh: PairedComputer = {
        ...computer,
        ...(hello.publicUrl ? { publicUrl: hello.publicUrl } : {}),
        lastConnectedAt: Date.now(),
      };
      set({ computer: fresh });
      void saveComputer(fresh);
    } catch (err) {
      if (gen !== generation) return;
      const msg = err instanceof Error ? err.message : String(err);
      // A pre-upgrade 401 surfaces as a handshake failure mentioning 401.
      if (/401/.test(msg)) {
        set({ phase: "pairingRequired", client: null, lastError: msg });
        return;
      }
      set({ lastError: msg, client: null });
      // The desktop may have restarted onto a new tunnel address. If we can
      // still see it on this network, adopt the new address and retry at once
      // instead of backing off against a URL that is now permanently dead.
      const fresh = await probePublicUrl(computer);
      if (gen !== generation) return;
      if (fresh && fresh !== computer.publicUrl) {
        const updated = { ...computer, publicUrl: fresh };
        await saveComputer(updated);
        if (gen !== generation) return;
        set({ attempt: 0 });
        void get().connect(updated);
        return;
      }
      scheduleRetry(set, get, gen);
    }
  },

  disconnect() {
    generation++;
    if (retryTimer) clearTimeout(retryTimer);
    get().client?.close();
    set({ phase: "disconnected", client: null, hello: null, computer: null, attempt: 0 });
  },

  kick() {
    const { phase, computer } = get();
    if (computer && phase !== "connected" && phase !== "pairingRequired") {
      set({ attempt: 0 });
      void get().connect(computer);
    }
  },
}));

function scheduleRetry(
  set: (partial: Partial<ConnectionState>) => void,
  get: () => ConnectionState,
  gen: number,
): void {
  const attempt = get().attempt;
  const delay =
    (BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? 30000) +
    Math.floor(Math.random() * 500);
  set({ phase: "connecting", attempt: attempt + 1 });
  retryTimer = setTimeout(() => {
    if (gen !== generation) return;
    const computer = get().computer;
    if (computer) void get().connect(computer);
  }, delay);
}
