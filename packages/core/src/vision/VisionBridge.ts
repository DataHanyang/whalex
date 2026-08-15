import OpenAI from "openai";

export interface VisionConfig {
  baseUrl: string;
  model: string;
  apiKey: string | null;
}

/**
 * DeepSeek's API is text-only, so images are handled by a "sidecar" vision
 * model the user connects separately (any OpenAI-compatible vision endpoint —
 * GPT-4o mini, Gemini, local Ollama LLaVA/Qwen-VL). The bridge turns an image
 * into a detailed text description that gets injected into DeepSeek's context.
 * When DeepSeek ships native vision, this is bypassed via ModelInfo.supportsVision.
 */
export class VisionBridge {
  private client: OpenAI;

  constructor(private config: VisionConfig) {
    this.client = new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey ?? "sk-no-key",
      maxRetries: 1,
    });
  }

  async describe(imageDataUrl: string, question?: string): Promise<string> {
    const prompt =
      question ??
      "Describe this image in detail: layout, text content, colors, UI elements, and anything notable. Be thorough and specific so someone who cannot see it understands it fully.";
    const res = await this.client.chat.completions.create({
      model: this.config.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ] as never,
        },
      ],
      max_tokens: 1024,
    });
    return res.choices[0]?.message?.content ?? "(no description)";
  }

  async test(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.models.list();
      return { ok: true };
    } catch (err) {
      // Some vision endpoints don't expose /models; treat that as reachable.
      const msg = err instanceof Error ? err.message : String(err);
      if (/404|not found/i.test(msg)) return { ok: true };
      return { ok: false, error: msg };
    }
  }
}
