import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { QrPayloadSchema, type PairResponse, type QrPayload } from "@whalex/shared";
import { colors } from "../theme";
import { getToken, saveComputer, type PairedComputer } from "../lib/computers";

/**
 * Pair with a desktop by scanning the QR from Settings → Remote (manual JSON
 * paste as fallback for devices without a camera). Re-scanning a computer we
 * already hold a token for just refreshes its addresses — no new ceremony.
 */
export function PairScreen({ onPaired }: { onPaired: (computer: PairedComputer) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [manualText, setManualText] = useState("");

  const handlePayload = async (raw: string): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const qr = QrPayloadSchema.parse(JSON.parse(raw));
      const computer = await pair(qr);
      onPaired(computer);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Pair with your computer</Text>
      <Text style={styles.hint}>
        On the desktop: Settings → Remote → Pair a device, then scan the QR.
      </Text>

      {!manual && permission?.granted && (
        <View style={styles.cameraBox}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={busy ? undefined : (r) => void handlePayload(r.data)}
          />
        </View>
      )}
      {!manual && !permission?.granted && (
        <Pressable style={styles.button} onPress={() => void requestPermission()}>
          <Text style={styles.buttonText}>Allow camera access</Text>
        </Pressable>
      )}

      {manual && (
        <>
          <TextInput
            style={styles.input}
            multiline
            placeholder="Paste the QR payload JSON"
            placeholderTextColor={colors.faint}
            value={manualText}
            onChangeText={setManualText}
          />
          <Pressable style={styles.button} onPress={() => void handlePayload(manualText)}>
            <Text style={styles.buttonText}>Pair</Text>
          </Pressable>
        </>
      )}

      {busy && <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />}
      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable onPress={() => setManual((m) => !m)}>
        <Text style={styles.link}>{manual ? "Scan a QR instead" : "Enter payload manually"}</Text>
      </Pressable>
    </View>
  );
}

async function pair(qr: QrPayload): Promise<PairedComputer> {
  const computer: PairedComputer = {
    computerId: qr.computerId,
    name: qr.name,
    addrs: qr.addrs,
    fp: qr.fp,
    pairedAt: Date.now(),
  };
  // Known computer → keep the existing token, just refresh addresses.
  if (await getToken(qr.computerId)) {
    await saveComputer(computer);
    return computer;
  }
  let lastErr = "no reachable address";
  for (const addr of qr.addrs) {
    try {
      const res = await fetch(`https://${addr.ip}:${addr.port}/pair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret: qr.secret, deviceName: "WhaleX Android" }),
      });
      const body = (await res.json()) as PairResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      await saveComputer(computer, body.deviceToken);
      return computer;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(`pairing failed: ${lastErr}`);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: "center" },
  title: { color: colors.text, fontSize: 22, fontWeight: "600", marginBottom: 8 },
  hint: { color: colors.muted, fontSize: 14, marginBottom: 20 },
  cameraBox: {
    aspectRatio: 1,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    padding: 12,
    textAlignVertical: "top",
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  link: { color: colors.accent, textAlign: "center", marginTop: 20 },
  error: { color: colors.danger, marginTop: 12, textAlign: "center" },
});
