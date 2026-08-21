import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { colors, radius, space, type } from "../theme";
import { useMobileSession } from "../stores/sessionStore";

/**
 * Sending while a turn is running is steering, not a new request — the
 * message queues into the running turn. The composer says so, because the
 * difference decides whether you get an answer now or a course correction.
 */
export function Composer() {
  const status = useMobileSession((s) => s.status);
  const send = useMobileSession((s) => s.send);
  const abort = useMobileSession((s) => s.abort);
  const [draft, setDraft] = useState("");
  const running = status !== "idle";
  const ready = draft.trim().length > 0;

  const submit = (): void => {
    if (!ready) return;
    const text = draft.trim();
    setDraft("");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void send(text);
  };

  return (
    <View style={styles.wrap}>
      {running && (
        <View style={styles.steerHint}>
          <Feather name="corner-down-right" size={11} color={colors.deep} />
          <Text style={styles.steerText}>Queues into the running turn</Text>
        </View>
      )}
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder={running ? "Steer the agent…" : "What should it work on?"}
          placeholderTextColor={colors.deep}
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        {running && !ready ? (
          <Pressable
            style={[styles.btn, styles.stop]}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              void abort();
            }}
            hitSlop={6}
          >
            <Feather name="square" size={15} color={colors.coral} />
          </Pressable>
        ) : (
          <Pressable
            style={[styles.btn, ready ? styles.send : styles.sendOff]}
            onPress={submit}
            disabled={!ready}
            hitSlop={6}
          >
            <Feather name="arrow-up" size={18} color={ready ? colors.abyss : colors.deep} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.abyss,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  steerHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingBottom: space.sm,
    paddingLeft: space.xs,
  },
  steerText: { ...type.caption, fontSize: 11.5 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  input: {
    ...type.body,
    flex: 1,
    maxHeight: 132,
    minHeight: 44,
    backgroundColor: colors.hull,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  send: { backgroundColor: colors.sonar },
  sendOff: { backgroundColor: colors.hull, borderWidth: 1, borderColor: colors.line },
  stop: { backgroundColor: colors.coralSoft, borderWidth: 1, borderColor: colors.coral },
});
