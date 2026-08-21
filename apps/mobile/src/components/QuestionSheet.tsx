import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { colors, radius, space, type } from "../theme";
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
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (value: string): Promise<void> => {
    if (!question || busy || !value.trim()) return;
    setBusy(true);
    void Haptics.selectionAsync();
    try {
      await answer(question.id, value.trim());
      setOther("");
    } finally {
      setBusy(false);
    }
  };

  const q = question?.questions[0];

  return (
    <Sheet visible={Boolean(question)} accent={colors.sonar}>
      {question && (
        <>
          <View style={styles.head}>
            <View style={styles.badge}>
              <Feather name="help-circle" size={14} color={colors.sonar} />
            </View>
            <View style={styles.headText}>
              <Text style={styles.label}>Your call</Text>
              <Text style={styles.question}>{q?.question ?? "The agent needs a decision"}</Text>
            </View>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.options}>
            {q?.options.map((o) => (
              <Pressable
                key={o.label}
                style={styles.option}
                onPress={() => void send(o.label)}
                disabled={busy}
              >
                <Text style={styles.optionLabel}>{o.label}</Text>
                {!!o.description && <Text style={styles.optionDesc}>{o.description}</Text>}
              </Pressable>
            ))}
          </ScrollView>

          {question.allowOther && (
            <View style={styles.otherRow}>
              <TextInput
                style={styles.input}
                placeholder="Something else…"
                placeholderTextColor={colors.deep}
                value={other}
                onChangeText={setOther}
                onSubmitEditing={() => void send(other)}
                returnKeyType="send"
              />
              <Pressable
                style={[styles.send, !other.trim() && styles.sendOff]}
                onPress={() => void send(other)}
                disabled={busy || !other.trim()}
              >
                <Feather name="arrow-up" size={17} color={colors.abyss} />
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
    backgroundColor: colors.sonarSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  headText: { flex: 1, gap: 3 },
  label: { ...type.label, color: colors.sonar, textTransform: "uppercase", letterSpacing: 0.7 },
  question: { ...type.heading, lineHeight: 22 },
  scroll: { maxHeight: 380 },
  options: { paddingHorizontal: space.xl, gap: space.sm },
  option: {
    backgroundColor: colors.hull2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: space.lg,
    gap: 3,
  },
  optionLabel: { ...type.ui },
  optionDesc: { ...type.caption, color: colors.mist },
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
    backgroundColor: colors.hull2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.sonar,
    alignItems: "center",
    justifyContent: "center",
  },
  sendOff: { backgroundColor: colors.line },
});
