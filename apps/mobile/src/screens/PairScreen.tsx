import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { QrPayloadSchema, type PairResponse, type QrPayload } from "@whalex/shared";
import { colors, radius, space, type } from "../theme";
import { getToken, saveComputer, type PairedComputer } from "../lib/computers";

/**
 * First run. The whole setup is one scan, so the screen's job is to make the
 * desktop half obvious — people arrive here having installed the phone app
 * first and wondering what to point it at.
 */
export function PairScreen({ onPaired }: { onPaired: (computer: PairedComputer) => void }) {
  const insets = useSafeAreaInsets();
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
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onPaired(computer);
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xxl }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.kicker}>WhaleX</Text>
      <Text style={styles.title}>Connect to your computer</Text>
      <Text style={styles.lead}>
        Your desktop does the work. This app watches it, steers it, and approves what it asks for.
      </Text>

      <View style={styles.steps}>
        <Step n="1" text="Open WhaleX on your computer" />
        <Step n="2" text="Settings → Remote → turn on mobile access" />
        <Step n="3" text="Press Pair a device, then scan the code" />
      </View>

      {!manual && (
        <View style={styles.scanner}>
          {permission?.granted ? (
            <>
              <CameraView
                style={StyleSheet.absoluteFill}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={busy ? undefined : (r) => void handlePayload(r.data)}
              />
              <View style={styles.reticle} pointerEvents="none" />
              {busy && (
                <View style={styles.scanBusy}>
                  <ActivityIndicator color={colors.sonar} />
                  <Text style={styles.scanBusyText}>Pairing…</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.permission}>
              <Feather name="camera-off" size={20} color={colors.deep} />
              <Text style={styles.permissionText}>
                WhaleX needs the camera to read the pairing code.
              </Text>
              <Pressable style={styles.primary} onPress={() => void requestPermission()}>
                <Text style={styles.primaryText}>Allow camera</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {manual && (
        <View style={styles.manual}>
          <Text style={styles.manualLabel}>Pairing code</Text>
          <TextInput
            style={styles.input}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Paste the payload shown under the QR code"
            placeholderTextColor={colors.deep}
            value={manualText}
            onChangeText={setManualText}
          />
          <Pressable
            style={[styles.primary, !manualText.trim() && styles.primaryOff]}
            onPress={() => void handlePayload(manualText)}
            disabled={busy || !manualText.trim()}
          >
            {busy ? (
              <ActivityIndicator color={colors.abyss} />
            ) : (
              <Text style={styles.primaryText}>Pair</Text>
            )}
          </Pressable>
        </View>
      )}

      {error && (
        <View style={styles.error}>
          <Feather name="alert-triangle" size={13} color={colors.coral} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Pressable onPress={() => setManual((m) => !m)} style={styles.switcher}>
        <Text style={styles.switcherText}>
          {manual ? "Scan the code instead" : "Enter the code manually"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function Step({ n, text }: { n: string; text: string }) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepN}>{n}</Text>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

/** Pairing fails for a handful of knowable reasons; say which one. */
function explain(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/JSON|Unexpected|invalid_/i.test(msg)) return "That code isn't a WhaleX pairing code.";
  if (/no pairing window/i.test(msg)) return "The code expired. Press Pair a device again.";
  if (/invalid pairing secret/i.test(msg)) return "That code was already used. Generate a new one.";
  if (/Network|fetch|failed/i.test(msg)) {
    return "Couldn't reach the computer. Check it's awake and on the same network, or turn on internet access in Settings → Remote.";
  }
  return msg;
}

async function pair(qr: QrPayload): Promise<PairedComputer> {
  const computer: PairedComputer = {
    computerId: qr.computerId,
    name: qr.name,
    addrs: qr.addrs,
    fp: qr.fp,
    insecure: qr.insecure === true,
    lanInfoOnly: qr.lanInfoOnly === true,
    publicUrl: qr.url ? qr.url.replace(/\/+$/, "") : undefined,
    pairedAt: Date.now(),
  };
  // Provisioned payload: the desktop already minted our device token.
  if (qr.token) {
    await saveComputer(computer, qr.token);
    return computer;
  }
  // Known computer → keep the existing token, just refresh addresses.
  if (await getToken(qr.computerId)) {
    await saveComputer(computer);
    return computer;
  }
  // Public tunnel first (real TLS, works from anywhere), then LAN addrs.
  const scheme = computer.insecure ? "http" : "https";
  const endpoints = [
    ...(computer.publicUrl ? [`${computer.publicUrl}/pair`] : []),
    ...qr.addrs.map((a) => `${scheme}://${a.ip}:${a.port}/pair`),
  ];
  let lastErr = "no reachable address";
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
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
  throw new Error(lastErr);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxxl },
  kicker: {
    ...type.label,
    color: colors.sonar,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    marginBottom: space.sm,
  },
  title: { ...type.display },
  lead: { ...type.body, color: colors.mist, marginTop: space.md },

  steps: { marginTop: space.xxl, gap: space.md },
  step: { flexDirection: "row", alignItems: "center", gap: space.md },
  stepN: {
    ...type.monoSmall,
    color: colors.sonar,
    width: 22,
    height: 22,
    lineHeight: 21,
    textAlign: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.sonarSoft,
    overflow: "hidden",
  },
  stepText: { ...type.body, fontSize: 14, color: colors.mist, flex: 1 },

  scanner: {
    marginTop: space.xxl,
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.hull,
    borderWidth: 1,
    borderColor: colors.line,
  },
  reticle: {
    position: "absolute",
    top: "16%",
    left: "16%",
    right: "16%",
    bottom: "16%",
    borderWidth: 2,
    borderColor: colors.sonar,
    borderRadius: radius.md,
  },
  scanBusy: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(11,15,20,0.8)",
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
  },
  scanBusyText: { ...type.ui, color: colors.mist },
  permission: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, padding: space.xl },
  permissionText: { ...type.caption, textAlign: "center", color: colors.mist },

  manual: { marginTop: space.xxl, gap: space.sm },
  manualLabel: { ...type.label, textTransform: "uppercase", letterSpacing: 0.8 },
  input: {
    ...type.mono,
    minHeight: 120,
    backgroundColor: colors.hull,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: space.md,
    textAlignVertical: "top",
  },

  primary: {
    backgroundColor: colors.sonar,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    paddingHorizontal: space.xl,
    alignItems: "center",
  },
  primaryOff: { backgroundColor: colors.line },
  primaryText: { ...type.ui, color: colors.abyss, fontFamily: "PlexSansSemi" },

  error: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.lg,
    padding: space.md,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.sm,
  },
  errorText: { ...type.caption, color: colors.foam, flex: 1, lineHeight: 18 },

  switcher: { marginTop: space.xl, alignItems: "center" },
  switcherText: { ...type.caption, color: colors.sonar },
});
