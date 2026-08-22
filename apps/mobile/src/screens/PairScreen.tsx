import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { QrPayloadSchema, type PairResponse, type QrPayload } from "@whalex/shared";
import { colors, radius, space, type } from "../theme";
import { t } from "../i18n";
import { getToken, listComputers, saveComputer, type PairedComputer } from "../lib/computers";

/**
 * First run. The whole setup is one scan, so the screen's job is to make the
 * desktop half obvious — people arrive here having installed the phone app
 * first and wondering what to point it at.
 */
export function PairScreen({ onPaired }: { onPaired: (computer: PairedComputer) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"scan" | "code" | "address">("scan");
  const [manualText, setManualText] = useState("");
  const [addressText, setAddressText] = useState("");
  const [known, setKnown] = useState<PairedComputer[]>([]);

  // A phone that has paired before is usually here for the other reason: the
  // computer's address moved, not that it needs a new pairing.
  useEffect(() => {
    void listComputers().then(setKnown);
  }, []);

  const handleAddress = async (): Promise<void> => {
    const computer = known[0];
    if (!computer || busy) return;
    setBusy(true);
    setError(null);
    try {
      const url = normalizeUrl(addressText);
      const moved = await relocate(computer, url);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onPaired(moved);
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

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
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.kicker}>{t("pair.kicker")}</Text>
      <Text style={styles.title}>{t("pair.title")}</Text>
      <Text style={styles.lead}>
        {t("pair.lead")}
      </Text>

      <View style={styles.steps}>
        <Step n="1" text={t("pair.step1")} />
        <Step n="2" text={t("pair.step2")} />
        <Step n="3" text={t("pair.step3")} />
      </View>

      {mode === "scan" && (
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
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.scanBusyText}>{t("pair.pairing")}</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.permission}>
              <Feather name="camera-off" size={20} color={colors.faint} />
              <Text style={styles.permissionText}>
                {t("pair.cameraNeeded")}
              </Text>
              <Pressable style={styles.primary} onPress={() => void requestPermission()}>
                <Text style={styles.primaryText}>{t("pair.allowCamera")}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {mode === "code" && (
        <View style={styles.manual}>
          <Text style={styles.manualLabel}>{t("pair.codeLabel")}</Text>
          <TextInput
            style={styles.input}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t("pair.codePlaceholder")}
            placeholderTextColor={colors.faint}
            value={manualText}
            onChangeText={setManualText}
          />
          <Pressable
            style={[styles.primary, !manualText.trim() && styles.primaryOff]}
            onPress={() => void handlePayload(manualText)}
            disabled={busy || !manualText.trim()}
          >
            {busy ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.primaryText}>{t("pair.pair")}</Text>
            )}
          </Pressable>
        </View>
      )}

      {mode === "address" && (
        <View style={styles.manual}>
          <Text style={styles.manualLabel}>{t("pair.address.label")}</Text>
          {known[0] ? (
            <>
              <Text style={styles.addressFor}>{known[0].name}</Text>
              <TextInput
                style={styles.addressInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="https://….trycloudflare.com"
                placeholderTextColor={colors.faint}
                value={addressText}
                onChangeText={setAddressText}
              />
              <Text style={styles.addressHint}>{t("pair.address.hint")}</Text>
              <Pressable
                style={[styles.primary, !addressText.trim() && styles.primaryOff]}
                onPress={() => void handleAddress()}
                disabled={busy || !addressText.trim()}
              >
                {busy ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <Text style={styles.primaryText}>{t("pair.address.save")}</Text>
                )}
              </Pressable>
            </>
          ) : (
            <Text style={styles.addressHint}>{t("pair.address.none")}</Text>
          )}
        </View>
      )}

      {error && (
        <View style={styles.error}>
          <Feather name="alert-triangle" size={13} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Pressable
        onPress={() => {
          setError(null);
          // The label promises code entry everywhere except in code mode,
          // where it promises the scanner — deliver whichever it said.
          setMode((m) => (m === "code" ? "scan" : "code"));
        }}
        style={styles.switcher}
      >
        <Text style={styles.switcherText}>
          {mode === "code" ? t("pair.scanInstead") : t("pair.manualInstead")}
        </Text>
      </Pressable>

      {known.length > 0 && (
        <Pressable
          onPress={() => {
            setError(null);
            setMode((m) => (m === "address" ? "scan" : "address"));
          }}
          style={styles.switcher}
        >
          <Text style={styles.switcherText}>
            {mode === "address" ? t("pair.scanInstead") : t("pair.addressInstead")}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

/** Accepts what a person would paste: bare host, trailing slash, http://. */
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme;
}

/**
 * Point an existing pairing at a new address. The device token is untouched —
 * only where to dial changed — so this is a repair, not a re-pairing. `/info`
 * has to answer with the same computerId first: a typo that happens to reach
 * someone else's bridge must not overwrite a working pairing.
 */
async function relocate(computer: PairedComputer, url: string): Promise<PairedComputer> {
  let body: { computerId?: string; name?: string };
  // AbortController by hand: Hermes has no AbortSignal.timeout static.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetch(`${url}/info`, { signal: ctl.signal });
    if (!res.ok) throw new Error(String(res.status));
    body = (await res.json()) as { computerId?: string; name?: string };
  } catch {
    throw new Error(t("pair.address.errUnreachable"));
  } finally {
    clearTimeout(timer);
  }
  if (body.computerId !== computer.computerId) {
    throw new Error(t("pair.address.errMismatch"));
  }
  const moved: PairedComputer = { ...computer, publicUrl: url, name: body.name ?? computer.name };
  await saveComputer(moved);
  return moved;
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
  if (/JSON|Unexpected|invalid_/i.test(msg)) return t("pair.errNotWhalex");
  if (/no pairing window/i.test(msg)) return t("pair.errExpired");
  if (/invalid pairing secret/i.test(msg)) return t("pair.errUsed");
  if (/Network|fetch|failed/i.test(msg)) {
    return t("pair.errUnreachable");
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
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xxxl },
  kicker: {
    ...type.label,
    color: colors.accent,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    marginBottom: space.sm,
  },
  title: { ...type.display },
  lead: { ...type.body, color: colors.muted, marginTop: space.md },

  steps: { marginTop: space.xxl, gap: space.md },
  step: { flexDirection: "row", alignItems: "center", gap: space.md },
  stepN: {
    ...type.monoSmall,
    color: colors.accent,
    width: 22,
    height: 22,
    lineHeight: 21,
    textAlign: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    overflow: "hidden",
  },
  stepText: { ...type.body, fontSize: 14, color: colors.muted, flex: 1 },

  scanner: {
    marginTop: space.xxl,
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reticle: {
    position: "absolute",
    top: "16%",
    left: "16%",
    right: "16%",
    bottom: "16%",
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radius.md,
  },
  scanBusy: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(11,15,20,0.8)",
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
  },
  scanBusyText: { ...type.ui, color: colors.muted },
  permission: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, padding: space.xl },
  permissionText: { ...type.caption, textAlign: "center", color: colors.muted },

  manual: { marginTop: space.xxl, gap: space.sm },
  manualLabel: { ...type.label, textTransform: "uppercase", letterSpacing: 0.8 },
  input: {
    ...type.mono,
    minHeight: 120,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    textAlignVertical: "top",
  },

  addressFor: { ...type.caption, color: colors.muted },
  addressInput: {
    ...type.mono,
    fontSize: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  addressHint: { ...type.caption, color: colors.muted, lineHeight: 18, marginBottom: space.xs },

  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    paddingHorizontal: space.xl,
    alignItems: "center",
  },
  primaryOff: { backgroundColor: colors.border },
  primaryText: { ...type.ui, color: colors.bg, fontFamily: "PlexSansSemi" },

  error: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.lg,
    padding: space.md,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
  },
  errorText: { ...type.caption, color: colors.text, flex: 1, lineHeight: 18 },

  switcher: { marginTop: space.xl, alignItems: "center" },
  switcherText: { ...type.caption, color: colors.accent },
});
