import { z } from "zod";
import { toolError, truncateOutput, type ToolDef } from "./Tool.js";

const WebFetchInput = z.object({
  url: z.string().url().describe("URL to fetch"),
  prompt: z.string().optional().describe("What to look for on the page (for your own focus)"),
});

/** Very small HTML→text reducer — avoids bundling a full parser. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const webFetchTool: ToolDef<z.infer<typeof WebFetchInput>> = {
  name: "web_fetch",
  description:
    "Fetch a web page over HTTPS and return its readable text content. Use " +
    "for docs, references, and API pages. Returns text only (no images/JS).",
  schema: WebFetchInput,
  readOnly: false,
  kind: "fetch",
  summarize: (i) => `Fetch ${i.url}`,
  ruleArg: (i) => {
    try {
      return new URL(i.url).host;
    } catch {
      return i.url;
    }
  },
  async execute(input, ctx) {
    try {
      const res = await fetch(input.url, {
        signal: ctx.signal,
        headers: { "user-agent": "Whalex/0.1 (+https://whalex.app)" },
        redirect: "follow",
      });
      if (!res.ok) return toolError(`HTTP ${res.status} ${res.statusText}`);
      const contentType = res.headers.get("content-type") ?? "";
      const body = await res.text();
      const text = contentType.includes("html") ? htmlToText(body) : body;
      return { ok: true, output: truncateOutput(text, 50_000) };
    } catch (err) {
      return toolError(`Fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
