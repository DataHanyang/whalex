import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import type { SessionMeta } from "@whalex/shared";
import { colors, radius, space, type } from "../theme";
import { useConnectionStore } from "../stores/connectionStore";
import { useMobileSession } from "../stores/sessionStore";

/** "3m", "2h", "Tue" — absolute dates only once relative stops being useful. */
function ago(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SessionsScreen({ onOpen }: { onOpen: () => void }) {
  const insets = useSafeAreaInsets();
  const hello = useConnectionStore((s) => s.hello);
  const phase = useConnectionStore((s) => s.phase);
  const sessions = useMobileSession((s) => s.sessions);
  const refresh = useMobileSession((s) => s.refreshSessions);
  const open = useMobileSession((s) => s.open);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      await refresh();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [refresh]);

  useEffect(() => {
    if (phase === "connected") void load();
  }, [phase, load]);

  // Grouped by project folder: which repo a session belongs to is the thing
  // you actually scan for, and a flat list buries it in the subtitle.
  const sections = useMemo(() => {
    const byFolder = new Map<string, SessionMeta[]>();
    for (const s of [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)) {
      const key = s.cwd.split(/[\\/]/).filter(Boolean).pop() ?? s.cwd;
      const list = byFolder.get(key);
      if (list) list.push(s);
      else byFolder.set(key, [s]);
    }
    return [...byFolder.entries()].map(([title, data]) => ({ title, data }));
  }, [sessions]);

  const openSession = async (meta: SessionMeta): Promise<void> => {
    setBusyId(meta.sessionId);
    try {
      await open(meta.cwd, meta.sessionId);
      onOpen();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <Text style={styles.title}>{hello?.name ?? "Sessions"}</Text>
        <View style={styles.conn}>
          <View
            style={[
              styles.dot,
              { backgroundColor: phase === "connected" ? colors.kelp : colors.beacon },
            ]}
          />
          <Text style={styles.connText}>
            {phase === "connected" ? "Connected" : "Reconnecting…"}
          </Text>
        </View>
      </View>

      {error && (
        <View style={styles.error}>
          <Feather name="alert-triangle" size={13} color={colors.coral} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(m) => m.sessionId}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.mist}
            colors={[colors.sonar]}
            progressBackgroundColor={colors.hull}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.section}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => void openSession(item)}
            disabled={busyId !== null}
          >
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.title || "Untitled session"}
              </Text>
              <Text style={styles.rowMeta}>
                {ago(item.updatedAt)} · {item.messageCount}{" "}
                {item.messageCount === 1 ? "message" : "messages"}
              </Text>
            </View>
            {busyId === item.sessionId ? (
              <ActivityIndicator size="small" color={colors.sonar} />
            ) : item.running ? (
              <View style={styles.runningPill}>
                <View style={[styles.dot, { backgroundColor: colors.kelp }]} />
                <Text style={styles.runningText}>Running</Text>
              </View>
            ) : (
              <Feather name="chevron-right" size={16} color={colors.deep} />
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          phase === "connected" ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No sessions yet</Text>
              <Text style={styles.emptyBody}>
                Start one on the desktop and it will show up here.
              </Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.sonar} />
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  head: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, gap: space.xs },
  title: { ...type.display, fontSize: 24, lineHeight: 30 },
  conn: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dot: { width: 6, height: 6, borderRadius: radius.pill },
  connText: { ...type.caption },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.xl,
    marginBottom: space.md,
    padding: space.md,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.sm,
  },
  errorText: { ...type.caption, color: colors.foam, flex: 1 },
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl },
  section: {
    ...type.label,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: colors.deep,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.hull,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md + 2,
    marginBottom: space.sm,
  },
  rowPressed: { backgroundColor: colors.hull2, borderColor: colors.lineStrong },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { ...type.ui },
  rowMeta: { ...type.caption, fontSize: 11.5 },
  runningPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 1,
    backgroundColor: colors.kelpSoft,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  runningText: { ...type.label, fontSize: 10.5, color: colors.kelp },
  empty: { alignItems: "center", paddingTop: space.xxxl, gap: space.sm },
  emptyTitle: { ...type.heading, color: colors.mist },
  emptyBody: { ...type.caption, textAlign: "center" },
});
