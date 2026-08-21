import type { PermissionRequest, SessionMeta, TranscriptItem } from "@whalex/shared";
import { useMobileSession, type Project } from "./stores/sessionStore";
import { useConnectionStore } from "./stores/connectionStore";

/**
 * Seeds the stores with a representative session so the UI can be reviewed
 * (and screenshotted) without a paired desktop. Enabled with
 * `EXPO_PUBLIC_DEMO=1`; the real app never imports this path at runtime.
 */

const now = Date.now();

const OLD = `export function totals(rows: Row[]) {
  let sum = 0;
  for (const r of rows) {
    sum += r.amount;
  }
  return sum;
}`;

const NEW = `export function totals(rows: Row[]): number {
  // Skip voided rows — they stay in the ledger for audit but must not count.
  return rows
    .filter((r) => !r.voided)
    .reduce((sum, r) => sum + r.amount, 0);
}`;

const TRANSCRIPT: TranscriptItem[] = [
  {
    kind: "user",
    id: "u1",
    text: "The invoice totals are off when a row gets voided. Find it and fix it.",
    ts: now - 240_000,
  },
  {
    kind: "assistant",
    id: "a1",
    text: "Let me look at how totals are computed and where voided rows are set.",
    reasoning: "",
    streaming: false,
    interrupted: false,
    ts: now - 235_000,
  },
  {
    kind: "tool",
    id: "t1",
    toolName: "grep",
    args: { pattern: "voided" },
    state: "ok",
    output: "src/billing/totals.ts:12\nsrc/billing/ledger.ts:88\nsrc/api/invoice.ts:41",
    durationMs: 420,
    ts: now - 230_000,
  },
  {
    kind: "tool",
    id: "t2",
    toolName: "read_file",
    args: { path: "src/billing/totals.ts" },
    state: "ok",
    output: OLD,
    durationMs: 180,
    ts: now - 228_000,
  },
  {
    kind: "todos",
    id: "td1",
    todos: [
      { status: "completed", content: "Trace where totals are summed" },
      { status: "in_progress", content: "Exclude voided rows from the sum" },
      { status: "pending", content: "Add a regression test" },
    ],
    ts: now - 220_000,
  },
  {
    kind: "assistant",
    id: "a2",
    text: `Found it. \`totals()\` sums **every** row, including ones marked \`voided\`, so a voided line still lands in the invoice figure.

The ledger keeps voided rows on purpose for audit, so the fix belongs in the sum rather than in the data:

\`\`\`ts
return rows
  .filter((r) => !r.voided)
  .reduce((sum, r) => sum + r.amount, 0);
\`\`\`

I'll apply that and add a test covering a voided row.`,
    reasoning: "",
    streaming: false,
    interrupted: false,
    ts: now - 200_000,
  },
  {
    kind: "tool",
    id: "t3",
    toolName: "edit_file",
    args: { path: "src/billing/totals.ts" },
    state: "ok",
    output: "",
    durationMs: 260,
    diff: { path: "src/billing/totals.ts", oldText: OLD, newText: NEW },
    ts: now - 190_000,
  },
  {
    kind: "tool",
    id: "t4",
    toolName: "bash",
    args: { command: "pnpm vitest run src/billing" },
    state: "running",
    output: "",
    durationMs: 0,
    ts: now - 40_000,
  },
  {
    kind: "user",
    id: "u2",
    text: "Also check the CSV export uses the same helper.",
    ts: now - 20_000,
    delivery: "pending",
  },
];

const PERMISSION: PermissionRequest = {
  id: "p1",
  sessionId: "s1",
  toolCallId: "t5",
  toolName: "bash",
  kind: "execute",
  summary: "Run the billing test suite",
  args: { command: "pnpm vitest run src/billing --reporter=verbose" },
  suggestedRules: ["bash(pnpm vitest*)"],
};

const SESSIONS: SessionMeta[] = [
  {
    sessionId: "s1",
    cwd: "C:/work/ledger",
    title: "Voided rows counted in invoice totals",
    createdAt: now - 900_000,
    updatedAt: now - 20_000,
    running: true,
    messageCount: 14,
  },
  {
    sessionId: "s2",
    cwd: "C:/work/ledger",
    title: "Migrate the export job to streaming",
    createdAt: now - 86_400_000,
    updatedAt: now - 7_200_000,
    messageCount: 41,
  },
  {
    sessionId: "s3",
    cwd: "C:/work/atlas-site",
    title: "Landing page hero and pricing table",
    createdAt: now - 172_800_000,
    updatedAt: now - 90_000_000,
    messageCount: 8,
  },
];

const PROJECTS: Project[] = [
  {
    cwd: "C:/work/ledger",
    name: "ledger",
    sessions: SESSIONS.filter((s) => s.cwd === "C:/work/ledger"),
    updatedAt: now - 20_000,
  },
  {
    cwd: "C:/work/atlas-site",
    name: "atlas-site",
    sessions: SESSIONS.filter((s) => s.cwd === "C:/work/atlas-site"),
    updatedAt: now - 90_000_000,
  },
  { cwd: "C:/work/whalex", name: "whalex", sessions: [], updatedAt: 0 },
];

export function seedDemo(withPermission = false): void {
  useConnectionStore.setState({
    phase: "connected",
    hello: {
      type: "hello-ok",
      protocolVersion: 1,
      serverVersion: "0.8.0",
      computerId: "demo",
      name: "studio-pc",
      deviceId: "demo-device",
      attached: { sessionId: "s1", cwd: "C:/work/ledger", running: true },
    },
  });
  useMobileSession.setState({
    // No socket behind this build, so the actions that would reach for one
    // resolve against the seeded state instead of surfacing a connection error.
    refreshSessions: async () => {},
    setPermissionMode: async (mode) => useMobileSession.setState({ permissionMode: mode }),
    sessions: SESSIONS,
    projects: PROJECTS,
    transcript: TRANSCRIPT,
    activeSessionId: "s1",
    cwd: "C:/work/ledger",
    status: "tool",
    permissionMode: "default",
    pendingPermissions: withPermission ? [PERMISSION] : [],
    usage: {
      inputTokens: 82_140,
      outputTokens: 6_210,
      cachedInputTokens: 61_000,
      contextTokens: 34_800,
      contextPct: 27,
      costUsd: 0.084,
    },
  });
}
