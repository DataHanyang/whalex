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
      // Cap the download — res.text() on an unbounded body would buffer a
      // multi-hundred-MB response in memory before truncateOutput ever runs.
      const MAX_BODY_BYTES = 5_000_000;
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > MAX_BODY_BYTES) {
        return toolError(`Response is ${declared} bytes (limit ${MAX_BODY_BYTES}).`);
      }
      let body = "";
      if (res.body) {
        const decoder = new TextDecoder();
        let bytes = 0;
        const reader = res.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          body += decoder.decode(value, { stream: true });
          if (bytes > MAX_BODY_BYTES) {
            await reader.cancel();
            body += "\n… (response truncated at 5 MB)";
            break;
          }
        }
        body += decoder.decode();
      } else {
        body = await res.text();
      }
      const text = contentType.includes("html") ? htmlToText(body) : body;
      return { ok: true, output: truncateOutput(text, 50_000) };
    } catch (err) {
      return toolError(`Fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
