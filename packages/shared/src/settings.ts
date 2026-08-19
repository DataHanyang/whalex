import { z } from "zod";
import { PermissionRulesSchema } from "./permissions.js";
import { ProviderSettingsSchema, DEEPSEEK_BASE_URL, DEEPSEEK_PROVIDER_ID } from "./models.js";

export const McpServerConfigSchema = z.union([
  z.object({
    type: z.literal("stdio").default("stdio"),
    command: z.string(),
    args: z.array(z.string()).default([]),
    env: z.record(z.string()).default({}),
  }),
  z.object({
    type: z.enum(["http", "sse"]),
    url: z.string().url(),
    headers: z.record(z.string()).default({}),
  }),
]);
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export const McpServerEntrySchema = z.object({
  config: McpServerConfigSchema,
  enabled: z.boolean().default(true),
});
export type McpServerEntry = z.infer<typeof McpServerEntrySchema>;

export const InstalledPluginSchema = z.object({
  name: z.string(),
  version: z.string(),
  source: z.enum(["local", "git", "npm"]),
  path: z.string(),
  enabled: z.boolean().default(true),
});
export type InstalledPlugin = z.infer<typeof InstalledPluginSchema>;

export const HookEventSchema = z.enum([
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
  "SessionStart",
  "Stop",
]);
export type HookEvent = z.infer<typeof HookEventSchema>;

export const HookConfigSchema = z.object({
  event: HookEventSchema,
  /** Tool-name glob to match (PreToolUse/PostToolUse). Absent = all. */
  matcher: z.string().optional(),
  /** Shell command; receives the hook payload as JSON on stdin. */
  command: z.string(),
});
export type HookConfig = z.infer<typeof HookConfigSchema>;

export const ReasoningEffortSchema = z.preprocess(
  // Early builds stored "extra"; DeepSeek's scale calls that tier "max".
  (v) => (v === "extra" ? "max" : v),
  z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]),
);
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

export const RoutineScheduleSchema = z.union([
  z.object({ kind: z.literal("interval"), minutes: z.number().int().min(5).max(10080) }),
  z.object({ kind: z.literal("daily"), time: z.string().regex(/^\d{2}:\d{2}$/) }),
  z.object({
    kind: z.literal("weekly"),
    weekday: z.number().int().min(0).max(6),
    time: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  /** One-shot run at an epoch-ms timestamp; disabled automatically after firing. */
  z.object({ kind: z.literal("once"), at: z.number() }),
]);
export type RoutineSchedule = z.infer<typeof RoutineScheduleSchema>;

export const RoutineSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** The message sent to a fresh session when the routine fires. */
  prompt: z.string(),
  /** Working directory the routine session opens in. */
  cwd: z.string(),
  schedule: RoutineScheduleSchema,
  /** Permission mode for the unattended run — plan mode makes no sense here. */
  permissionMode: z.enum(["default", "acceptEdits", "bypassPermissions"]).default("acceptEdits"),
  enabled: z.boolean().default(true),
  lastRunAt: z.number().optional(),
  lastSessionId: z.string().optional(),
});
export type Routine = z.infer<typeof RoutineSchema>;

export const SettingsSchema = z.object({
  onboardingComplete: z.boolean().default(false),
  language: z.enum(["system", "en", "ko", "zh", "ja", "fr"]).default("en"),
  theme: z.enum(["system", "light", "dark"]).default("system"),
  defaultCwd: z.string().optional(),
  recentCwds: z.array(z.string()).default([]),
  activeProviderId: z.string().default(DEEPSEEK_PROVIDER_ID),
  providers: z.array(ProviderSettingsSchema).default([
    {
      id: DEEPSEEK_PROVIDER_ID,
      name: "DeepSeek",
      baseUrl: DEEPSEEK_BASE_URL,
      apiKeyRef: "deepseek-api-key",
    },
  ]),
  defaultModel: z.string().default("deepseek-v4-flash"),
  temperature: z.number().min(0).max(2).default(0.2),
  /**
   * How much the model should think before answering. Sent as reasoning_effort
   * to providers that accept it; ignored by models without a thinking mode.
   */
  reasoningEffort: ReasoningEffortSchema.default("medium"),
  permissions: PermissionRulesSchema.default({}),
  /** name → server entry. Superset of the project-level .mcp.json. */
  mcpServers: z.record(McpServerEntrySchema).default({}),
  plugins: z.array(InstalledPluginSchema).default([]),
  superCode: z.preprocess(
    // 50 was the old shipped default; SuperCode is a scale-first mode now.
    (v) =>
      v && typeof v === "object" && (v as { maxAgents?: number }).maxAgents === 50
        ? { ...(v as object), maxAgents: 400 }
        : v,
    z
      .object({
        maxAgents: z.number().int().min(1).max(1000).default(400),
        tokenBudget: z.number().int().min(0).default(0),
        confirmBeforeRun: z.boolean().default(true),
        /**
         * Give fleet agents the shell tool. Commands still pass the
         * PermissionEngine, so in default mode each one prompts; pair with
         * acceptEdits/bypass (or allow-rules) for unattended fleet shell.
         */
        fleetShell: z.boolean().default(true),
      })
      .default({}),
  ),
  /** Mask secret-shaped strings before requests leave for the model API. */
  redactSecrets: z.boolean().default(true),
  /** Summarize and shrink the context automatically as it fills up. */
  autoCompact: z.boolean().default(true),
  updateChannel: z.enum(["stable", "beta"]).default("stable"),
  /** Optional vision sidecar — DeepSeek is text-only. Empty = disabled. */
  vision: z
    .object({
      baseUrl: z.string().default(""),
      model: z.string().default(""),
      apiKeyRef: z.string().default("vision-api-key"),
    })
    .default({}),
  /** OS input control — experimental, needs vision, off by default. */
  computerUse: z.object({ enabled: z.boolean().default(false) }).default({}),
  hooks: z.array(HookConfigSchema).default([]),
  /** Feature toggles — turn agent capabilities on/off. */
  features: z
    .object({
      subagents: z.boolean().default(true),
      superCode: z.boolean().default(true),
      browserUse: z.boolean().default(true),
      webFetch: z.boolean().default(true),
    })
    .default({}),
  /** Which subagent types the agent may spawn. */
  disabledAgentTypes: z.array(z.string()).default([]),
  /**
   * User-authored instructions injected into every session's system prompt,
   * across all projects — the app-level counterpart of a project WHALEX.md.
   */
  customInstructions: z.string().default(""),
  /** Scheduled prompts that run unattended while the app sits in the tray. */
  routines: z.array(RoutineSchema).default([]),
  /** Spend guardrails, enforced against the local usage ledger. 0 = off. */
  usageLimits: z
    .object({
      dailyUsd: z.number().min(0).default(0),
      monthlyUsd: z.number().min(0).default(0),
      /** Warn when a limit's spend crosses this percentage. */
      warnAtPct: z.number().int().min(1).max(100).default(80),
      /** Refuse to start new turns once a limit is fully spent. */
      hardStop: z.boolean().default(false),
      /** Warn when the DeepSeek account balance drops below this (USD/CNY as reported). */
      lowBalance: z.number().min(0).default(0),
    })
    .default({}),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
