import { useEffect, useMemo, useRef } from "react";
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
import type { TranscriptItem } from "@whalex/shared";
import { colors, radius, space, type } from "../theme";
import { useMobileSession } from "../stores/sessionStore";
import { useConnectionStore } from "../stores/connectionStore";
import { TranscriptRow } from "../components/Transcript";
import { Composer } from "../components/Composer";
import { PermissionSheet } from "../components/PermissionSheet";
import { QuestionSheet } from "../components/QuestionSheet";

const STATUS: Record<string, { label: string; color: string }> = {
  thinking: { label: "Thinking", color: colors.sonar },
  streaming: { label: "Writing", color: colors.sonar },
  tool: { label: "Working", color: colors.beacon },
  idle: { label: "Idle", color: colors.deep },
};

export function ChatScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const transcript = useMobileSession((s) => s.transcript);
  const status = useMobileSession((s) => s.status);
  const usage = useMobileSession((s) => s.usage);
  const cwd = useMobileSession((s) => s.cwd);
  const closeSession = useMobileSession((s) => s.closeSession);
  const phase = useConnectionStore((s) => s.phase);

  // Inverted list: newest at the bottom without measuring or scrolling.
  const rows = useMemo(() => [...transcript].reverse(), [transcript]);
  const folder = cwd?.split(/[\\/]/).filter(Boolean).pop() ?? "Session";
  const state = STATUS[status] ?? STATUS.idle!;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Pressable
          style={styles.back}
          onPress={() => {
            closeSession();
            onBack();
          }}
          hitSlop={10}
        >
          <Feather name="chevron-left" size={20} color={colors.mist} />
        </Pressable>
        <View style={styles.barMid}>
          <Text style={styles.folder} numberOfLines={1}>
            {folder}
          </Text>
          <View style={styles.statusRow}>
            {status !== "idle" && <Pulse color={state.color} />}
            <Text style={[styles.status, { color: state.color }]}>
              {phase === "connected" ? state.label : "Reconnecting"}
            </Text>
            {usage && <Text style={styles.usage}>· {usage.contextPct}% context</Text>}
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top}
      >
        <FlatList
          inverted
          data={rows}
          keyExtractor={(t: TranscriptItem) => t.id}
          renderItem={({ item }) => <TranscriptRow item={item} />}
          contentContainerStyle={styles.list}
          keyboardDismissMode="interactive"
          ListEmptyComponent={<Empty />}
        />
        <Composer />
      </KeyboardAvoidingView>

      <PermissionSheet />
      <QuestionSheet />
    </View>
  );
}

function Empty() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Nothing here yet</Text>
      <Text style={styles.emptyBody}>Send the first instruction to start this session.</Text>
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
  root: { flex: 1, backgroundColor: colors.abyss },
  flex: { flex: 1 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.sm,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  back: { padding: space.sm },
  barMid: { flex: 1, gap: 2 },
  folder: { ...type.ui, fontFamily: "PlexSansSemi" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  dot: { width: 6, height: 6, borderRadius: radius.pill },
  status: { ...type.caption, fontSize: 11.5 },
  usage: { ...type.caption, fontSize: 11.5 },
  list: { paddingHorizontal: space.lg, paddingVertical: space.lg },
  empty: {
    // The list is inverted, so its empty state has to be too.
    transform: [{ scaleY: -1 }],
    alignItems: "center",
    paddingTop: space.xxxl,
    gap: space.sm,
  },
  emptyTitle: { ...type.heading, color: colors.mist },
  emptyBody: { ...type.caption, textAlign: "center" },
});
