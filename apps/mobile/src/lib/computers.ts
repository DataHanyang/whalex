import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/**
 * Paired desktops. Non-secret metadata (names, addresses) lives in
 * AsyncStorage; the device token — the actual capability — lives in the
 * Android Keystore via expo-secure-store, one entry per computer.
 */
export interface PairedComputer {
  computerId: string;
  name: string;
  /** Every address the desktop advertised, most recently confirmed first. */
  addrs: Array<{ ip: string; port: number }>;
  /** SHA-256 hex of the desktop's TLS cert, pinned at pairing. */
  fp: string;
  /** Desktop bridge is in plaintext dev mode — connect with ws://. */
  insecure?: boolean;
  /** Public https base (tunnel/proxy with a real cert); preferred over addrs. */
  publicUrl?: string;
  /**
   * Tunnel mode: `addrs` serve only GET /info. They are how we re-learn the
   * tunnel address after the desktop restarted, not a way to run a session.
   */
  lanInfoOnly?: boolean;
  pairedAt: number;
  lastConnectedAt?: number;
}

const INDEX_KEY = "whalex.computers";
const tokenKey = (computerId: string): string =>
  // SecureStore keys allow only [A-Za-z0-9._-]; computerId is a UUID, safe.
  `whalex.token.${computerId}`;

export async function listComputers(): Promise<PairedComputer[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as PairedComputer[]) : [];
  } catch {
    return [];
  }
}

export async function saveComputer(computer: PairedComputer, token?: string): Promise<void> {
  const list = await listComputers();
  const next = [...list.filter((c) => c.computerId !== computer.computerId), computer];
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(next));
  if (token) await SecureStore.setItemAsync(tokenKey(computer.computerId), token);
}

export async function getToken(computerId: string): Promise<string | null> {
  return SecureStore.getItemAsync(tokenKey(computerId));
}

export async function removeComputer(computerId: string): Promise<void> {
  const list = await listComputers();
  await AsyncStorage.setItem(
    INDEX_KEY,
    JSON.stringify(list.filter((c) => c.computerId !== computerId)),
  );
  await SecureStore.deleteItemAsync(tokenKey(computerId));
}
