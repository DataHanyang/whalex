import { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { SessionMeta } from "@whalex/shared";
import { colors } from "../theme";
import { useConnectionStore } from "../stores/connectionStore";
import { useMobileSession } from "../stores/sessionStore";

export function SessionsScreen({ onOpen }: { onOpen: () => void }) {
  const hello = useConnectionStore((s) => s.hello);
  const sessions = useMobileSession((s) => s.sessions);
  const refresh = useMobileSession((s) => s.refreshSessions);
  const open = useMobileSession((s) => s.open);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh().catch((e: unknown) => setError(String(e)));
  }, [refresh]);

  const openSession = async (meta: SessionMeta): Promise<void> => {
    try {
      await open(meta.cwd, meta.sessionId);
      onOpen();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.header}>{hello?.name ?? "Sessions"}</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={sessions}
        keyExtractor={(m) => m.sessionId}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.muted}
            onRefresh={() => {
              setRefreshing(true);
              void refresh().finally(() => setRefreshing(false));
            }}
          />
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => void openSession(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title || item.cwd.split(/[\\/]/).pop()}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {item.cwd} · {item.messageCount} msgs
              </Text>
            </View>
            {item.running && <View style={styles.runningDot} />}
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No sessions yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: 56 },
  header: { color: colors.text, fontSize: 18, fontWeight: "600", paddingHorizontal: 16, marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 15 },
  sub: { color: colors.faint, fontSize: 12, marginTop: 2 },
  runningDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ok, marginLeft: 8 },
  empty: { color: colors.faint, textAlign: "center", marginTop: 48 },
  error: { color: colors.danger, paddingHorizontal: 16, marginBottom: 8 },
});
