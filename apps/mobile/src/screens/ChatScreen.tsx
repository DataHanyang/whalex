import { useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { TranscriptItem } from "@whalex/shared";
import { colors } from "../theme";
import { useMobileSession } from "../stores/sessionStore";

export function ChatScreen({ onBack }: { onBack: () => void }) {
  const transcript = useMobileSession((s) => s.transcript);
  const status = useMobileSession((s) => s.status);
  const send = useMobileSession((s) => s.send);
  const abort = useMobileSession((s) => s.abort);
  const closeSession = useMobileSession((s) => s.closeSession);
  const [draft, setDraft] = useState("");

  const reversed = useMemo(() => [...transcript].reverse(), [transcript]);
  const running = status !== "idle";

  const submit = (): void => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void send(text);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.topBar}>
        <Pressable
          onPress={() => {
            closeSession();
            onBack();
          }}
        >
          <Text style={styles.back}>‹ Sessions</Text>
        </Pressable>
        <Text style={styles.status}>{running ? status : ""}</Text>
      </View>

      <FlatList
        inverted
        data={reversed}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <TranscriptRow item={item} />}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
      />

      <PermissionSheet />
      <QuestionSheet />

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder={running ? "Steer the running turn…" : "Message WhaleX…"}
          placeholderTextColor={colors.faint}
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        {running ? (
          <Pressable style={[styles.sendBtn, styles.stopBtn]} onPress={() => void abort()}>
            <Text style={styles.sendText}>■</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.sendBtn} onPress={submit}>
          <Text style={styles.sendText}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function TranscriptRow({ item }: { item: TranscriptItem }) {
  const [expanded, setExpanded] = useState(false);
  switch (item.kind) {
    case "user":
      return (
        <View style={[styles.bubble, styles.userBubble]}>
          <Text style={styles.userText}>{item.text}</Text>
          {item.delivery === "pending" && <Text style={styles.pending}>queued</Text>}
        </View>
      );
    case "assistant":
      return (
        <View style={[styles.bubble, styles.assistantBubble]}>
          {item.reasoning ? (
            <Text style={styles.reasoning} numberOfLines={expanded ? undefined : 2}>
              {item.reasoning}
            </Text>
          ) : null}
          <Text style={styles.assistantText} onPress={() => setExpanded((e) => !e)}>
            {item.text || (item.streaming ? "…" : "")}
          </Text>
          {item.interrupted && <Text style={styles.pending}>interrupted</Text>}
        </View>
      );
    case "tool":
      return (
        <Pressable style={styles.toolCard} onPress={() => setExpanded((e) => !e)}>
          <Text style={styles.toolLine} numberOfLines={1}>
            {item.state === "running" ? "⏳" : item.state === "ok" ? "✓" : "✗"} {item.toolName}
          </Text>
          {expanded && !!item.output && (
            <Text style={styles.toolOutput} numberOfLines={30}>
              {item.output.slice(0, 4000)}
            </Text>
          )}
        </Pressable>
      );
    case "error":
      return (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{item.message}</Text>
        </View>
      );
    case "todos":
      return (
        <View style={styles.toolCard}>
          {item.todos.map((t, i) => (
            <Text key={i} style={styles.toolLine}>
              {t.status === "completed" ? "☑" : t.status === "in_progress" ? "◐" : "☐"} {t.content}
            </Text>
          ))}
        </View>
      );
    default:
      return (
        <View style={styles.toolCard}>
          <Text style={styles.toolLine}>[{item.kind}]</Text>
        </View>
      );
  }
}

/** The reason this app exists: approve the desktop agent from your pocket. */
function PermissionSheet() {
  const pending = useMobileSession((s) => s.pendingPermissions);
  const respond = useMobileSession((s) => s.respondPermission);
  const req = pending[0];
  if (!req) return null;
  return (
    <View style={styles.sheet}>
      <Text style={styles.sheetTitle}>Permission request</Text>
      <Text style={styles.sheetBody}>{req.summary}</Text>
      {req.diff && (
        <Text style={styles.toolOutput} numberOfLines={8}>
          {req.diff.path}
        </Text>
      )}
      <View style={styles.sheetRow}>
        <Pressable style={[styles.sheetBtn, styles.denyBtn]} onPress={() => void respond(req.id, false)}>
          <Text style={styles.sendText}>Deny</Text>
        </Pressable>
        <Pressable style={styles.sheetBtn} onPress={() => void respond(req.id, true)}>
          <Text style={styles.sendText}>Allow</Text>
        </Pressable>
      </View>
      {pending.length > 1 && <Text style={styles.pending}>+{pending.length - 1} more waiting</Text>}
    </View>
  );
}

function QuestionSheet() {
  const question = useMobileSession((s) => s.pendingQuestion);
  const answer = useMobileSession((s) => s.answerQuestion);
  const [other, setOther] = useState("");
  if (!question) return null;
  const q = question.questions[0];
  return (
    <View style={styles.sheet}>
      <Text style={styles.sheetTitle}>{q?.question ?? "Question"}</Text>
      {q?.options.map((o) => (
        <Pressable
          key={o.label}
          style={styles.optionBtn}
          onPress={() => void answer(question.id, o.label)}
        >
          <Text style={styles.assistantText}>{o.label}</Text>
          {!!o.description && <Text style={styles.sub}>{o.description}</Text>}
        </Pressable>
      ))}
      {question.allowOther && (
        <View style={styles.sheetRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Other…"
            placeholderTextColor={colors.faint}
            value={other}
            onChangeText={setOther}
          />
          <Pressable
            style={styles.sheetBtn}
            onPress={() => other.trim() && void answer(question.id, other.trim())}
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: { color: colors.accent, fontSize: 15 },
  status: { color: colors.muted, fontSize: 13 },
  bubble: { borderRadius: 14, padding: 10, marginVertical: 4, maxWidth: "88%" },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.accentSoft },
  assistantBubble: { alignSelf: "flex-start", backgroundColor: colors.surface },
  userText: { color: colors.text, fontSize: 15 },
  assistantText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  reasoning: { color: colors.faint, fontSize: 12, fontStyle: "italic", marginBottom: 4 },
  pending: { color: colors.faint, fontSize: 11, marginTop: 4 },
  toolCard: {
    backgroundColor: colors.surface2,
    borderRadius: 10,
    padding: 8,
    marginVertical: 3,
    alignSelf: "stretch",
  },
  toolLine: { color: colors.muted, fontSize: 13 },
  toolOutput: {
    color: colors.faint,
    fontSize: 11.5,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginTop: 6,
  },
  errorCard: {
    backgroundColor: "#3a1d1d",
    borderRadius: 10,
    padding: 10,
    marginVertical: 4,
  },
  errorText: { color: colors.danger, fontSize: 13 },
  sub: { color: colors.faint, fontSize: 12 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendBtn: {
    backgroundColor: colors.accent,
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  stopBtn: { backgroundColor: colors.danger },
  sendText: { color: "#fff", fontWeight: "700" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  sheetTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  sheetBody: { color: colors.muted, fontSize: 14 },
  sheetRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  sheetBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  denyBtn: { backgroundColor: colors.surface2 },
  optionBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
  },
});
