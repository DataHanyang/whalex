import { memo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { TranscriptItem } from "@whalex/shared";
import { colors, radius, space, type } from "../theme";
import { t } from "../i18n";
import { CodeBlock } from "./CodeBlock";
import { DiffView } from "./DiffView";

type ToolItem = Extract<TranscriptItem, { kind: "tool" }>;

/** Icon and human phrasing per tool, so a row reads as an action, not an API call. */
function describe(toolName: string, args: Record<string, unknown> | undefined): {
  icon: keyof typeof Feather.glyphMap;
  verb: string;
  target: string;
} {
  const a = args ?? {};
  const str = (k: string): string => (typeof a[k] === "string" ? (a[k] as string) : "");
  const file = (p: string): string => p.split(/[\\/]/).pop() ?? p;

  switch (toolName) {
    case "read_file":
      return { icon: "file-text", verb: t("tool.verb.read"), target: file(str("path")) };
    case "write_file":
      return { icon: "file-plus", verb: t("tool.verb.wrote"), target: file(str("path")) };
    case "edit_file":
    case "apply_patch":
      return { icon: "edit-3", verb: t("tool.verb.edited"), target: file(str("path")) };
    case "bash":
    case "shell":
    case "powershell":
      return { icon: "terminal", verb: t("tool.verb.ran"), target: str("command") };
    case "glob":
      return { icon: "folder", verb: t("tool.verb.listed"), target: str("pattern") };
    case "grep":
    case "search":
      return { icon: "search", verb: t("tool.verb.searched"), target: str("pattern") || str("query") };
    case "web_fetch":
      return { icon: "globe", verb: t("tool.verb.fetched"), target: str("url") };
    case "agent":
      return { icon: "users", verb: t("tool.verb.delegated"), target: str("description") || str("label") };
    case "todo_write":
      return { icon: "check-square", verb: t("tool.verb.plan"), target: "" };
    default:
      // Unknown tools keep their own name — inventing a verb would mislead.
      return { icon: "box", verb: toolName.replace(/_/g, " "), target: str("path") || str("query") };
  }
}

export const ToolCard = memo(function ToolCard({ item }: { item: ToolItem }) {
  const [open, setOpen] = useState(false);
  const { icon, verb, target } = describe(item.toolName, item.args as Record<string, unknown>);
  const running = item.state === "running";
  const failed = item.state === "error";
  const tint = failed ? colors.danger : running ? colors.accent : colors.faint;
  const hasBody = Boolean(item.output) || Boolean(item.diff);

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.row}
        onPress={() => hasBody && setOpen((o) => !o)}
        disabled={!hasBody}
      >
        <Feather name={icon} size={13} color={tint} style={styles.icon} />
        <Text style={styles.verb}>{verb}</Text>
        {!!target && (
          <Text style={styles.target} numberOfLines={1} ellipsizeMode="middle">
            {target}
          </Text>
        )}
        <View style={styles.tail}>
          {running ? (
            <Text style={[styles.state, { color: colors.accent }]}>{t("tool.running")}</Text>
          ) : failed ? (
            <Text style={[styles.state, { color: colors.danger }]}>{t("tool.failed")}</Text>
          ) : item.durationMs > 900 ? (
            <Text style={styles.state}>{(item.durationMs / 1000).toFixed(1)}s</Text>
          ) : null}
          {hasBody && (
            <Feather name={open ? "chevron-up" : "chevron-down"} size={13} color={colors.faint} />
          )}
        </View>
      </Pressable>

      {open && (
        <View style={styles.body}>
          {item.diff && (
            <DiffView
              path={item.diff.path}
              oldText={item.diff.oldText}
              newText={item.diff.newText}
            />
          )}
          {!!item.output && <CodeBlock code={item.output} language="output" plainText />}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginVertical: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: { width: 14 },
  verb: { ...type.label, color: colors.muted, textTransform: "capitalize" },
  target: { ...type.monoSmall, color: colors.text, flex: 1 },
  tail: { flexDirection: "row", alignItems: "center", gap: space.sm, marginLeft: "auto" },
  state: { ...type.monoSmall, color: colors.faint },
  body: { paddingLeft: space.sm },
});
