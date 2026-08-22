import { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { colors, radius, space, type } from "../theme";
import { t } from "../i18n";
import { InlineImage } from "./InlineImage";
import { Markdown } from "./Markdown";
import { ToolGroup } from "./ToolGroup";
import type { Row } from "./transcriptRows";

/**
 * An agent transcript is a work log, not a conversation: most of its height is
 * tool activity, diffs and code. So assistant output runs full-bleed like a
 * document — every pixel of width matters when you are reading a diff on a
 * phone — and only the user's own messages, which are short commands, get a
 * contained bubble.
 */

export const TranscriptRow = memo(function TranscriptRow({ item }: { item: Row }) {
  switch (item.kind) {
    case "tool-group":
      return <ToolGroup items={item.items} />;

    case "user":
      return (
        <View style={styles.userWrap}>
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{item.text}</Text>
          </View>
          {item.delivery === "pending" && <Text style={styles.queued}>{t("chat.queued")}</Text>}
        </View>
      );

    case "assistant":
      return (
        <View style={styles.assistant}>
          {!!item.reasoning && !item.text && <Reasoning text={item.reasoning} />}
          {!!item.text && <Markdown text={item.text} />}
          {item.streaming && !item.text && <Caret />}
          {item.interrupted && (
            <View style={styles.interrupted}>
              <Feather name="slash" size={11} color={colors.faint} />
              <Text style={styles.interruptedText}>{t("transcript.interrupted")}</Text>
            </View>
          )}
        </View>
      );

    case "todos": {
      const done = item.todos.filter((t) => t.status === "completed").length;
      return (
        <>
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Feather name="check-square" size={13} color={colors.faint} />
              <Text style={styles.cardTitle}>{t("chat.plan")}</Text>
              <Text style={styles.cardMeta}>
                {done}/{item.todos.length}
              </Text>
            </View>
            {item.todos.map((t, i) => (
              <View key={i} style={styles.todo}>
                <Feather
                  name={
                    t.status === "completed"
                      ? "check"
                      : t.status === "in_progress"
                        ? "loader"
                        : "circle"
                  }
                  size={12}
                  color={
                    t.status === "completed"
                      ? colors.ok
                      : t.status === "in_progress"
                        ? colors.accent
                        : colors.faint
                  }
                />
                <Text
                  style={[styles.todoText, t.status === "completed" && styles.todoDone]}
                  numberOfLines={2}
                >
                  {t.content}
                </Text>
              </View>
            ))}
          </View>
        </>
      );
    }

    case "error":
      return (
        <>
          <View style={[styles.card, styles.errorCard]}>
            <View style={styles.cardHead}>
              <Feather name="alert-triangle" size={13} color={colors.danger} />
              <Text style={[styles.cardTitle, { color: colors.danger }]}>{item.code}</Text>
            </View>
            <Text style={styles.errorText}>{item.message}</Text>
          </View>
        </>
      );

    case "artifact":
      // Images render right here, small, tap for full screen. Everything
      // else (html, plans, spreadsheets) still lives on the desktop.
      if (item.artifactKind === "image") {
        return (
          <View style={styles.imageWrap}>
            <InlineImage artifactId={item.artifactId} title={item.title} />
          </View>
        );
      }
      return (
        <>
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Feather name="layout" size={13} color={colors.accent} />
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>{item.artifactKind}</Text>
            </View>
            <Text style={styles.hint}>{t("chat.openOnDesktop")}</Text>
          </View>
        </>
      );

    case "subagent":
      return (
        <>
          <View style={styles.thin}>
            <Feather name="users" size={12} color={colors.faint} />
            <Text style={styles.thinText} numberOfLines={1}>
              {item.label || item.agentType}
            </Text>
            <Text style={styles.cardMeta}>{item.state}</Text>
          </View>
        </>
      );

    case "workflow":
      return (
        <>
          <View style={styles.thin}>
            <Feather name="git-branch" size={12} color={colors.faint} />
            <Text style={styles.thinText} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
        </>
      );

    case "compaction":
      return (
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>
            {t("transcript.compacted", { before: item.beforePct, after: item.afterPct })}
          </Text>
          <View style={styles.dividerLine} />
        </View>
      );

    default:
      return null;
  }
});

/** Shown while the model is thinking but hasn't emitted prose yet. */
function Reasoning({ text }: { text: string }) {
  return (
    <View style={styles.reasoning}>
      <Text style={styles.reasoningText} numberOfLines={3}>
        {text}
      </Text>
    </View>
  );
}

function Caret() {
  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.15, duration: 620, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 620, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);
  return <Animated.View style={[styles.caret, { opacity: blink }]} />;
}

const styles = StyleSheet.create({
  userWrap: { alignItems: "flex-end", marginVertical: space.md },
  userBubble: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    maxWidth: "88%",
  },
  userText: { ...type.body, color: colors.text },
  queued: { ...type.caption, marginTop: space.xs, color: colors.faint },

  assistant: { marginVertical: space.sm },
  interrupted: { flexDirection: "row", alignItems: "center", gap: space.xs },
  interruptedText: { ...type.caption },
  caret: { width: 8, height: 17, backgroundColor: colors.accent, borderRadius: 1 },
  reasoning: {
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: space.md,
    marginBottom: space.sm,
  },
  reasoningText: { ...type.caption, color: colors.faint, fontStyle: "italic" },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: space.md,
    gap: space.sm,
    marginVertical: 2,
  },
  errorCard: { borderColor: colors.dangerSoft, backgroundColor: colors.dangerSoft },
  imageWrap: { marginVertical: space.xs },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  cardTitle: { ...type.label, color: colors.muted, flex: 1 },
  cardMeta: { ...type.monoSmall, color: colors.faint },
  errorText: { ...type.body, fontSize: 13.5, lineHeight: 20, color: colors.text },
  hint: { ...type.caption },

  todo: { flexDirection: "row", alignItems: "center", gap: space.sm },
  todoText: { ...type.body, fontSize: 13.5, lineHeight: 19, flex: 1, color: colors.muted },
  todoDone: { color: colors.faint, textDecorationLine: "line-through" },

  thin: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  thinText: { ...type.monoSmall, color: colors.muted, flex: 1 },

  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginVertical: space.lg,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { ...type.caption, fontSize: 11 },
});
