import { useEffect, useRef, useState } from "react";
import { Animated, AppState, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
// Per-weight subpaths, not the package roots: importing the index pulls every
// weight and italic of both families into the bundle (~5 MB of unused fonts).
import { useFonts } from "expo-font";
import { IBMPlexSans_400Regular } from "@expo-google-fonts/ibm-plex-sans/400Regular";
import { IBMPlexSans_500Medium } from "@expo-google-fonts/ibm-plex-sans/500Medium";
import { IBMPlexSans_600SemiBold } from "@expo-google-fonts/ibm-plex-sans/600SemiBold";
import { IBMPlexMono_400Regular } from "@expo-google-fonts/ibm-plex-mono/400Regular";
import { IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono/500Medium";
import { colors, space, type } from "./src/theme";
import type { AppLanguage } from "@whalex/shared";
import { setLanguage, t } from "./src/i18n";
import { listComputers, type PairedComputer } from "./src/lib/computers";
import { useConnectionStore } from "./src/stores/connectionStore";
import { PairScreen } from "./src/screens/PairScreen";
import { SessionsScreen } from "./src/screens/SessionsScreen";
import { ChatScreen } from "./src/screens/ChatScreen";

void SplashScreen.preventAutoHideAsync();

type Screen = "boot" | "pair" | "sessions" | "chat";

export default function App() {
  const [loaded] = useFonts({
    PlexSans: IBMPlexSans_400Regular,
    PlexSansMedium: IBMPlexSans_500Medium,
    PlexSansSemi: IBMPlexSans_600SemiBold,
    PlexMono: IBMPlexMono_400Regular,
    PlexMonoMedium: IBMPlexMono_500Medium,
  });

  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Shell />
    </SafeAreaProvider>
  );
}

/** Design-review build: renders the real screens over sample state. */
const DEMO = process.env.EXPO_PUBLIC_DEMO === "1";

/** Scenario picker for the preview, so one bundle can show every screen. */
function demoParams(): {
  screen: string | null;
  permission: boolean;
  menu: boolean;
  lang: string | null;
} {
  if (typeof window === "undefined" || !window.location?.search) {
    return { screen: null, permission: false, menu: false, lang: null };
  }
  const q = new URLSearchParams(window.location.search);
  return {
    screen: q.get("screen"),
    permission: q.get("permission") === "1",
    menu: q.get("menu") === "1",
    lang: q.get("lang"),
  };
}

function Shell() {
  const [screen, setScreen] = useState<Screen>(DEMO ? "sessions" : "boot");
  const phase = useConnectionStore((s) => s.phase);
  const connect = useConnectionStore((s) => s.connect);
  const kick = useConnectionStore((s) => s.kick);

  // Boot: reconnect to the most recently used computer, else go pair.
  useEffect(() => {
    if (DEMO) {
      const p = demoParams();
      if (p.lang) setLanguage(p.lang as AppLanguage);
      void import("./src/demo").then((m) => m.seedDemo(p.permission));
      if (p.screen === "chat" || p.screen === "pair") setScreen(p.screen);
      return;
    }
    void (async () => {
      const computers = await listComputers();
      const last = computers.sort(
        (a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0),
      )[0];
      if (!last) {
        setScreen("pair");
        return;
      }
      setScreen("sessions");
      void connect(last);
    })();
  }, [connect]);

  // Foregrounding retries a dead connection immediately.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") kick();
    });
    return () => sub.remove();
  }, [kick]);

  useEffect(() => {
    if (phase === "pairingRequired") setScreen("pair");
  }, [phase]);

  const onPaired = (computer: PairedComputer): void => {
    setScreen("sessions");
    void connect(computer);
  };

  return (
    <View style={styles.root}>
      {screen === "pair" && <PairScreen onPaired={onPaired} />}
      {screen === "sessions" && <SessionsScreen onOpen={() => setScreen("chat")} />}
      {screen === "chat" && <ChatScreen onBack={() => setScreen("sessions")} />}
      {screen !== "pair" && <ConnectionBanner />}
    </View>
  );
}

/**
 * Reconnection is routine on a phone — screen off, wifi handover, a walk out
 * of range — so it announces itself quietly and only once it has lasted long
 * enough to be worth knowing about.
 */
function ConnectionBanner() {
  const insets = useSafeAreaInsets();
  const phase = useConnectionStore((s) => s.phase);
  const [shown, setShown] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (phase === "connected" || phase === "pairingRequired") {
      setShown(false);
      return;
    }
    const t = setTimeout(() => setShown(true), 1200);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: shown ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [shown, slide]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.banner,
        {
          paddingTop: insets.top + space.sm,
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }],
        },
      ]}
    >
      <Text style={styles.bannerText}>{t("conn.banner")}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: space.sm,
    backgroundColor: colors.attentionSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.attention,
    alignItems: "center",
  },
  bannerText: { ...type.caption, color: colors.attention, fontSize: 11.5 },
});
