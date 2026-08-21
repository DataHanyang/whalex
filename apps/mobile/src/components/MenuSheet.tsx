import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { colors, radius, space, type } from "../theme";
import { useMobileSession } from "../stores/sessionStore";
import { useConnectionStore } from "../stores/connectionStore";
import { Sheet } from "./Sheet";

type Mode = "default" | "acceptEdits" | "bypassPermissions" | "plan" | "unrestricted";

/**
 * Everything that isn't sending a message. The phone screen is small enough
 * that a permanent control strip would cost more than it returns, so the
 * settings that change how a turn behaves live one tap away instead.
 */
const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: "default", label: "Ask first", hint: "Approve each write and command" },
  { id: "acceptEdits", label: "Auto-edit", hint: "File changes go through, commands still ask" },
  { id: "bypassPermissions", label: "Auto-run", hint: "Nothing stops to ask you" },
  { id: "plan", label: "Plan only", hint: "Research and propose, change nothing" },
];

export function MenuSheet({
  visible,
  onDismiss,
  onSwitchSession,
}: {
  visible: boolean;
  onDismiss: () => void;
  onSwitchSession: () => void;
}) {
  const mode = useMobileSession((s) => s.permissionMode);
  const setMode = useMobileSession((s) => s.setPermissionMode);
  const cwd = useMobileSession((s) => s.cwd);
  const usage = useMobileSession((s) => s.usage);
  const startNew = useMobileSession((s) => s.startNew);
  const hello = useConnectionStore((s) => s.hello);

  const pick = (id: Mode): void => {
    void Haptics.selectionAsync();
    void setMode(id);
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.section}>How it should work</Text>
        <View style={styles.group}>
          {MODES.map((m) => {
            const on = mode === m.id;
            return (
              <Pressable
                key={m.id}
                style={[styles.mode, on && styles.modeOn]}
                onPress={() => pick(m.id)}
              >
                <View style={styles.modeText}>
                  <Text style={[styles.modeLabel, on && { color: colors.sonar }]}>{m.label}</Text>
                  <Text style={styles.modeHint}>{m.hint}</Text>
                </View>
                {on && <Feather name="check" size={15} color={colors.sonar} />}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.section}>Session</Text>
        <View style={styles.group}>
          <Row
            icon="folder"
            label="Switch project or session"
            value={cwd?.split(/[\\/]/).filter(Boolean).pop()}
            onPress={() => {
              onDismiss();
              onSwitchSession();
            }}
          />
          {cwd && (
            <Row
              icon="plus"
              label="New session here"
              onPress={() => {
                onDismiss();
                void startNew(cwd);
              }}
            />
          )}
        </View>

        <Text style={styles.section}>Computer</Text>
        <View style={styles.group}>
          <Row icon="monitor" label={hello?.name ?? "Connected"} value={hello?.serverVersion} />
          {usage && (
            <Row
              icon="activity"
              label="Context used"
              value={`${usage.contextPct}% · $${usage.costUsd.toFixed(3)}`}
            />
          )}
        </View>
      </ScrollView>
    </Sheet>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && onPress ? styles.rowPressed : null]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Feather name={icon} size={15} color={colors.mist} />
      <Text style={styles.rowLabel}>{label}</Text>
      {!!value && (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      )}
      {onPress && <Feather name="chevron-right" size={15} color={colors.deep} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  section: {
    ...type.label,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: colors.deep,
    marginTop: space.md,
    marginLeft: space.xs,
  },
  group: {
    backgroundColor: colors.hull2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  mode: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  modeOn: { backgroundColor: colors.sonarSoft },
  modeText: { flex: 1, gap: 2 },
  modeLabel: { ...type.ui },
  modeHint: { ...type.caption, fontSize: 11.5 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md + 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowPressed: { backgroundColor: colors.hull },
  rowLabel: { ...type.ui, flex: 1 },
  rowValue: { ...type.caption, maxWidth: 140, textAlign: "right" },
});
