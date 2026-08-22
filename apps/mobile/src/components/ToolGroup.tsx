import { memo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { TranscriptItem } from "@whalex/shared";
import { colors, space, type } from "../theme";
import { ToolCard } from "./ToolCard";

type ToolItem = Extract<TranscriptItem, { kind: "tool" }>;

/**
 * A run of consecutive tool calls, folded into one line.
 *
 * An agent turn can fire a dozen reads and greps before it says anything, and
 * rendering each as its own card turns the transcript into scaffolding you
 * scroll past. Collapsed, the work is a single sentence you can skim — and
 * still open when a result actually matters.
 */

const CATEGORY: Record<string, "command" | "read" | "edit" | "search" | "fetch"> = {
  bash: "command",
  shell: "command",
  powershell: "command",
  read_file: "read",
  write_file: "edit",
  edit_file: "edit",
  apply_patch: "edit",
  glob: "search",
  grep: "search",
  search: "search",
  web_fetch: "fetch",
};

const PHRASE: Record<string, [one: string, many: string]> = {
  command: ["ran 1 command", "ran %n commands"],
  read: ["read 1 file", "read %n files"],
  edit: ["edited 1 file", "edited %n files"],
  search: ["ran 1 search", "ran %n searches"],
  fetch: ["fetched 1 page", "fetched %n pages"],
  other: ["1 tool call", "%n tool calls"],
};

/** "Ran 3 commands, read 1 file" — what happened, not which API was called. */
export function summarize(items: ToolItem[]): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = CATEGORY[item.toolName] ?? "other";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([key, n]) => {
    const [one, many] = PHRASE[key] ?? PHRASE.other!;
    return n === 1 ? one : many.replace("%n", String(n));
  });
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const ToolGroup = memo(function ToolGroup({ items }: { items: ToolItem[] }) {
  const [open, setOpen] = useState(false);
  const running = items.some((i) => i.state === "running");
  const failed = items.some((i) => i.state === "error");

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.summary} onPress={() => setOpen((o) => !o)} hitSlop={6}>
        <Text
          style={[
            styles.text,
            running && { color: colors.accent },
            failed && { color: colors.danger },
          ]}
          numberOfLines={1}
        >
          {summarize(items)}
          {running ? "…" : ""}
        </Text>
        <Feather
          name={open ? "chevron-down" : "chevron-right"}
          size={14}
          color={failed ? colors.danger : running ? colors.accent : colors.faint}
        />
      </Pressable>
      {open && (
        <View style={styles.body}>
          {items.map((item) => (
            <ToolCard key={item.id} item={item} />
          ))}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginVertical: space.sm },
  summary: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 2 },
  text: { ...type.ui, color: colors.muted, flexShrink: 1 },
  body: { marginTop: space.sm, gap: space.xs },
});
