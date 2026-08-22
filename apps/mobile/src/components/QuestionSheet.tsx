import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { colors, radius, space, type } from "../theme";
import { t } from "../i18n";
import { useMobileSession } from "../stores/sessionStore";
import { Sheet } from "./Sheet";

/**
 * The agent asking you to choose. Unlike a permission request this is a
 * decision about direction rather than consequence, so it reads calmer:
 * the accent is the app's own, and options are the primary surface.
 */
export function QuestionSheet() {
  const question = useMobileSession((s) => s.pendingQuestion);
  const answer = useMobileSession((s) => s.answerQuestion);
  // The interview walks question by question, like the desktop card: answers
  // accumulate, multi-select gathers picks, and only the last step submits.
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);

  // A new question set never inherits a previous one's progress.
  if (question && question.id !== lastId) {
    setLastId(question.id);
    setStep(0);
    setAnswers([]);
    setPicked([]);
    setOther("");
  }

  const total = question?.questions.length ?? 0;
  const q = question?.questions[Math.min(step, Math.max(0, total - 1))];

  const submitStep = async (value: string): Promise<void> => {
    if (!question || busy || !value.trim()) return;
    const next = [...answers, value.trim()];
    if (step + 1 >= total) {
      setBusy(true);
      void Haptics.selectionAsync();
      try {
        // The full interview goes back as one transcript, question → answer.
        const combined = question.questions
          .map((item, i) => `${item.question} → ${next[i] ?? ""}`)
          .join("\n");
        await answer(question.id, combined);
      } finally {
        setBusy(false);
      }
    } else {
      void Haptics.selectionAsync();
      setAnswers(next);
      setStep(step + 1);
      setPicked([]);
      setOther("");
    }
  };

  /** Multi-select picks and the free-text field are one combined answer. */
  const submitCombined = (): void => {
    const parts = [...(q?.multiSelect ? picked : []), other.trim()].filter(Boolean);
    if (parts.length) void submitStep(parts.join(", "));
  };

  const togglePick = (label: string): void => {
    void Haptics.selectionAsync();
    setPicked((p) => (p.includes(label) ? p.filter((x) => x !== label) : [...p, label]));
  };

  return (
    <Sheet visible={Boolean(question)} accent={colors.accent}>
      {question && q && (
        <>
          <View style={styles.head}>
            <View style={styles.badge}>
              <Feather name="help-circle" size={14} color={colors.accent} />
            </View>
            <View style={styles.headText}>
              <Text style={styles.label}>
                {t("question.label")}
                {total > 1 ? `  ·  ${step + 1}/${total}` : ""}
              </Text>
              <Text style={styles.question}>{q.question}</Text>
            </View>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.options}>
            {q.options.map((o) => {
              const on = q.multiSelect && picked.includes(o.label);
              return (
                <Pressable
                  key={o.label}
                  style={[styles.option, on && styles.optionOn]}
                  onPress={() => (q.multiSelect ? togglePick(o.label) : void submitStep(o.label))}
                  disabled={busy}
                >
                  <View style={styles.optionRow}>
                    <Text style={[styles.optionLabel, on && { color: colors.accent }]}>
                      {o.label}
                    </Text>
                    {on && <Feather name="check" size={14} color={colors.accent} />}
                  </View>
                  {!!o.description && <Text style={styles.optionDesc}>{o.description}</Text>}
                </Pressable>
              );
            })}
          </ScrollView>

          {(question.allowOther || q.multiSelect) && (
            <View style={styles.otherRow}>
              <TextInput
                style={styles.input}
                placeholder={t("question.other")}
                placeholderTextColor={colors.faint}
                value={other}
                onChangeText={setOther}
                onSubmitEditing={submitCombined}
                returnKeyType="send"
              />
              <Pressable
                style={[
                  styles.send,
                  !(other.trim() || (q.multiSelect && picked.length > 0)) && styles.sendOff,
                ]}
                onPress={submitCombined}
                disabled={busy || !(other.trim() || (q.multiSelect && picked.length > 0))}
              >
                <Feather name="arrow-up" size={17} color={colors.bg} />
              </Pressable>
            </View>
          )}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  headText: { flex: 1, gap: 3 },
  label: { ...type.label, color: colors.accent, textTransform: "uppercase", letterSpacing: 0.7 },
  question: { ...type.heading, lineHeight: 22 },
  scroll: { maxHeight: 380 },
  options: { paddingHorizontal: space.xl, gap: space.sm },
  option: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.lg,
    gap: 3,
  },
  optionOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  optionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  optionLabel: { ...type.ui },
  optionDesc: { ...type.caption, color: colors.muted },
  otherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
  },
  input: {
    ...type.body,
    flex: 1,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendOff: { backgroundColor: colors.border },
});
