import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import type { SessionMeta } from "@whalex/shared";
import { colors, radius, space, type } from "../theme";
import { useConnectionStore } from "../stores/connectionStore";
import { useMobileSession, type Project } from "../stores/sessionStore";

/** "now", "12m", "3h", "Aug 4" — relative until relative stops helping. */
function ago(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The desktop's sidebar, on a phone: the projects it has open, the sessions
 * inside each, and a way to start a new one without walking to the machine.
 */
export function SessionsScreen({ onOpen }: { onOpen: () => void }) {
  const insets = useSafeAreaInsets();
  const hello = useConnectionStore((s) => s.hello);
  const phase = useConnectionStore((s) => s.phase);
  const projects = useMobileSession((s) => s.projects);
  const refresh = useMobileSession((s) => s.refreshSessions);
  const open = useMobileSession((s) => s.open);
  const startNew = useMobileSession((s) => s.startNew);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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

  const run = async (key: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(key);
    try {
      await fn();
      onOpen();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.title}>{hello?.name ?? "Your computer"}</Text>
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
      </View>

      {error && (
        <View style={styles.error}>
          <Feather name="alert-triangle" size={13} color={colors.coral} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <ScrollView
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
      >
        {projects.length === 0 && phase === "connected" && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No projects yet</Text>
            <Text style={styles.emptyBody}>
              Open a folder on the desktop and it will appear here.
            </Text>
          </View>
        )}
        {projects.length === 0 && phase !== "connected" && (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.sonar} />
          </View>
        )}

        {projects.map((p) => (
          <ProjectBlock
            key={p.cwd}
            project={p}
            collapsed={collapsed[p.cwd] ?? false}
            busy={busy}
            onToggle={() => setCollapsed((c) => ({ ...c, [p.cwd]: !(c[p.cwd] ?? false) }))}
            onNew={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              void run(`new:${p.cwd}`, () => startNew(p.cwd));
            }}
            onOpenSession={(s) => void run(s.sessionId, () => open(s.cwd, s.sessionId))}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function ProjectBlock({
  project,
  collapsed,
  busy,
  onToggle,
  onNew,
  onOpenSession,
}: {
  project: Project;
  collapsed: boolean;
  busy: string | null;
  onToggle: () => void;
  onNew: () => void;
  onOpenSession: (s: SessionMeta) => void;
}) {
  const live = project.sessions.some((s) => s.running);
  return (
    <View style={styles.project}>
      <View style={styles.projectHead}>
        <Pressable style={styles.projectName} onPress={onToggle} hitSlop={6}>
          <Feather
            name={collapsed ? "chevron-right" : "chevron-down"}
            size={14}
            color={colors.deep}
          />
          <Text style={styles.projectTitle} numberOfLines={1}>
            {project.name}
          </Text>
          {live && <View style={[styles.dot, { backgroundColor: colors.kelp }]} />}
        </Pressable>
        <Pressable style={styles.newBtn} onPress={onNew} hitSlop={8}>
          {busy === `new:${project.cwd}` ? (
            <ActivityIndicator size="small" color={colors.sonar} />
          ) : (
            <Feather name="plus" size={15} color={colors.mist} />
          )}
        </Pressable>
      </View>

      {!collapsed &&
        (project.sessions.length === 0 ? (
          <Pressable style={styles.blank} onPress={onNew}>
            <Text style={styles.blankText}>No sessions — start one</Text>
          </Pressable>
        ) : (
          project.sessions.map((s) => (
            <Pressable
              key={s.sessionId}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => onOpenSession(s)}
              disabled={busy !== null}
            >
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {s.title || "Untitled session"}
                </Text>
                <Text style={styles.rowMeta}>
                  {ago(s.updatedAt)} · {s.messageCount}{" "}
                  {s.messageCount === 1 ? "message" : "messages"}
                </Text>
              </View>
              {busy === s.sessionId ? (
                <ActivityIndicator size="small" color={colors.sonar} />
              ) : s.running ? (
                <View style={styles.pill}>
                  <View style={[styles.dot, { backgroundColor: colors.kelp }]} />
                  <Text style={styles.pillText}>Running</Text>
                </View>
              ) : null}
            </Pressable>
          ))
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  head: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
  headText: { flex: 1, gap: space.xs },
  title: { ...type.display, fontSize: 23, lineHeight: 29 },
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
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxxl },

  project: { marginBottom: space.lg },
  projectHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: space.xs,
    paddingRight: space.xs,
    marginBottom: space.sm,
  },
  projectName: { flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1 },
  projectTitle: {
    ...type.label,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: colors.mist,
    flexShrink: 1,
  },
  newBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.hull,
    borderWidth: 1,
    borderColor: colors.line,
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
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 1,
    backgroundColor: colors.kelpSoft,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  pillText: { ...type.label, fontSize: 10.5, color: colors.kelp },
  blank: {
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: "dashed",
    borderRadius: radius.md,
    paddingVertical: space.lg,
    alignItems: "center",
    marginBottom: space.sm,
  },
  blankText: { ...type.caption },
  empty: { alignItems: "center", paddingTop: space.xxxl, gap: space.sm },
  emptyTitle: { ...type.heading, color: colors.mist },
  emptyBody: { ...type.caption, textAlign: "center" },
});
