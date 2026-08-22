import { memo, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { colors, radius, space, type } from "../theme";
import { t } from "../i18n";
import { ImageCards, InlineImage } from "./InlineImage";
import { useMobileSession } from "../stores/sessionStore";
import { useConnectionStore } from "../stores/connectionStore";
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

/** Pictures that rode out with a sent message, as cards above the bubble. */
function SentImages({ messageId }: { messageId: string }) {
  const uris = useMobileSession((s) => s.sentImages[messageId]);
  if (!uris || uris.length === 0) return null;
  return <ImageCards uris={uris} align="right" />;
}

/**
 * A sent message. While it waits in the steer queue it wears the same
 * Unread badge the desktop shows, and a long-press offers edit or cancel —
 * the queue is not a black hole.
 */
function UserRow({ item }: { item: Extract<Row, { kind: "user" }> }) {
  const cancelPending = useMobileSession((s) => s.cancelPending);
  const setDraftSeed = useMobileSession((s) => s.setDraftSeed);

  const pending = item.delivery === "pending";
  const onLongPress = (): void => {
    if (!pending) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(item.text.slice(0, 80), undefined, [
      {
        text: t("transcript.editMessage"),
        onPress: () => {
          // The old text moves into the composer; sending it back goes
          // through editPending so the queued copy is what changes.
          setDraftSeed(item.text);
          void cancelPending(item.id);
        },
      },
      {
        text: t("transcript.deleteMessage"),
        style: "destructive",
        onPress: () => void cancelPending(item.id),
      },
      { text: t("plan.cancel"), style: "cancel" },
    ]);
  };

  return (
    <View style={styles.userWrap}>
      <SentImages messageId={item.id} />
      {item.text.length > 0 && (
        <Pressable onLongPress={onLongPress} delayLongPress={350}>
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{item.text}</Text>
          </View>
        </Pressable>
      )}
      {item.delivery && (
        <View style={styles.deliveryRow}>
          <Feather
            name={pending ? "clock" : "check"}
            size={10}
            color={pending ? colors.attention : colors.ok}
          />
          <Text style={[styles.queued, !pending && { color: colors.ok }]}>
            {t(pending ? "transcript.delivery.pending" : "transcript.delivery.read")}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Known error codes get their translated label; unknown ones show as-is. */
const ERROR_CODES = new Set([
  "rate_limit",
  "invalid_key",
  "insufficient_balance",
  "usage_limit",
  "network",
  "context_overflow",
  "aborted",
  "unknown",
]);
function ErrorTitle({ code }: { code: string }) {
  return <>{ERROR_CODES.has(code) ? t(`error.${code}` as Parameters<typeof t>[0]) : code}</>;
}

export const TranscriptRow = memo(function TranscriptRow({ item }: { item: Row }) {
  switch (item.kind) {
    case "tool-group":
      return <ToolGroup items={item.items} />;

    case "user":
      return <UserRow item={item} />;

    case "assistant":
      return (
        <View style={styles.assistant}>
          {!!item.reasoning && <Reasoning text={item.reasoning} expandable={!!item.text} />}
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

    case "todos":
      // Live plan progress rides with the composer; replaying every saved
      // snapshot here buried long sessions under near-identical cards.
      return null;

    case "error":
      // Goal-loop progress folds in as an "error" item; it is news, not an
      // alarm, so it renders as the desktop's calm accent divider.
      if (item.code.startsWith("goal-")) {
        return (
          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: colors.accentSoft }]} />
            <Text style={[styles.dividerText, { color: colors.accent }]}>{item.message}</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.accentSoft }]} />
          </View>
        );
      }
      return (
        <>
          <View style={[styles.card, styles.errorCard]}>
            <View style={styles.cardHead}>
              <Feather name="alert-triangle" size={13} color={colors.danger} />
              <Text style={[styles.cardTitle, { color: colors.danger }]}>
                <ErrorTitle code={item.code} />
              </Text>
            </View>
            <Text style={styles.errorText}>{item.message}</Text>
          </View>
        </>
      );

    case "artifact":
      // Images render inline; plans, markdown and code open in a viewer.
      // Only rich kinds (html, spreadsheets, slides) stay desktop-side.
      if (item.artifactKind === "image") {
        return (
          <View style={styles.imageWrap}>
            <InlineImage artifactId={item.artifactId} title={item.title} />
          </View>
        );
      }
      return <ArtifactCard item={item} />;

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
      return <WorkflowCard workflowId={item.workflowId} name={item.name} />;

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

/** Which artifact kinds the phone can render as text. */
const READABLE = new Set(["plan", "markdown", "code", "mermaid", "svg"]);

/**
 * An artifact in the flow. Plans, markdown and code open right here in a
 * full-height sheet - a phone stuck on "open on desktop" could approve a
 * plan it had never read. Rich kinds (html, spreadsheets) stay desktop-side.
 */
function ArtifactCard({ item }: { item: Extract<Row, { kind: "artifact" }> }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const readable = READABLE.has(item.artifactKind);

  useEffect(() => {
    if (!open || content !== null) return;
    const client = useConnectionStore.getState().client;
    if (!client) return;
    let live = true;
    client
      .invoke("artifact:read", { artifactId: item.artifactId })
      .then((a) => live && setContent(a?.content ?? ""))
      .catch(() => live && setContent(""));
    return () => {
      live = false;
    };
  }, [open, content, item.artifactId]);

  const language = item.artifactKind === "code" ? "" : item.artifactKind;
  const body =
    content === null
      ? null
      : item.artifactKind === "plan" || item.artifactKind === "markdown"
        ? content
        : "```" + language + "\n" + content + "\n```";

  return (
    <>
      <Pressable
        style={styles.card}
        onPress={readable ? () => setOpen(true) : undefined}
        disabled={!readable}
      >
        <View style={styles.cardHead}>
          <Feather name="layout" size={13} color={colors.accent} />
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardMeta}>{item.artifactKind}</Text>
        </View>
        <Text style={styles.hint}>
          {readable ? t("transcript.openPreview") : t("chat.openOnDesktop")}
        </Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.viewer}>
          <View style={styles.viewerBar}>
            <Text style={styles.viewerTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}>
              <Feather name="x" size={20} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.viewerBody}>
            {body === null ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: space.xxl }} />
            ) : (
              <Markdown text={body} />
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

/**
 * A SuperCode run, with the desktop panel's essentials: state, per-agent
 * progress, tokens and cost, and the tail of the log - folded behind a tap.
 */
function WorkflowCard({ workflowId, name }: { workflowId: string; name: string }) {
  const wf = useMobileSession((s) => s.workflows[workflowId]);
  const [open, setOpen] = useState(false);
  if (!wf) {
    return (
      <View style={styles.thin}>
        <Feather name="git-branch" size={12} color={colors.faint} />
        <Text style={styles.thinText} numberOfLines={1}>
          {name}
        </Text>
      </View>
    );
  }
  const done = wf.agents.filter((a) => a.state === "done").length;
  const stateColor =
    wf.state === "error" || wf.state === "aborted"
      ? colors.danger
      : wf.state === "done"
        ? colors.ok
        : colors.accent;
  return (
    <Pressable style={styles.card} onPress={() => setOpen((v) => !v)}>
      <View style={styles.cardHead}>
        <Feather name="git-branch" size={13} color={stateColor} />
        <Text style={styles.cardTitle} numberOfLines={1}>
          {wf.name}
        </Text>
        <Text style={[styles.cardMeta, { color: stateColor }]}>{wf.state}</Text>
      </View>
      <Text style={styles.hint}>
        {done}/{wf.agents.length} agents - {Math.round(wf.totalTokens / 1000)}k tok - $
        {wf.costUsd.toFixed(3)}
      </Text>
      {open && (
        <View style={styles.wfBody}>
          {wf.agents.map((a) => (
            <View key={a.id} style={styles.wfAgent}>
              <Feather
                name={
                  a.state === "done" ? "check-circle" : a.state === "error" ? "x-circle" : "loader"
                }
                size={11}
                color={
                  a.state === "done"
                    ? colors.ok
                    : a.state === "error"
                      ? colors.danger
                      : colors.accent
                }
              />
              <Text style={styles.wfAgentText} numberOfLines={1}>
                {a.label}
              </Text>
            </View>
          ))}
          {wf.log.slice(-3).map((line, i) => (
            <Text key={i} style={styles.wfLog} numberOfLines={1}>
              {line}
            </Text>
          ))}
        </View>
      )}
    </Pressable>
  );
}

/**
 * Thinking text. While it is the only output it previews inline; once prose
 * arrives it folds into a disclosure, still readable — the desktop keeps
 * reasoning reachable forever and so does this.
 */
function Reasoning({ text, expandable }: { text: string; expandable: boolean }) {
  const [open, setOpen] = useState(false);
  if (!expandable) {
    return (
      <View style={styles.reasoning}>
        <Text style={styles.reasoningText} numberOfLines={3}>
          {text}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.reasoning}>
      <Pressable style={styles.reasoningHead} onPress={() => setOpen((v) => !v)} hitSlop={6}>
        <Feather name={open ? "chevron-down" : "chevron-right"} size={12} color={colors.faint} />
        <Text style={styles.reasoningLabel}>{t("transcript.reasoning")}</Text>
      </Pressable>
      {open && <Text style={styles.reasoningText}>{text}</Text>}
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
  queued: { ...type.caption, color: colors.faint },
  deliveryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: space.xs,
    alignSelf: "flex-end",
  },
  reasoningHead: { flexDirection: "row", alignItems: "center", gap: 4 },
  reasoningLabel: { ...type.caption, color: colors.faint },

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
  viewer: { flex: 1, backgroundColor: colors.bg, paddingTop: 54 },
  viewerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  viewerTitle: { ...type.heading, flex: 1 },
  viewerBody: { padding: space.lg, paddingBottom: 60 },
  wfBody: { gap: 4, marginTop: space.xs },
  wfAgent: { flexDirection: "row", alignItems: "center", gap: space.sm },
  wfAgentText: { ...type.caption, color: colors.text, flexShrink: 1 },
  wfLog: { ...type.monoSmall, fontSize: 10.5, color: colors.faint },
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
