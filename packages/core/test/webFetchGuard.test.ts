import { describe, expect, it } from "vitest";
import { webFetchTool } from "../src/tools/web.js";

const ctx = { signal: new AbortController().signal } as never;

describe("web_fetch SSRF guard", () => {
  it("is read-only (plan-mode research must be allowed)", () => {
    expect(webFetchTool.readOnly).toBe(true);
  });

  it.each([
    "http://127.0.0.1/admin",
    "http://localhost:3000/",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://172.16.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:127.0.0.1]/",
  ])("refuses private address %s", async (url) => {
    const res = await webFetchTool.execute({ url } as never, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toMatch(/private|local/i);
  });

  it("refuses non-http protocols", async () => {
    const res = await webFetchTool.execute({ url: "ftp://example.com/x" } as never, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toMatch(/http/i);
  });
});
