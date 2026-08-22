import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { colors, radius, space, type } from "../theme";
import { useMobileSession } from "../stores/sessionStore";
import { useConnectionStore } from "../stores/connectionStore";
import { TranscriptRow } from "../components/Transcript";
import { toRows, type Row } from "../components/transcriptRows";
import { Composer } from "../components/Composer";
import { MenuSheet } from "../components/MenuSheet";
import { PermissionSheet } from "../components/PermissionSheet";
import { QuestionSheet } from "../components/QuestionSheet";

const STATUS: Record<string, { label: string; color: string }> = {
  thinking: { label: "Thinking", color: colors.live },
  streaming: { label: "Writing", color: colors.live },
  tool: { label: "Working", color: colors.attention },
  idle: { label: "Ready", color: colors.faint },
};

export function ChatScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const transcript = useMobileSession((s) => s.transcript);
  const status = useMobileSession((s) => s.status);
  const cwd = useMobileSession((s) => s.cwd);
  const sessions = useMobileSession((s) => s.sessions);
  const activeSessionId = useMobileSession((s) => s.activeSessionId);
  const closeSession = useMobileSession((s) => s.closeSession);
  const phase = useConnectionStore((s) => s.phase);
  // Preview builds can land straight on the menu for a design review.
  const [menu, setMenu] = useState(
    typeof window !== "undefined" && window.location?.search?.includes("menu=1"),
  );

  // Inverted list: newest at the bottom without measuring or scrolling.
  const rows = useMemo(() => toRows(transcript).reverse(), [transcript]);
  const folder = cwd?.split(/[\\/]/).filter(Boolean).pop() ?? "Session";
  const state = STATUS[status] ?? STATUS.idle!;
  // The session's own title names the work; the folder names where it happens.
  const title =
    sessions.find((s) => s.sessionId === activeSessionId)?.title?.trim() || folder;

  const leave = (): void => {
    closeSession();
    onBack();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Pressable style={styles.iconBtn} onPress={leave} hitSlop={10}>
          <Feather name="chevron-left" size={21} color={colors.muted} />
        </Pressable>
        <View style={styles.barMid}>
          <Text style={styles.heading} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.statusRow}>
            {status !== "idle" && <Pulse color={state.color} />}
            <Text style={[styles.sub, status !== "idle" && { color: state.color }]}>
              {phase !== "connected"
                ? "Reconnecting"
                : status !== "idle"
                  ? state.label
                  : folder}
            </Text>
          </View>
        </View>
        <Pressable style={styles.iconBtn} onPress={() => setMenu(true)} hitSlop={10}>
          <Feather name="more-horizontal" size={20} color={colors.muted} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top}
      >
        <FlatList
          inverted
          data={rows}
          keyExtractor={(t: Row) => t.id}
          renderItem={({ item }) => <TranscriptRow item={item} />}
          contentContainerStyle={styles.list}
          keyboardDismissMode="interactive"
          ListEmptyComponent={<Empty />}
        />
        <Composer onOpenMenu={() => setMenu(true)} />
      </KeyboardAvoidingView>

      <MenuSheet visible={menu} onDismiss={() => setMenu(false)} onSwitchSession={leave} />
      <PermissionSheet />
      <QuestionSheet />
    </View>
  );
}

function Empty() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Ready when you are</Text>
      <Text style={styles.emptyBody}>
        Describe what you want built, fixed or investigated.
      </Text>
    </View>
  );
}

/** A slow breath, so "working" reads as alive without pulling the eye. */
function Pulse({ color }: { color: string }) {
  const v = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 780, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.35, duration: 780, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[styles.dot, { backgroundColor: color, opacity: v }]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.sm,
    paddingBottom: space.md,
  },
  iconBtn: { padding: space.sm },
  barMid: { flex: 1, gap: 1, alignItems: "center", paddingHorizontal: space.sm },
  heading: { ...type.ui, fontFamily: "PlexSansSemi", fontSize: 15 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  dot: { width: 6, height: 6, borderRadius: radius.pill },
  sub: { ...type.caption, fontSize: 11.5 },
  list: { paddingHorizontal: space.lg, paddingVertical: space.lg },
  empty: {
    // The list is inverted, so its empty state has to be too.
    transform: [{ scaleY: -1 }],
    alignItems: "center",
    paddingTop: space.xxxl,
    gap: space.sm,
  },
  emptyTitle: { ...type.heading, color: colors.muted },
  emptyBody: { ...type.caption, textAlign: "center" },
});
