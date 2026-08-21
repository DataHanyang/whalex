import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { colors, radius, space, type } from "../theme";
import { useMobileSession } from "../stores/sessionStore";

const MODE_LABEL: Record<string, string> = {
  default: "Ask first",
  acceptEdits: "Auto-edit",
  bypassPermissions: "Auto-run",
  unrestricted: "Unrestricted",
  plan: "Plan only",
};

/**
 * One rounded field holding the text and its controls, the way the desktop
 * composer works: the mode you are in is part of the input, because it
 * decides whether what you send will stop to ask you anything.
 */
export function Composer({ onOpenMenu }: { onOpenMenu: () => void }) {
  const status = useMobileSession((s) => s.status);
  const mode = useMobileSession((s) => s.permissionMode);
  const send = useMobileSession((s) => s.send);
  const abort = useMobileSession((s) => s.abort);
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
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
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <TextInput
          style={styles.input}
          placeholder={running ? "Add to the running turn…" : "What should it work on?"}
          placeholderTextColor={colors.deep}
          value={draft}
          onChangeText={setDraft}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline
        />
        <View style={styles.controls}>
          <Pressable style={styles.chip} onPress={onOpenMenu} hitSlop={8}>
            <Feather name="sliders" size={12} color={colors.mist} />
            <Text style={styles.chipText}>{MODE_LABEL[mode] ?? mode}</Text>
          </Pressable>

          {running && <Text style={styles.queueHint}>queues</Text>}

          <View style={styles.spacer} />

          {running && !ready ? (
            <Pressable
              style={[styles.action, styles.stop]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                void abort();
              }}
              hitSlop={8}
            >
              <Feather name="square" size={13} color={colors.coral} />
            </Pressable>
          ) : (
            <Pressable
              style={[styles.action, ready ? styles.send : styles.sendOff]}
              onPress={submit}
              disabled={!ready}
              hitSlop={8}
            >
              <Feather name="arrow-up" size={16} color={ready ? "#fff" : colors.deep} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    backgroundColor: colors.abyss,
  },
  field: {
    backgroundColor: colors.hull,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  fieldFocused: { borderColor: colors.lineStrong },
  input: {
    ...type.body,
    maxHeight: 150,
    minHeight: 24,
    padding: 0,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 1,
    backgroundColor: colors.hull2,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 5,
  },
  chipText: { ...type.label, fontSize: 11, color: colors.mist },
  queueHint: { ...type.caption, fontSize: 11, color: colors.deep },
  spacer: { flex: 1 },
  action: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  send: { backgroundColor: colors.sonar },
  sendOff: { backgroundColor: colors.hull2 },
  stop: { backgroundColor: colors.coralSoft, borderWidth: 1, borderColor: colors.coral },
});
