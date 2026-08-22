import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { colors, radius, space, type } from "../theme";
import { LANGUAGES, currentLanguage, setLanguage, t, useLanguage } from "../i18n";
import { useMobileSession } from "../stores/sessionStore";
import { useConnectionStore } from "../stores/connectionStore";
import { checkForUpdate, currentVersion, type UpdateInfo } from "../lib/appUpdate";
import { Sheet } from "./Sheet";

/**
 * The housekeeping menu: session switching, the computer, language, updates.
 * Turn-shaping controls (mode, model, work options) moved to the composer's
 * own picker sheets — this stopped being the junk drawer for all of them.
 */
export function MenuSheet({
  visible,
  onDismiss,
  onSwitchSession,
}: {
  visible: boolean;
  onDismiss: () => void;
  onSwitchSession: () => void;
}) {
  const cwd = useMobileSession((s) => s.cwd);
  const usage = useMobileSession((s) => s.usage);
  const startNew = useMobileSession((s) => s.startNew);
  const hello = useConnectionStore((s) => s.hello);
  const language = useLanguage();
  const [pickingLanguage, setPickingLanguage] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);

  // Checked when the menu opens rather than at launch: an update banner is
  // not what you want to meet while an approval is waiting on you.
  useEffect(() => {
    if (!visible) return;
    let live = true;
    setChecking(true);
    void checkForUpdate()
      .then((found) => live && setUpdate(found))
      .catch(() => undefined)
      .finally(() => live && setChecking(false));
    return () => {
      live = false;
    };
  }, [visible]);

  const languageLabel =
    language === "system"
      ? t("menu.languageSystem")
      : (LANGUAGES.find(([code]) => code === language)?.[1] ?? language);

  return (
    <Sheet visible={visible} onDismiss={onDismiss}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.section}>{t("menu.session")}</Text>
        <View style={styles.group}>
          <Row
            icon="folder"
            label={t("menu.switch")}
            value={cwd?.split(/[\\/]/).filter(Boolean).pop()}
            onPress={() => {
              onDismiss();
              onSwitchSession();
            }}
          />
          {cwd && (
            <Row
              icon="plus"
              label={t("menu.newHere")}
              onPress={() => {
                onDismiss();
                void startNew(cwd);
              }}
            />
          )}
        </View>

        <Text style={styles.section}>{t("menu.computer")}</Text>
        <View style={styles.group}>
          <Row
            icon="monitor"
            label={hello?.name ?? t("conn.connected")}
            value={hello?.serverVersion}
          />
          {usage && (
            <Row
              icon="activity"
              label={t("menu.contextUsed")}
              value={`${usage.contextPct}% · $${usage.costUsd.toFixed(3)}`}
            />
          )}
          <Row
            icon="globe"
            label={t("menu.language")}
            value={languageLabel}
            onPress={() => setPickingLanguage((p) => !p)}
          />
          {pickingLanguage && (
            <View style={styles.languages}>
              <Pressable
                style={styles.language}
                onPress={() => {
                  setLanguage("system");
                  setPickingLanguage(false);
                }}
              >
                <Text style={styles.languageText}>{t("menu.languageSystem")}</Text>
                {currentLanguage() === "system" && (
                  <Feather name="check" size={14} color={colors.accent} />
                )}
              </Pressable>
              {LANGUAGES.map(([code, label]) => (
                <Pressable
                  key={code}
                  style={styles.language}
                  onPress={() => {
                    setLanguage(code);
                    setPickingLanguage(false);
                  }}
                >
                  <Text style={styles.languageText}>{label}</Text>
                  {currentLanguage() === code && (
                    <Feather name="check" size={14} color={colors.accent} />
                  )}
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <Text style={styles.section}>{t("update.section")}</Text>
        <View style={styles.group}>
          {update ? (
            <Pressable
              style={({ pressed }) => [styles.row, styles.rowUpdate, pressed && styles.rowPressed]}
              onPress={() => void Linking.openURL(update.url)}
            >
              <Feather name="download" size={15} color={colors.accent} />
              <Text style={[styles.rowLabel, { color: colors.accent }]}>
                {t("update.available", { version: update.version })}
              </Text>
              <Feather name="chevron-right" size={15} color={colors.accent} />
            </Pressable>
          ) : (
            <View style={styles.row}>
              <Feather name="smartphone" size={15} color={colors.muted} />
              <Text style={styles.rowLabel}>{t("update.current", { v: currentVersion })}</Text>
              {checking ? (
                <ActivityIndicator size="small" color={colors.faint} />
              ) : (
                <Text style={styles.rowValue}>{t("update.upToDate")}</Text>
              )}
            </View>
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
      <Feather name={icon} size={15} color={colors.muted} />
      <Text style={styles.rowLabel}>{label}</Text>
      {!!value && (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      )}
      {onPress && <Feather name="chevron-right" size={15} color={colors.faint} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  section: {
    ...type.label,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: colors.faint,
    marginTop: space.md,
    marginLeft: space.xs,
  },
  group: {
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
    paddingVertical: space.md + 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.surface },
  rowUpdate: { backgroundColor: colors.accentSoft },
  rowLabel: { ...type.ui, flex: 1 },
  languages: { backgroundColor: colors.bg },
  language: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.xl + space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  languageText: { ...type.body, fontSize: 14 },
  rowValue: { ...type.caption, maxWidth: 140, textAlign: "right" },
});
