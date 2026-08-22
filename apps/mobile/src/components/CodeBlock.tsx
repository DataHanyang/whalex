import { memo, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { colors, radius, space, type } from "../theme";
import { t } from "../i18n";

/**
 * Minimal token painter. A full grammar per language is far more weight than
 * a phone transcript needs — colouring strings, comments, numbers and
 * keywords is what makes code scannable, and the rest reads fine in plain
 * foreground.
 */
const KEYWORDS =
  /\b(async|await|break|case|catch|class|const|continue|def|default|del|elif|else|except|export|extends|finally|for|from|function|if|import|in|interface|is|lambda|let|new|not|or|and|pass|print|raise|return|self|static|struct|switch|this|throw|try|type|typeof|var|void|while|with|yield|true|false|null|nil|None|True|False|undefined|fn|impl|pub|use|mut|match|enum|package|func|go|defer|end|do|then|fi|esac|echo|exit)\b/;

type Tok = { text: string; color?: string };

function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  let rest = line;
  // Whole-line comments dominate: bail early so nothing inside gets recoloured.
  const comment = /^(\s*)(\/\/|#|--).*$/.exec(rest);
  if (comment) return [{ text: rest, color: colors.synComment }];

  const pattern =
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\/\/.*$|#.*$)|(\b\d+(?:\.\d+)?\b)/;
  while (rest.length > 0) {
    const m = pattern.exec(rest);
    if (!m || m.index === undefined) {
      out.push(...plain(rest));
      break;
    }
    if (m.index > 0) out.push(...plain(rest.slice(0, m.index)));
    const [full, str, cmt, num] = m;
    out.push({
      text: full,
      color: str
        ? colors.synString
        : cmt
          ? colors.synComment
          : num
            ? colors.synNumber
            : undefined,
    });
    rest = rest.slice(m.index + full.length);
  }
  return out;
}

/** Splits a plain run so keywords pick up the accent. */
function plain(text: string): Tok[] {
  const out: Tok[] = [];
  let rest = text;
  for (;;) {
    const m = KEYWORDS.exec(rest);
    if (!m || m.index === undefined) {
      if (rest) out.push({ text: rest });
      return out;
    }
    if (m.index > 0) out.push({ text: rest.slice(0, m.index) });
    out.push({ text: m[0], color: colors.synKeyword });
    rest = rest.slice(m.index + m[0].length);
  }
}

function paint(line: string): React.ReactNode {
  return tokenize(line).map((t, j) => (
    <Text key={j} style={t.color ? { color: t.color } : undefined}>
      {t.text}
    </Text>
  ));
}

export const CodeBlock = memo(function CodeBlock({
  code,
  language,
  /** Output panes are dense and unhighlighted; source gets colour. */
  plainText = false,
  /**
   * Wrap instead of scrolling sideways. Used where the reader has to see the
   * whole string to make a decision — a command they are about to approve
   * must not be able to hide its tail off-screen.
   */
  wrap = false,
}: {
  code: string;
  language?: string;
  plainText?: boolean;
  wrap?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => code.replace(/\n+$/, "").split("\n"), [code]);
  const truncated = lines.length > 400;
  const shown = truncated ? lines.slice(0, 400) : lines;

  const copy = async (): Promise<void> => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Text style={styles.lang}>{(language || "text").toUpperCase()}</Text>
        <Pressable onPress={() => void copy()} hitSlop={10}>
          <Text style={[styles.copy, copied && { color: colors.ok }]}>
            {copied ? t("code.copied") : t("code.copy")}
          </Text>
        </Pressable>
      </View>
      {wrap ? (
        <View style={styles.pad}>
          {shown.map((line, i) => (
            <Text key={i} style={styles.line}>
              {plainText ? line || " " : paint(line)}
            </Text>
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pad}
        >
          <View>
            {shown.map((line, i) => (
              <Text key={i} style={styles.line}>
                {plainText ? line || " " : paint(line)}
                {line === "" ? " " : ""}
              </Text>
            ))}
          </View>
        </ScrollView>
      )}
      {truncated && (
        <Text style={styles.more}>{t("code.moreLines", { n: lines.length - 400 })}</Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginVertical: space.sm,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lang: { ...type.label, fontSize: 10.5, letterSpacing: 0.8, color: colors.faint },
  copy: { ...type.label, fontSize: 11, color: colors.muted },
  pad: { padding: space.md },
  line: { ...type.mono },
  more: {
    ...type.caption,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
});
