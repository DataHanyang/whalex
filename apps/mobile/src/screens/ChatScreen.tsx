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
import { t } from "../i18n";
import { useMobileSession } from "../stores/sessionStore";
import { useConnectionStore } from "../stores/connectionStore";
import { TranscriptRow } from "../components/Transcript";
import { toRows, type Row } from "../components/transcriptRows";
import { Composer } from "../components/Composer";
import { MenuSheet } from "../components/MenuSheet";
import { ModeSheet, ModelSheet, WorkSheet } from "../components/PickerSheets";
import { PermissionSheet } from "../components/PermissionSheet";
import { QuestionSheet } from "../components/QuestionSheet";

const STATUS: Record<string, { label: Parameters<typeof t>[0]; color: string }> = {
  thinking: { label: "chat.thinking", color: colors.live },
  streaming: { label: "chat.writing", color: colors.live },
  tool: { label: "chat.working", color: colors.attention },
  idle: { label: "chat.ready", color: colors.faint },
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
  /** Which composer picker is open — each control gets its own sheet. */
  const [picker, setPicker] = useState<"work" | "model" | "mode" | null>(
    typeof window !== "undefined" && window.location?.search?.includes("picker=work")
      ? "work"
      : null,
  );

  // Inverted list: newest at the bottom without measuring or scrolling.
  const rows = useMemo(() => toRows(transcript).reverse(), [transcript]);
  const folder = cwd?.split(/[\\/]/).filter(Boolean).pop() ?? t("chat.session");
  const state = STATUS[status] ?? STATUS.idle!;
  // The session's own title names the work; the folder names where it happens.
  const title =
    sessions.find((s) => s.sessionId === activeSessionId)?.title?.trim() || folder;

  const leave = (): void => {
    closeSession();
    onBack();
  };

  return (
    <View style={styles.root}>
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
                ? t("conn.reconnecting")
                : status !== "idle"
                  ? t(state.label)
                  : folder}
            </Text>
          </View>
        </View>
        <Pressable style={styles.iconBtn} onPress={() => setMenu(true)} hitSlop={10}>
          <Feather name="more-horizontal" size={20} color={colors.muted} />
        </Pressable>
      </View>

      {/* Android too: edge-to-edge (mandatory on recent SDKs) stops the OS
          from resizing the window for the keyboard, so relying on
          adjustResize left the composer buried under it. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
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
        <Composer
          onOpenWork={() => setPicker("work")}
          onOpenModel={() => setPicker("model")}
          onOpenMode={() => setPicker("mode")}
        />
      </KeyboardAvoidingView>

      <MenuSheet visible={menu} onDismiss={() => setMenu(false)} onSwitchSession={leave} />
      <WorkSheet visible={picker === "work"} onDismiss={() => setPicker(null)} />
      <ModelSheet visible={picker === "model"} onDismiss={() => setPicker(null)} />
      <ModeSheet visible={picker === "mode"} onDismiss={() => setPicker(null)} />
      <PermissionSheet />
      <QuestionSheet />
    </View>
  );
}

function Empty() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{t("chat.emptyTitle")}</Text>
      <Text style={styles.emptyBody}>
        {t("chat.emptyBody")}
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
    // The list is inverted, so its empty state must counter with the exact
    // transform VirtualizedList uses per platform: Android inverts with
    // scale:-1 (a 180° turn), everything else with scaleY:-1. Countering
    // Android's turn with a vertical-only flip leaves a horizontal mirror —
    // on a real phone the title rendered right-to-left.
    transform: Platform.OS === "android" ? [{ scale: -1 }] : [{ scaleY: -1 }],
    alignItems: "center",
    paddingTop: space.xxxl,
    gap: space.sm,
  },
  emptyTitle: { ...type.heading, color: colors.muted },
  emptyBody: { ...type.caption, textAlign: "center" },
});
