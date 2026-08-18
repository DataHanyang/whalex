import { z } from "zod";

export const ModelInfoSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  contextWindow: z.number().int().positive(),
  maxOutput: z.number().int().positive(),
  supportsTools: z.boolean(),
  supportsReasoning: z.boolean(),
  supportsVision: z.boolean().default(false),
  /**
   * USD per 1M tokens; used for the live cost meter. Unknown models omit it.
   * Base rates are PEAK; `offPeak` (when present) applies outside DeepSeek's
   * peak windows — see effectivePricing().
   */
  pricing: z
    .object({
      input: z.number(),
      output: z.number(),
      cachedInput: z.number().optional(),
      offPeak: z
        .object({ input: z.number(), output: z.number(), cachedInput: z.number().optional() })
        .optional(),
    })
    .optional(),
});
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
export type ModelPricing = NonNullable<ModelInfo["pricing"]>;

/**
 * DeepSeek bills half price off-peak. Peak windows: 01:00-04:00 and
 * 06:00-10:00 UTC (per api-docs.deepseek.com); every other hour is off-peak.
 */
export function effectivePricing(
  pricing: ModelPricing,
  at: Date = new Date(),
): { input: number; output: number; cachedInput?: number } {
  if (!pricing.offPeak) return pricing;
  const h = at.getUTCHours();
  const peak = (h >= 1 && h < 4) || (h >= 6 && h < 10);
  return peak ? pricing : pricing.offPeak;
}

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
  // V4 ships a 1M-token context and a 384K max output on the official API.
  // Cap max output well below that: a single response is streamed and buffered,
  // and huge single writes are worse than several incremental ones.
  // Pricing: USD per 1M tokens, from api-docs.deepseek.com (2026-08). Base =
  // peak (01:00-04:00, 06:00-10:00 UTC); off-peak is half.
  "deepseek-v4-pro": {
    label: "DeepSeek V4 Pro",
    contextWindow: 1_000_000,
    maxOutput: 65_536,
    supportsTools: true,
    supportsReasoning: true,
    supportsVision: false,
    pricing: {
      input: 1.32,
      cachedInput: 0.044,
      output: 3.96,
      offPeak: { input: 0.66, cachedInput: 0.022, output: 1.98 },
    },
  },
  "deepseek-v4-flash": {
    label: "DeepSeek V4 Flash",
    contextWindow: 1_000_000,
    maxOutput: 65_536,
    supportsTools: true,
    supportsReasoning: false,
    supportsVision: false,
    pricing: {
      input: 0.44,
      cachedInput: 0.014,
      output: 1.32,
      offPeak: { input: 0.22, cachedInput: 0.007, output: 0.66 },
    },
  },
  "deepseek-chat": {
    label: "DeepSeek Chat (legacy)",
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsTools: true,
    supportsReasoning: false,
    supportsVision: false,
    pricing: { input: 0.28, cachedInput: 0.028, output: 0.42 },
  },
  "deepseek-reasoner": {
    label: "DeepSeek Reasoner (legacy)",
    contextWindow: 128_000,
    maxOutput: 32_768,
    supportsTools: false,
    supportsReasoning: true,
    supportsVision: false,
    pricing: { input: 0.28, cachedInput: 0.028, output: 0.42 },
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
