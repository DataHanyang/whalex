import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import type { PermissionRequest } from "@whalex/shared";
import { colors, radius, space, type } from "../theme";
import { plural, t } from "../i18n";
import { useMobileSession } from "../stores/sessionStore";
import { CodeBlock } from "./CodeBlock";
import { DiffView } from "./DiffView";
import { Sheet } from "./Sheet";

/**
 * The reason this app exists: granting the desktop agent permission to do
 * something consequential while you are nowhere near the machine.
 *
 * So the design puts the consequence first — what will happen, stated as a
 * plain sentence, then the exact payload — and the buttons last. Nothing is
 * dismissable by tapping away: an unanswered request leaves an agent blocked.
 */

const KIND: Record<
  string,
  { icon: keyof typeof Feather.glyphMap; label: Parameters<typeof t>[0] }
> = {
  execute: { icon: "terminal", label: "perm.execute" },
  edit: { icon: "edit-3", label: "perm.edit" },
  read: { icon: "file-text", label: "perm.read" },
  fetch: { icon: "globe", label: "perm.fetch" },
  other: { icon: "shield", label: "perm.other" },
};

export function PermissionSheet() {
  const pending = useMobileSession((s) => s.pendingPermissions);
  const respond = useMobileSession((s) => s.respondPermission);
  const request = pending[0];
  const [busy, setBusy] = useState(false);

  const answer = async (allow: boolean, always = false): Promise<void> => {
    if (!request || busy) return;
    setBusy(true);
    void Haptics.notificationAsync(
      allow ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
    );
    try {
      await respond(request.id, allow, always);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={Boolean(request)} accent={colors.attention}>
      {request && (
        <Body
          request={request}
          queued={pending.length - 1}
          busy={busy}
          onAnswer={(allow, always) => void answer(allow, always)}
        />
      )}
    </Sheet>
  );
}

function Body({
  request,
  queued,
  busy,
  onAnswer,
}: {
  request: PermissionRequest;
  queued: number;
  busy: boolean;
  onAnswer: (allow: boolean, always?: boolean) => void;
}) {
  const kind = KIND[request.kind] ?? KIND.other!;
  const args = request.args as Record<string, unknown> | undefined;
  const command = typeof args?.command === "string" ? args.command : null;

  return (
    <>
      <View style={styles.head}>
        <View style={styles.badge}>
          <Feather name={kind.icon} size={14} color={colors.attention} />
        </View>
        <View style={styles.headText}>
          <Text style={styles.label}>{t(kind.label)}</Text>
          <Text style={styles.summary}>{request.summary}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
        {request.diff && (
          <DiffView
            path={request.diff.path}
            oldText={request.diff.oldText}
            newText={request.diff.newText}
            maxRows={120}
          />
        )}
        {!request.diff && command && <CodeBlock code={command} language="shell" wrap />}
        {!request.diff && !command && Object.keys(request.args ?? {}).length > 0 && (
          <CodeBlock code={JSON.stringify(request.args, null, 2)} language="json" />
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          style={[styles.btn, styles.deny]}
          onPress={() => onAnswer(false)}
          disabled={busy}
        >
          <Text style={styles.denyText}>{t("permission.deny")}</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.allow]}
          onPress={() => onAnswer(true)}
          disabled={busy}
        >
          <Text style={styles.allowText}>{t("permission.allowOnce")}</Text>
        </Pressable>
      </View>

      {request.suggestedRules.length > 0 && (
        <Pressable style={styles.always} onPress={() => onAnswer(true, true)} disabled={busy}>
          <Text style={styles.alwaysText}>
            {t("permission.allowAlways")} <Text style={styles.rule}>{request.suggestedRules[0]}</Text>
          </Text>
        </Pressable>
      )}

      {queued > 0 && (
        <Text style={styles.queued}>
          {plural("perm.waiting_one", "perm.waiting_other", queued)}
        </Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.attentionSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  headText: { flex: 1, gap: 3 },
  label: { ...type.label, color: colors.attention, textTransform: "uppercase", letterSpacing: 0.7 },
  summary: { ...type.heading, lineHeight: 22 },
  scroll: { maxHeight: 340 },
  scrollBody: { paddingHorizontal: space.xl },
  actions: {
    flexDirection: "row",
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
  },
  btn: {
    flex: 1,
    paddingVertical: space.md + 2,
    borderRadius: radius.md,
    alignItems: "center",
  },
  deny: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  denyText: { ...type.ui, color: colors.muted },
  allow: { backgroundColor: colors.accent },
  allowText: { ...type.ui, color: colors.bg, fontFamily: "PlexSansSemi" },
  always: { paddingVertical: space.md, alignItems: "center" },
  alwaysText: { ...type.caption, color: colors.muted },
  rule: { ...type.monoSmall, color: colors.accent },
  queued: { ...type.caption, textAlign: "center", paddingBottom: space.sm },
});
