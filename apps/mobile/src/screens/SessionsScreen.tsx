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
import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import type { SessionMeta } from "@whalex/shared";
import { colors, radius, space, type } from "../theme";
import { plural, t } from "../i18n";
import { listComputers, type PairedComputer } from "../lib/computers";
import { useConnectionStore } from "../stores/connectionStore";
import { useMobileSession, type Project } from "../stores/sessionStore";

/** "now", "12m", "3h", "Aug 4" — relative until relative stops helping. */
function ago(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return t("time.now");
  if (s < 3600) return t("time.minutes", { n: Math.floor(s / 60) });
  if (s < 86400) return t("time.hours", { n: Math.floor(s / 3600) });
  if (s < 604800) return t("time.days", { n: Math.floor(s / 86400) });
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The desktop's sidebar, on a phone: the projects it has open, the sessions
 * inside each, and a way to start a new one without walking to the machine.
 */
export function SessionsScreen({ onOpen }: { onOpen: () => void }) {
  const hello = useConnectionStore((s) => s.hello);
  const phase = useConnectionStore((s) => s.phase);
  const projects = useMobileSession((s) => s.projects);
  const refresh = useMobileSession((s) => s.refreshSessions);
  const open = useMobileSession((s) => s.open);
  const startNew = useMobileSession((s) => s.startNew);
  const requestRepair = useConnectionStore((s) => s.requestRepair);
  const connect = useConnectionStore((s) => s.connect);
  const activeComputer = useConnectionStore((s) => s.computer);
  const closeSession = useMobileSession((s) => s.closeSession);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Every desktop this phone has ever paired with — one phone, many machines.
  const [computers, setComputers] = useState<PairedComputer[]>([]);

  useEffect(() => {
    void listComputers().then((list) =>
      setComputers(list.sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))),
    );
  }, [phase]);

  const switchComputer = (c: PairedComputer): void => {
    if (c.computerId === activeComputer?.computerId) return;
    void Haptics.selectionAsync();
    closeSession();
    useMobileSession.setState({ sessions: [], projects: [] });
    void connect(c);
  };

  const load = useCallback(async () => {
    try {
      await refresh();
      setError(null);
    } catch (e) {
      // "not connected" is the socket's own wording and means nothing to a
      // reader; the connection banner already says that in their language.
      const msg = e instanceof Error ? e.message : String(e);
      setError(/not connected/i.test(msg) ? null : msg);
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
    <View style={styles.root}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.title}>{hello?.name ?? activeComputer?.name ?? "WhaleX"}</Text>
          <View style={styles.conn}>
            <View
              style={[
                styles.dot,
                { backgroundColor: phase === "connected" ? colors.ok : colors.attention },
              ]}
            />
            <Text style={styles.connText}>
              {phase === "connected" ? t("conn.connected") : t("conn.reconnecting")}
            </Text>
          </View>
        </View>
      </View>

      {computers.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.computers}
          contentContainerStyle={styles.computersInner}
        >
          {computers.map((c) => {
            const active = c.computerId === activeComputer?.computerId;
            return (
              <Pressable
                key={c.computerId}
                style={[styles.computerChip, active && styles.computerChipOn]}
                onPress={() => switchComputer(c)}
              >
                <Feather name="monitor" size={12} color={active ? colors.accent : colors.muted} />
                <Text style={[styles.computerName, active && { color: colors.accent }]}>
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {error && (
        <View style={styles.error}>
          <Feather name="alert-triangle" size={13} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.muted}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        {phase === "unreachable" && (
          <View style={styles.unreachable}>
            <Feather name="wifi-off" size={22} color={colors.attention} />
            <Text style={styles.unreachableTitle}>{t("conn.unreachable")}</Text>
            <Text style={styles.unreachableBody}>{t("conn.unreachable.body")}</Text>
            <Pressable style={styles.repairBtn} onPress={() => requestRepair()}>
              <Feather name="maximize" size={14} color="#fff" />
              <Text style={styles.repairText}>{t("conn.rescan")}</Text>
            </Pressable>
          </View>
        )}

        {projects.length === 0 && phase === "connected" && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t("sessions.noProjects")}</Text>
            <Text style={styles.emptyBody}>
              {t("sessions.noProjectsBody")}
            </Text>
          </View>
        )}
        {projects.length === 0 && phase !== "connected" && phase !== "unreachable" && (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.accent} />
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
            color={colors.faint}
          />
          <Text style={styles.projectTitle} numberOfLines={1}>
            {project.name}
          </Text>
          {live && <View style={[styles.dot, { backgroundColor: colors.ok }]} />}
        </Pressable>
        <Pressable style={styles.newBtn} onPress={onNew} hitSlop={8}>
          {busy === `new:${project.cwd}` ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Feather name="plus" size={15} color={colors.muted} />
          )}
        </Pressable>
      </View>

      {!collapsed &&
        (project.sessions.length === 0 ? (
          <Pressable style={styles.blank} onPress={onNew}>
            <Text style={styles.blankText}>{t("sessions.startOne")}</Text>
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
                  {s.title || t("sessions.untitled")}
                </Text>
                <Text style={styles.rowMeta}>
                  {ago(s.updatedAt)} ·{" "}
                  {plural("sessions.messages_one", "sessions.messages_other", s.messageCount)}
                </Text>
              </View>
              {busy === s.sessionId ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : s.running ? (
                <View style={styles.pill}>
                  <View style={[styles.dot, { backgroundColor: colors.ok }]} />
                  <Text style={styles.pillText}>{t("sessions.running")}</Text>
                </View>
              ) : null}
            </Pressable>
          ))
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
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
  computers: { flexGrow: 0, marginBottom: space.md },
  computersInner: { paddingHorizontal: space.lg, gap: space.sm },
  computerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm - 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
  },
  computerChipOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  computerName: { ...type.caption, color: colors.muted },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.xl,
    marginBottom: space.md,
    padding: space.md,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
  },
  errorText: { ...type.caption, color: colors.text, flex: 1 },
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
    color: colors.muted,
    flexShrink: 1,
  },
  newBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md + 2,
    marginBottom: space.sm,
  },
  rowPressed: { backgroundColor: colors.surface2, borderColor: colors.borderStrong },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { ...type.ui },
  rowMeta: { ...type.caption, fontSize: 11.5 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 1,
    backgroundColor: colors.okSoft,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  pillText: { ...type.label, fontSize: 10.5, color: colors.ok },
  blank: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: radius.md,
    paddingVertical: space.lg,
    alignItems: "center",
    marginBottom: space.sm,
  },
  blankText: { ...type.caption },
  unreachable: {
    alignItems: "center",
    gap: space.sm,
    marginTop: space.xl,
    padding: space.xl,
    backgroundColor: colors.attentionSoft,
    borderRadius: radius.md,
  },
  unreachableTitle: { ...type.heading, marginTop: space.xs },
  unreachableBody: { ...type.caption, color: colors.muted, textAlign: "center", lineHeight: 19 },
  repairBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  repairText: { ...type.ui, color: "#fff" },
  empty: { alignItems: "center", paddingTop: space.xxxl, gap: space.sm },
  emptyTitle: { ...type.heading, color: colors.muted },
  emptyBody: { ...type.caption, textAlign: "center" },
});
