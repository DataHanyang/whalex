import { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { TranscriptItem } from "@whalex/shared";
import { colors, radius, space, type } from "../theme";
import { Markdown } from "./Markdown";
import { ToolCard } from "./ToolCard";

/**
 * An agent transcript is a work log, not a conversation: most of its height is
 * tool activity, diffs and code. So assistant output runs full-bleed like a
 * document — every pixel of width matters when you are reading a diff on a
 * phone — and only the user's own messages, which are short commands, get a
 * contained bubble. Machine activity hangs off a rail so it reads as one
 * continuous run rather than a series of replies.
 */

export const TranscriptRow = memo(function TranscriptRow({ item }: { item: TranscriptItem }) {
  switch (item.kind) {
    case "user":
      return (
        <View style={styles.userWrap}>
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{item.text}</Text>
          </View>
          {item.delivery === "pending" && <Text style={styles.queued}>Queued</Text>}
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
              <Feather name="slash" size={11} color={colors.deep} />
              <Text style={styles.interruptedText}>Stopped</Text>
            </View>
          )}
        </View>
      );

    case "tool":
      return (
        <Rail>
          <ToolCard item={item} />
        </Rail>
      );

    case "todos": {
      const done = item.todos.filter((t) => t.status === "completed").length;
      return (
        <Rail>
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Feather name="check-square" size={13} color={colors.deep} />
              <Text style={styles.cardTitle}>Plan</Text>
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
                      ? colors.kelp
                      : t.status === "in_progress"
                        ? colors.sonar
                        : colors.deep
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
        </Rail>
      );
    }

    case "error":
      return (
        <Rail>
          <View style={[styles.card, styles.errorCard]}>
            <View style={styles.cardHead}>
              <Feather name="alert-triangle" size={13} color={colors.coral} />
              <Text style={[styles.cardTitle, { color: colors.coral }]}>{item.code}</Text>
            </View>
            <Text style={styles.errorText}>{item.message}</Text>
          </View>
        </Rail>
      );

    case "artifact":
      return (
        <Rail>
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Feather name="layout" size={13} color={colors.sonar} />
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>{item.artifactKind}</Text>
            </View>
            <Text style={styles.hint}>Open on desktop to view</Text>
          </View>
        </Rail>
      );

    case "subagent":
      return (
        <Rail>
          <View style={styles.thin}>
            <Feather name="users" size={12} color={colors.deep} />
            <Text style={styles.thinText} numberOfLines={1}>
              {item.label || item.agentType}
            </Text>
            <Text style={styles.cardMeta}>{item.state}</Text>
          </View>
        </Rail>
      );

    case "workflow":
      return (
        <Rail>
          <View style={styles.thin}>
            <Feather name="git-branch" size={12} color={colors.deep} />
            <Text style={styles.thinText} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
        </Rail>
      );

    case "compaction":
      return (
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>
            context compacted {item.beforePct}% → {item.afterPct}%
          </Text>
          <View style={styles.dividerLine} />
        </View>
      );

    default:
      return null;
  }
});

/** The vertical thread machine activity hangs from. */
function Rail({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.rail}>
      <View style={styles.railLine} />
      <View style={styles.railBody}>{children}</View>
    </View>
  );
}

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
    backgroundColor: colors.sonarSoft,
    borderRadius: radius.md,
    borderTopRightRadius: radius.xs,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    maxWidth: "86%",
  },
  userText: { ...type.body, color: colors.foam },
  queued: { ...type.caption, marginTop: space.xs, color: colors.deep },

  assistant: { marginVertical: space.sm },
  interrupted: { flexDirection: "row", alignItems: "center", gap: space.xs },
  interruptedText: { ...type.caption },
  caret: { width: 8, height: 17, backgroundColor: colors.sonar, borderRadius: 1 },
  reasoning: {
    borderLeftWidth: 2,
    borderLeftColor: colors.line,
    paddingLeft: space.md,
    marginBottom: space.sm,
  },
  reasoningText: { ...type.caption, color: colors.deep, fontStyle: "italic" },

  rail: { flexDirection: "row", gap: space.md },
  railLine: { width: 1.5, backgroundColor: colors.line, borderRadius: 1, marginLeft: 3 },
  railBody: { flex: 1, paddingVertical: 1 },

  card: {
    backgroundColor: colors.hull,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    padding: space.md,
    gap: space.sm,
    marginVertical: 2,
  },
  errorCard: { borderColor: colors.coralSoft, backgroundColor: colors.coralSoft },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  cardTitle: { ...type.label, color: colors.mist, flex: 1 },
  cardMeta: { ...type.monoSmall, color: colors.deep },
  errorText: { ...type.body, fontSize: 13.5, lineHeight: 20, color: colors.foam },
  hint: { ...type.caption },

  todo: { flexDirection: "row", alignItems: "center", gap: space.sm },
  todoText: { ...type.body, fontSize: 13.5, lineHeight: 19, flex: 1, color: colors.mist },
  todoDone: { color: colors.deep, textDecorationLine: "line-through" },

  thin: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  thinText: { ...type.monoSmall, color: colors.mist, flex: 1 },

  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginVertical: space.lg,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.line },
  dividerText: { ...type.caption, fontSize: 11 },
});
