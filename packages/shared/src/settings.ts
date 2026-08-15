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
  mcpServers: z.record(McpServerConfigSchema).default({}),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
