import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { colors, radius, space, type } from "../theme";
import { t } from "../i18n";
import { useMobileSession } from "../stores/sessionStore";
import { Sheet } from "./Sheet";

interface Checkpoint {
  boundary: number;
  ts: number;
  label: string;
  fileChanges: number;
}

/**
 * Roll the session back to an earlier point — the desktop's rewind dialog,
 * sheet-shaped. Tapping a checkpoint reverts conversation and file changes
 * after it, so the choice asks once more before it acts.
 */
export function RewindSheet({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const listCheckpoints = useMobileSession((s) => s.listCheckpoints);
  const rewind = useMobileSession((s) => s.rewind);
  const [items, setItems] = useState<Checkpoint[] | null>(null);
  const [confirm, setConfirm] = useState<Checkpoint | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setItems(null);
    setConfirm(null);
    setError(null);
    void listCheckpoints()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [visible, listCheckpoints]);

  const doRewind = async (boundary: number): Promise<void> => {
    setBusy(true);
    try {
      await rewind(boundary);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDismiss();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onDismiss={busy ? undefined : onDismiss}>
      <Text style={styles.title}>{t("rewind.title")}</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {items === null && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : items && items.length === 0 ? (
        <Text style={styles.empty}>{t("rewind.empty")}</Text>
      ) : (
        <ScrollView style={styles.scroll}>
          <View style={styles.group}>
            {items?.map((c) => (
              <Pressable
                key={c.boundary}
                style={[styles.row, confirm?.boundary === c.boundary && styles.rowOn]}
                onPress={() => setConfirm(c)}
                disabled={busy}
              >
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {c.label || t("rewind.emptyLabel")}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {new Date(c.ts).toLocaleTimeString()} ·{" "}
                    {t("rewind.fileChanges", { count: c.fileChanges })}
                  </Text>
                </View>
                {confirm?.boundary === c.boundary && (
                  <Feather name="check" size={15} color={colors.accent} />
                )}
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
      {confirm && (
        <View style={styles.confirmBox}>
          <Text style={styles.note}>{t("rewind.note")}</Text>
          <Pressable
            style={styles.confirmBtn}
            onPress={() => void doRewind(confirm.boundary)}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.confirmText}>{t("rewind.title")}</Text>
            )}
          </Pressable>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: {
    ...type.label,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: colors.faint,
    marginTop: space.sm,
    marginBottom: space.sm,
    marginLeft: space.lg + space.xs,
  },
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  empty: { ...type.caption, textAlign: "center", paddingVertical: space.xl },
  error: { ...type.caption, color: colors.danger, paddingHorizontal: space.lg },
  scroll: { maxHeight: 380 },
  group: {
    marginHorizontal: space.lg,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowOn: { backgroundColor: colors.accentSoft },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { ...type.ui },
  rowMeta: { ...type.caption, fontSize: 11.5 },
  confirmBox: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md },
  note: { ...type.caption, lineHeight: 18 },
  confirmBtn: {
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    alignItems: "center",
    paddingVertical: space.md + 1,
  },
  confirmText: { ...type.ui, color: "#fff", fontFamily: "PlexSansSemi" },
});
