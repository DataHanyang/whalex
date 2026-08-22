import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import type { ReasoningEffort } from "@whalex/shared";
import { colors, radius, space, type } from "../theme";
import { t } from "../i18n";
import { useMobileSession } from "../stores/sessionStore";
import { Sheet } from "./Sheet";

/**
 * The composer's dedicated pickers. Each control opens the sheet for exactly
 * what it names — the model chip picks models, the mode chip picks modes, and
 * "+" holds the per-turn work options — instead of all three landing on the
 * everything menu.
 */

type Mode = "default" | "acceptEdits" | "bypassPermissions" | "plan" | "unrestricted";

const MODES: Array<{
  id: Mode;
  label: Parameters<typeof t>[0];
  hint: Parameters<typeof t>[0];
  danger?: boolean;
}> = [
  { id: "default", label: "mode.default", hint: "mode.hint.default" },
  { id: "acceptEdits", label: "mode.acceptEdits", hint: "mode.hint.acceptEdits" },
  { id: "bypassPermissions", label: "mode.bypassPermissions", hint: "mode.hint.bypassPermissions" },
  { id: "plan", label: "mode.plan", hint: "mode.hint.plan" },
  // The everything-goes mode: same option the desktop offers, same warning
  // colour, because approving destructive commands from a phone screen
  // deserves at least a red label.
  { id: "unrestricted", label: "mode.unrestricted", hint: "mode.hint.unrestricted", danger: true },
];

const EFFORTS: Array<{
  id: ReasoningEffort;
  label: Parameters<typeof t>[0];
  hint: Parameters<typeof t>[0];
}> = [
  { id: "none", label: "effort.none", hint: "effort.hint.none" },
  { id: "minimal", label: "effort.minimal", hint: "effort.hint.minimal" },
  { id: "low", label: "effort.low", hint: "effort.hint.low" },
  { id: "medium", label: "effort.medium", hint: "effort.hint.medium" },
  { id: "high", label: "effort.high", hint: "effort.hint.high" },
  { id: "xhigh", label: "effort.xhigh", hint: "effort.hint.xhigh" },
  { id: "max", label: "effort.max", hint: "effort.hint.max" },
];

