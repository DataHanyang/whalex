import { memo, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radius, space, type } from "../theme";
import { plural, t } from "../i18n";

/**
 * A unified diff sized for a phone. Approving a file write is the moment this
 * app exists for, so the change has to be readable here — not summarised as
 * "3 lines changed" and deferred to the desktop.
 */

interface Row {
  kind: "add" | "del" | "ctx" | "skip";
  text: string;
}

/**
 * Line-level diff via a longest-common-subsequence walk. Character-level
 * precision buys little at this width and costs a lot of computation on a
 * file-sized input, so changed lines are shown whole.
 */
function diffLines(oldText: string, newText: string): Row[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  // Guard: LCS is O(n·m); very large files fall back to a plain replacement.
  if (a.length * b.length > 4_000_000) {
    return [
      ...a.map((text): Row => ({ kind: "del", text })),
      ...b.map((text): Row => ({ kind: "add", text })),
    ];
  }

  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const rows: Row[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ kind: "ctx", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      rows.push({ kind: "del", text: a[i]! });
      i++;
    } else {
      rows.push({ kind: "add", text: b[j]! });
      j++;
    }
  }
  while (i < a.length) rows.push({ kind: "del", text: a[i++]! });
  while (j < b.length) rows.push({ kind: "add", text: b[j++]! });
  return rows;
}

/** Collapses long unchanged stretches so the edits stay on screen. */
function trimContext(rows: Row[], pad = 3): Row[] {
  const keep = new Set<number>();
  rows.forEach((r, i) => {
    if (r.kind === "add" || r.kind === "del") {
      for (let k = i - pad; k <= i + pad; k++) if (k >= 0 && k < rows.length) keep.add(k);
    }
  });
  const out: Row[] = [];
  let skipping = 0;
  rows.forEach((r, i) => {
    if (keep.has(i)) {
      if (skipping > 0) {
        out.push({ kind: "skip", text: plural("diff.unchanged_one", "diff.unchanged_other", skipping) });
        skipping = 0;
      }
      out.push(r);
    } else {
      skipping++;
    }
  });
  if (skipping > 0) {
    out.push({ kind: "skip", text: plural("diff.unchanged_one", "diff.unchanged_other", skipping) });
  }
  return out;
}

export const DiffView = memo(function DiffView({
  path,
  oldText,
  newText,
  maxRows = 200,
}: {
  path: string;
  oldText: string;
  newText: string;
  maxRows?: number;
}) {
  const { rows, added, removed } = useMemo(() => {
    const all = diffLines(oldText, newText);
    return {
      rows: trimContext(all),
      added: all.filter((r) => r.kind === "add").length,
      removed: all.filter((r) => r.kind === "del").length,
    };
  }, [oldText, newText]);

  const shown = rows.slice(0, maxRows);
  const name = path.split(/[\\/]/).pop() ?? path;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.path} numberOfLines={1} ellipsizeMode="head">
          {name}
        </Text>
        <View style={styles.counts}>
          {added > 0 && <Text style={styles.add}>+{added}</Text>}
          {removed > 0 && <Text style={styles.del}>−{removed}</Text>}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.body}>
          {shown.map((r, i) =>
            r.kind === "skip" ? (
              <Text key={i} style={styles.skip}>
                ⋯ {r.text}
              </Text>
            ) : (
              <Text
                key={i}
                style={[
                  styles.row,
                  r.kind === "add" && styles.rowAdd,
                  r.kind === "del" && styles.rowDel,
                ]}
              >
                <Text style={styles.sign}>
                  {r.kind === "add" ? "+" : r.kind === "del" ? "−" : " "}
                </Text>
                {r.text || " "}
              </Text>
            ),
          )}
        </View>
      </ScrollView>
      {rows.length > maxRows && (
        <Text style={styles.truncated}>{t("diff.moreLines", { n: rows.length - maxRows })}</Text>
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
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  path: { ...type.monoSmall, color: colors.text, flexShrink: 1 },
  counts: { flexDirection: "row", gap: space.sm },
  add: { ...type.monoSmall, color: colors.addFg },
  del: { ...type.monoSmall, color: colors.delFg },
  body: { paddingVertical: space.sm, minWidth: "100%" },
  row: { ...type.mono, paddingHorizontal: space.md, color: colors.muted },
  rowAdd: { backgroundColor: colors.addBg, color: colors.addFg },
  rowDel: { backgroundColor: colors.delBg, color: colors.delFg },
  sign: { color: colors.faint },
  skip: {
    ...type.monoSmall,
    color: colors.faint,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  truncated: {
    ...type.caption,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
});
