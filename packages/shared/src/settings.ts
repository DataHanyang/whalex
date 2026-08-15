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

export const SettingsSchema = z.object({
  onboardingComplete: z.boolean().default(false),
  language: z.enum(["system", "ko", "en"]).default("system"),
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
  permissions: PermissionRulesSchema.default({}),
  /** name → server entry. Superset of the project-level .mcp.json. */
  mcpServers: z.record(McpServerEntrySchema).default({}),
  plugins: z.array(InstalledPluginSchema).default([]),
  superCode: z
    .object({
      maxAgents: z.number().int().min(1).max(200).default(50),
      tokenBudget: z.number().int().min(0).default(0),
      confirmBeforeRun: z.boolean().default(true),
    })
    .default({}),
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
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
