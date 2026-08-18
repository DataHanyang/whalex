import dns from "node:dns/promises";
import net from "node:net";
import { z } from "zod";
import { toolError, truncateOutput, type ToolDef } from "./Tool.js";

const WebFetchInput = z.object({
  url: z.string().url().describe("URL to fetch"),
  prompt: z.string().optional().describe("What to look for on the page (for your own focus)"),
});

/**
 * SSRF guard. web_fetch is read-only (usable in plan mode, no prompt in
 * default mode), so it must never become a bridge into the local network:
 * cloud metadata endpoints, routers, dev servers with side-effectful GETs.
 */
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || // 0.0.0.0/8 "this network"
      a === 10 ||
      a === 127 ||
      (a === 100 && b! >= 64 && b! <= 127) || // CGNAT 100.64/10
      (a === 169 && b === 254) || // link-local (cloud metadata lives here)
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const lower = ip.toLowerCase();
  // IPv4-mapped IPv6 re-checks as IPv4 — both the dotted form
  // (::ffff:10.0.0.1) and the hex form the WHATWG URL parser normalizes
  // to (::ffff:7f00:1 for 127.0.0.1).
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPrivateIp(mapped[1]!);
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1]!, 16);
    const lo = parseInt(hexMapped[2]!, 16);
    return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") || // unique-local fc00::/7
    lower.startsWith("fd") ||
    lower.startsWith("fe8") || // link-local fe80::/10
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  );
}

/** Throws unless the URL is http(s) and its host resolves only to public IPs. */
async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Only http(s) URLs are allowed (got ${url.protocol}//).`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error(`Refusing to fetch private address ${host}.`);
    return;
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error(`Refusing to fetch local hostname ${host}.`);
  }
  let addrs: Array<{ address: string }>;
  try {
    addrs = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error(`DNS lookup failed for ${host}.`);
  }
  for (const { address } of addrs) {
    if (isPrivateIp(address)) {
      throw new Error(`Refusing to fetch ${host} — it resolves to private address ${address}.`);
    }
  }
}

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
  // Read-only: usable for plan-mode research. The SSRF guard above is what
  // makes that safe — flip it back to false if the guard is ever removed.
  readOnly: true,
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
      // Follow redirects manually so every hop is re-validated — an allowed
      // public host must not be able to bounce the request to 169.254.x.x.
      let url = new URL(input.url);
      let res: Response;
      const MAX_REDIRECTS = 5;
      for (let hop = 0; ; hop++) {
        await assertPublicUrl(url);
        res = await fetch(url, {
          signal: ctx.signal,
          headers: { "user-agent": "Whalex/0.1 (+https://whalex.app)" },
          redirect: "manual",
        });
        const location = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && location) {
          if (hop >= MAX_REDIRECTS) return toolError("Too many redirects.");
          url = new URL(location, url);
          continue;
        }
        break;
      }
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
