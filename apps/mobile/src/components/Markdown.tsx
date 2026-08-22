import { memo, useMemo } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { marked, type Token, type Tokens } from "marked";
import { colors, radius, space, type } from "../theme";
import { CodeBlock } from "./CodeBlock";

/**
 * Markdown rendered straight to React Native views.
 *
 * The desktop renders through HTML; a phone has no such luxury, and the
 * off-the-shelf RN markdown packages style by tag name rather than by design
 * token. Walking `marked`'s token tree ourselves keeps every heading, list
 * marker and inline code chip on the same scale as the rest of the app.
 */

function inline(tokens: Token[] | undefined, key: string): React.ReactNode {
  if (!tokens) return null;
  return tokens.map((t, i) => {
    const k = `${key}-${i}`;
    switch (t.type) {
      case "strong":
        return (
          <Text key={k} style={styles.strong}>
            {inline((t as Tokens.Strong).tokens, k)}
          </Text>
        );
      case "em":
        return (
          <Text key={k} style={styles.em}>
            {inline((t as Tokens.Em).tokens, k)}
          </Text>
        );
      case "codespan":
        return (
          <Text key={k} style={styles.codespan}>
            {" "}
            {(t as Tokens.Codespan).text}{" "}
          </Text>
        );
      case "link": {
        const link = t as Tokens.Link;
        return (
          <Text key={k} style={styles.link} onPress={() => void Linking.openURL(link.href)}>
            {inline(link.tokens, k)}
          </Text>
        );
      }
      case "del":
        return (
          <Text key={k} style={styles.del}>
            {inline((t as Tokens.Del).tokens, k)}
          </Text>
        );
      case "br":
        return <Text key={k}>{"\n"}</Text>;
      default:
        return <Text key={k}>{(t as { raw?: string; text?: string }).text ?? t.raw ?? ""}</Text>;
    }
  });
}

function block(token: Token, key: string): React.ReactNode {
  switch (token.type) {
    case "heading": {
      const h = token as Tokens.Heading;
      const style = h.depth <= 2 ? styles.h2 : styles.h3;
      return (
        <Text key={key} style={style}>
          {inline(h.tokens, key)}
        </Text>
      );
    }
    case "paragraph":
      return (
        <Text key={key} style={styles.p}>
          {inline((token as Tokens.Paragraph).tokens, key)}
        </Text>
      );
    case "code": {
      const c = token as Tokens.Code;
      return <CodeBlock key={key} code={c.text} language={c.lang} />;
    }
    case "list": {
      const list = token as Tokens.List;
      return (
        <View key={key} style={styles.list}>
          {list.items.map((item, i) => (
            <View key={`${key}-${i}`} style={styles.li}>
              <Text style={styles.marker}>
                {list.ordered ? `${Number(list.start || 1) + i}.` : "•"}
              </Text>
              <View style={styles.liBody}>
                {item.tokens.map((t, j) => block(t, `${key}-${i}-${j}`))}
              </View>
            </View>
          ))}
        </View>
      );
    }
    case "text": {
      const t = token as Tokens.Text;
      return (
        <Text key={key} style={styles.p}>
          {t.tokens ? inline(t.tokens, key) : t.text}
        </Text>
      );
    }
    case "blockquote":
      return (
        <View key={key} style={styles.quote}>
          {(token as Tokens.Blockquote).tokens.map((t, i) => block(t, `${key}-${i}`))}
        </View>
      );
    case "hr":
      return <View key={key} style={styles.hr} />;
    case "table": {
      const table = token as Tokens.Table;
      // Phones have no room for real columns; rows read as labelled stacks.
      return (
        <View key={key} style={styles.table}>
          {table.rows.map((row, i) => (
            <View key={`${key}-r${i}`} style={styles.tableRow}>
              {row.map((cell, j) => (
                <View key={`${key}-c${j}`} style={styles.tableCell}>
                  <Text style={styles.tableHead}>{table.header[j]?.text ?? ""}</Text>
                  <Text style={styles.p}>{inline(cell.tokens, `${key}-${i}-${j}`)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      );
    }
    case "space":
      return null;
    default: {
      const raw = (token as { raw?: string }).raw;
      return raw ? (
        <Text key={key} style={styles.p}>
          {raw}
        </Text>
      ) : null;
    }
  }
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const tokens = useMemo(() => {
    try {
      return marked.lexer(text);
    } catch {
      return null;
    }
  }, [text]);
  // A half-streamed document can trip the lexer; plain text still reads.
  if (!tokens) return <Text style={styles.p}>{text}</Text>;
  return <View>{tokens.map((t, i) => block(t, `b${i}`))}</View>;
});

const styles = StyleSheet.create({
  p: { ...type.body, marginBottom: space.sm },
  h2: { ...type.title, marginTop: space.md, marginBottom: space.sm },
  h3: { ...type.heading, marginTop: space.md, marginBottom: space.xs },
  strong: { fontFamily: "PlexSansSemi" },
  em: { fontStyle: "italic" },
  del: { textDecorationLine: "line-through", color: colors.muted },
  link: { color: colors.accent },
  codespan: {
    ...type.mono,
    backgroundColor: colors.surface2,
    color: colors.text,
    borderRadius: radius.sm,
  },
  list: { marginBottom: space.sm },
  li: { flexDirection: "row", gap: space.sm, marginBottom: space.xs },
  marker: { ...type.body, color: colors.faint, minWidth: 16 },
  liBody: { flex: 1 },
  quote: {
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: space.md,
    marginBottom: space.sm,
  },
  hr: { height: 1, backgroundColor: colors.border, marginVertical: space.md },
  table: { marginBottom: space.sm, gap: space.sm },
  tableRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: space.md,
    gap: space.sm,
  },
  tableCell: { gap: 2 },
  tableHead: { ...type.label, fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase" },
});