export function ModeSheet({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const mode = useMobileSession((s) => s.permissionMode);
  const setMode = useMobileSession((s) => s.setPermissionMode);
  return (
    <Sheet visible={visible} onDismiss={onDismiss}>
      <Text style={styles.title}>{t("menu.howItWorks")}</Text>
      <View style={styles.group}>
        {MODES.map((m) => (
          <OptionRow
            key={m.id}
            label={t(m.label)}
            hint={t(m.hint)}
            on={mode === m.id}
            danger={m.danger}
            onPress={() => {
              void Haptics.selectionAsync();
              void setMode(m.id);
              onDismiss();
            }}
          />
        ))}
      </View>
    </Sheet>
  );
}

export function ModelSheet({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const model = useMobileSession((s) => s.model);
  const models = useMobileSession((s) => s.models);
  const refreshModels = useMobileSession((s) => s.refreshModels);
  const setModel = useMobileSession((s) => s.setModel);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    void refreshModels()
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [visible, refreshModels]);

  // The active model always shows, even before (or without) a fetched list.
  const ids = models.map((m) => m.id);
  if (!ids.includes(model)) ids.unshift(model);

  return (
    <Sheet visible={visible} onDismiss={onDismiss}>
      <Text style={styles.title}>{t("composer.model")}</Text>
      {loading && ids.length <= 1 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView style={styles.scroll}>
          <View style={styles.group}>
            {ids.map((id) => (
              <OptionRow
                key={id}
                label={id}
                on={model === id}
                onPress={() => {
                  void Haptics.selectionAsync();
                  void setModel(id);
                  onDismiss();
                }}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </Sheet>
  );
}

export function WorkSheet({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const superCode = useMobileSession((s) => s.superCode);
  const goalMode = useMobileSession((s) => s.goalMode);
  const effort = useMobileSession((s) => s.effort);
  const setSuperCode = useMobileSession((s) => s.setSuperCode);
  const setGoalMode = useMobileSession((s) => s.setGoalMode);
  const setEffort = useMobileSession((s) => s.setEffort);
  const addAttachment = useMobileSession((s) => s.addAttachment);
  const uploadFile = useMobileSession((s) => s.uploadFile);
  const [showEffort, setShowEffort] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const pickImage = async (camera: boolean): Promise<void> => {
    setAttachError(null);
    // Downscaled JPEG straight from the picker: the vision sidecar reads a
    // description out of it, so phone-camera resolution is wasted bytes.
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: "images",
      quality: 0.6,
      base64: true,
    };
    const res = camera
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    const asset = res.assets?.[0];
    if (res.canceled || !asset?.base64) return;
    addAttachment({
      id: `att-${Date.now()}`,
      kind: "image",
      name: asset.fileName ?? "photo.jpg",
      dataBase64: asset.base64,
      uri: asset.uri,
    });
    onDismiss();
  };

  const pickDocument = async (): Promise<void> => {
    setAttachError(null);
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    const asset = res.assets?.[0];
    if (res.canceled || !asset) return;
    if ((asset.size ?? 0) > 25 * 1024 * 1024) {
      setAttachError(t("attach.tooLarge"));
      return;
    }
    setUploading(true);
    try {
      // The bytes move now, not at send: the chip only appears once the
      // desktop actually holds the file the mention will point at.
      const dataBase64 = await new File(asset.uri).base64();
      const path = await uploadFile(asset.name, dataBase64);
      addAttachment({ id: `att-${Date.now()}`, kind: "file", name: asset.name, path });
      onDismiss();
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  // SuperCode owns the tuning while it is on, same as the desktop composer.
  const effortShown = superCode ? "max" : effort;
  const effortLabel = EFFORTS.find((e) => e.id === effortShown)?.label;

  return (
    <Sheet visible={visible} onDismiss={onDismiss}>
      <Text style={styles.title}>{t("composer.options")}</Text>
      <ScrollView style={styles.scroll}>
        <View style={styles.group}>
          <Pressable style={styles.toggleRow} onPress={() => void pickImage(true)}>
            <Feather name="camera" size={16} color={colors.muted} />
            <Text style={[styles.rowLabel, styles.attachLabel]}>{t("attach.camera")}</Text>
          </Pressable>
          <Pressable style={styles.toggleRow} onPress={() => void pickImage(false)}>
            <Feather name="image" size={16} color={colors.muted} />
            <Text style={[styles.rowLabel, styles.attachLabel]}>{t("attach.gallery")}</Text>
          </Pressable>
          <Pressable style={styles.toggleRow} onPress={() => void pickDocument()} disabled={uploading}>
            <Feather name="paperclip" size={16} color={colors.muted} />
            <Text style={[styles.rowLabel, styles.attachLabel]}>{t("attach.document")}</Text>
            {uploading && <ActivityIndicator size="small" color={colors.accent} />}
          </Pressable>
          {attachError && <Text style={styles.attachError}>{attachError}</Text>}
        </View>
        <View style={[styles.group, styles.groupGap]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.rowLabel}>SuperCode</Text>
              <Text style={styles.rowHint}>{t("composer.superCodeTip")}</Text>
            </View>
            <Switch
              value={superCode}
              onValueChange={(v) => {
                void Haptics.selectionAsync();
                void setSuperCode(v);
              }}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.rowLabel}>{t("composer.goal")}</Text>
              <Text style={styles.rowHint}>{t("composer.goalTip")}</Text>
            </View>
            <Switch
              value={goalMode}
              onValueChange={(v) => {
                void Haptics.selectionAsync();
                void setGoalMode(v);
              }}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
          </View>
          <Pressable
            style={[styles.toggleRow, superCode && styles.rowLocked]}
            onPress={() => !superCode && setShowEffort((v) => !v)}
            disabled={superCode}
          >
            <View style={styles.toggleText}>
              <Text style={styles.rowLabel}>{t("composer.effortTip")}</Text>
              <Text style={styles.rowHint}>
                {effortLabel ? t(effortLabel) : effortShown}
              </Text>
            </View>
            <Feather
              name={showEffort ? "chevron-up" : "chevron-down"}
              size={15}
              color={superCode ? colors.faint : colors.muted}
            />
          </Pressable>
          {showEffort &&
            !superCode &&
            EFFORTS.map((e) => (
              <OptionRow
                key={e.id}
                label={t(e.label)}
                hint={t(e.hint)}
                on={effort === e.id}
                inset
                onPress={() => {
                  void Haptics.selectionAsync();
                  void setEffort(e.id);
                  setShowEffort(false);
                }}
              />
            ))}
        </View>
      </ScrollView>
    </Sheet>
  );
}

function OptionRow({
  label,
  hint,
  on,
  inset,
  danger,
  onPress,
}: {
  label: string;
  hint?: string;
  on: boolean;
  inset?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const tone = danger ? colors.danger : colors.accent;
  return (
    <Pressable
      style={[styles.option, inset && styles.optionInset, on && styles.optionOn]}
      onPress={onPress}
    >
      <View style={styles.toggleText}>
        <Text style={[styles.rowLabel, danger && { color: colors.danger }, on && { color: tone }]}>
          {label}
        </Text>
        {!!hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      {on && <Feather name="check" size={15} color={tone} />}
    </Pressable>
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
  scroll: { maxHeight: 440 },
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  group: {
    marginHorizontal: space.lg,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionInset: { paddingLeft: space.xl + space.md, backgroundColor: colors.bg },
  optionOn: { backgroundColor: colors.accentSoft },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLocked: { opacity: 0.55 },
  toggleText: { flex: 1, gap: 2 },
  rowLabel: { ...type.ui },
  rowHint: { ...type.caption, fontSize: 11.5 },
  attachLabel: { flex: 1 },
  attachError: {
    ...type.caption,
    color: colors.danger,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  groupGap: { marginTop: space.md },
});
