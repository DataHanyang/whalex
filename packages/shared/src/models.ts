import { z } from "zod";

export const ModelInfoSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  contextWindow: z.number().int().positive(),
  maxOutput: z.number().int().positive(),
  supportsTools: z.boolean(),
  supportsReasoning: z.boolean(),
  supportsVision: z.boolean().default(false),
  /** USD per 1M tokens; used for the live cost meter. Unknown models omit it. */
  pricing: z
    .object({ input: z.number(), output: z.number(), cachedInput: z.number().optional() })
    .optional(),
});
export type ModelInfo = z.infer<typeof ModelInfoSchema>;

export const ProviderSettingsSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string().url(),
  /** Reference into the secret vault. Absent for keyless endpoints (e.g. local Ollama). */
  apiKeyRef: z.string().optional(),
});
export type ProviderSettings = z.infer<typeof ProviderSettingsSchema>;

/**
 * Metadata catalog for models we recognize. The live list always comes from
 * GET /models; this only enriches known ids with context/tool/pricing info.
 * Unknown models fall back to DEFAULT_MODEL_META.
 */
export const KNOWN_MODELS: Record<string, Omit<ModelInfo, "id">> = {
  "deepseek-v4-pro": {
    label: "DeepSeek V4 Pro",
    contextWindow: 128_000,
    maxOutput: 16_384,
    supportsTools: true,
    supportsReasoning: true,
    supportsVision: false,
  },
  "deepseek-v4-flash": {
    label: "DeepSeek V4 Flash",
    contextWindow: 128_000,
    maxOutput: 16_384,
    supportsTools: true,
    supportsReasoning: false,
    supportsVision: false,
  },
  "deepseek-chat": {
    label: "DeepSeek Chat (legacy)",
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsTools: true,
    supportsReasoning: false,
    supportsVision: false,
  },
  "deepseek-reasoner": {
    label: "DeepSeek Reasoner (legacy)",
    contextWindow: 128_000,
    maxOutput: 32_768,
    supportsTools: false,
    supportsReasoning: true,
    supportsVision: false,
  },
};

export const DEFAULT_MODEL_META: Omit<ModelInfo, "id" | "label"> = {
  contextWindow: 64_000,
  maxOutput: 8_192,
  supportsTools: true,
  supportsReasoning: false,
  supportsVision: false,
};

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_PROVIDER_ID = "deepseek";

export function resolveModelInfo(id: string): ModelInfo {
  const known = KNOWN_MODELS[id];
  if (known) return { id, ...known };
  return { id, label: id, ...DEFAULT_MODEL_META };
}
