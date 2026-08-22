import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { colors, radius, space, type } from "../theme";
import { t } from "../i18n";
import { useMobileSession } from "../stores/sessionStore";

/**
 * The plan is waiting on a verdict — the same three buttons the desktop puts
 * above its composer, because a phone left on a plan-mode turn used to be
 * simply stuck.
 */
export function PlanBar() {
  const planPending = useMobileSession((s) => s.planPending);
  const superCode = useMobileSession((s) => s.superCode);
  const clear = useMobileSession((s) => s.clearPlanPending);
  const setMode = useMobileSession((s) => s.setPermissionMode);
  const send = useMobileSession((s) => s.send);
  const setDraftSeed = useMobileSession((s) => s.setDraftSeed);

  if (!planPending) return null;

  return (
    <View style={styles.bar}>
      <View style={styles.head}>
        <Feather name="clipboard" size={13} color={colors.accent} />
        <Text style={styles.headText}>{t("plan.ready")}</Text>
      </View>
      <View style={styles.buttons}>
        <Pressable
          style={[styles.btn, styles.accept]}
          onPress={() => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            clear();
            // SuperCode forces plan mode only for the planning stage.
            void setMode(superCode ? "bypassPermissions" : "default");
            void send("I accept the plan. Exit plan mode and implement it now.");
          }}
        >
          <Feather name="check-circle" size={13} color="#fff" />
          <Text style={styles.acceptText}>{t("plan.accept")}</Text>
        </Pressable>
        <Pressable
          style={styles.btn}
          onPress={() => {
            clear();
            setDraftSeed(t("plan.revisePrefix"));
          }}
        >
          <Feather name="edit-3" size={13} color={colors.muted} />
          <Text style={styles.btnText}>{t("plan.revise")}</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.reject]}
          onPress={() => {
            clear();
            void send("The plan is rejected. Do not proceed with it.");
          }}
        >
          <Feather name="x-circle" size={13} color={colors.danger} />
          <Text style={[styles.btnText, { color: colors.danger }]}>{t("plan.reject")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: space.md,
    marginBottom: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
    gap: space.md,
  },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  headText: { ...type.ui, color: colors.accent, flex: 1 },
  buttons: { flexDirection: "row", gap: space.sm },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: space.md,
  },
  accept: { backgroundColor: colors.accent, borderColor: colors.accent },
  acceptText: { ...type.ui, fontSize: 13, color: "#fff" },
  reject: { borderColor: colors.dangerSoft },
  btnText: { ...type.ui, fontSize: 13, color: colors.muted },
});
