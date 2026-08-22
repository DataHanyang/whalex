import { useState } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { colors, radius, space, type } from "../theme";
import { t } from "../i18n";
import { useMobileSession } from "../stores/sessionStore";

/** Looked up per render, not cached, so switching language redraws the chip. */
function modeLabel(mode: string): string {
  const keys: Record<string, Parameters<typeof t>[0]> = {
    default: "mode.default",
    acceptEdits: "mode.acceptEdits",
    bypassPermissions: "mode.bypassPermissions",
    unrestricted: "mode.unrestricted",
    plan: "mode.plan",
  };
  const key = keys[mode];
  return key ? t(key) : mode;
}

/** deepseek-v4-pro → v4 pro. The provider prefix is noise on a phone. */
function shortModel(id: string): string {
  return id.replace(/^deepseek-/, "").replace(/-/g, " ");
}

/**
 * The field carries its own controls: which model is answering and whether it
 * will stop to ask you are both decisions about the message you are typing, so
 * they sit with it rather than behind a settings screen.
 */
export function Composer({
  onOpenWork,
  onOpenModel,
  onOpenMode,
}: {
  onOpenWork: () => void;
  onOpenModel: () => void;
  onOpenMode: () => void;
}) {
  const status = useMobileSession((s) => s.status);
  const mode = useMobileSession((s) => s.permissionMode);
  const model = useMobileSession((s) => s.model);
  const send = useMobileSession((s) => s.send);
  const abort = useMobileSession((s) => s.abort);
  const attachments = useMobileSession((s) => s.attachments);
  const removeAttachment = useMobileSession((s) => s.removeAttachment);
  const [draft, setDraft] = useState("");
  const running = status !== "idle";
  const ready = draft.trim().length > 0 || attachments.length > 0;

  const submit = (): void => {
    if (!ready) return;
    const text = draft.trim();
    setDraft("");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void send(text);
  };

  return (
    <View style={styles.wrap}>
      {attachments.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.attachRow}>
          {attachments.map((a) => (
            <View key={a.id} style={styles.attachChip}>
              {a.kind === "image" && a.uri ? (
                <Image source={{ uri: a.uri }} style={styles.attachThumb} />
              ) : (
                <Feather name="file-text" size={13} color={colors.muted} />
              )}
              <Text style={styles.attachName} numberOfLines={1}>
                {a.name}
              </Text>
              <Pressable onPress={() => removeAttachment(a.id)} hitSlop={8}>
                <Feather name="x" size={13} color={colors.faint} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={styles.field}>
        <TextInput
          style={styles.input}
          placeholder={running ? t("composer.placeholderRunning") : t("mobile.composer.placeholder")}
          placeholderTextColor={colors.faint}
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <View style={styles.controls}>
          {/* Three controls, three sheets — each opens exactly what it names. */}
          <Pressable style={styles.plus} onPress={onOpenWork} hitSlop={8}>
            <Feather name="plus" size={16} color={colors.muted} />
          </Pressable>

          <Pressable style={styles.chip} onPress={onOpenModel} hitSlop={6}>
            <Text style={styles.chipText}>{shortModel(model)}</Text>
          </Pressable>

          <Pressable style={styles.chip} onPress={onOpenMode} hitSlop={6}>
            <Feather name="zap" size={11} color={colors.muted} />
            <Text style={styles.chipText}>{modeLabel(mode)}</Text>
          </Pressable>

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
              <Feather name="square" size={13} color={colors.danger} />
            </Pressable>
          ) : (
            <Pressable
              style={[styles.action, ready ? styles.send : styles.sendOff]}
              onPress={submit}
              disabled={!ready}
              hitSlop={8}
            >
              <Feather name="arrow-up" size={17} color={ready ? "#fff" : colors.faint} />
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
    paddingBottom: space.md,
    backgroundColor: colors.bg,
  },
  attachRow: { marginBottom: space.sm, flexGrow: 0 },
  attachChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingLeft: space.sm,
    paddingRight: space.md,
    paddingVertical: space.xs + 1,
    marginRight: space.sm,
    maxWidth: 220,
  },
  attachThumb: { width: 24, height: 24, borderRadius: radius.sm },
  attachName: { ...type.caption, color: colors.text, flexShrink: 1 },
  field: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingTop: space.md + 2,
    paddingBottom: space.sm,
    // A soft lift, so the field reads as sitting above the transcript.
    ...Platform.select({
      android: { elevation: 2 },
      default: {
        shadowColor: "#0B1220",
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
    }),
  },
  input: { ...type.body, maxHeight: 150, minHeight: 24, padding: 0 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.md,
  },
  plus: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 1,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  chipText: { ...type.label, fontSize: 11.5, color: colors.muted },
  spacer: { flex: 1 },
  action: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  send: { backgroundColor: colors.accent },
  sendOff: { backgroundColor: colors.surface },
  stop: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
});
