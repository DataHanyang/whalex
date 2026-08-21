import { useEffect, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { colors } from "./src/theme";
import { listComputers, type PairedComputer } from "./src/lib/computers";
import { useConnectionStore } from "./src/stores/connectionStore";
import { PairScreen } from "./src/screens/PairScreen";
import { SessionsScreen } from "./src/screens/SessionsScreen";
import { ChatScreen } from "./src/screens/ChatScreen";

type Screen = "boot" | "pair" | "sessions" | "chat";

export default function App() {
  const [screen, setScreen] = useState<Screen>("boot");
  const phase = useConnectionStore((s) => s.phase);
  const connect = useConnectionStore((s) => s.connect);
  const kick = useConnectionStore((s) => s.kick);

  // Boot: reconnect to the most recently used computer, else go pair.
  useEffect(() => {
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
      <StatusBar style="light" />
      {screen === "pair" && <PairScreen onPaired={onPaired} />}
      {screen === "sessions" && <SessionsScreen onOpen={() => setScreen("chat")} />}
      {screen === "chat" && <ChatScreen onBack={() => setScreen("sessions")} />}
      {screen === "boot" && <View style={styles.root} />}
      {phase === "connecting" && screen !== "pair" && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Reconnecting…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 48,
    paddingBottom: 6,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
  },
  bannerText: { color: colors.text, fontSize: 12 },
});
