import { describe, expect, it } from "vitest";
import { searchFiles } from "../src/files/search.js";
import path from "node:path";

const coreRoot = path.resolve(__dirname, "..");

describe("searchFiles", () => {
  it("ranks a close filename match above unrelated files", async () => {
    const results = await searchFiles(coreRoot, "AgentLoop", 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.relPath.toLowerCase()).toContain("agentloop");
  });

  it("returns relative paths with forward slashes", async () => {
    const results = await searchFiles(coreRoot, "package", 5);
    expect(results.some((r) => r.relPath === "package.json")).toBe(true);
    expect(results.every((r) => !r.relPath.includes("\\"))).toBe(true);
  });

  it("excludes node_modules", async () => {
    const results = await searchFiles(coreRoot, "index", 50);
    expect(results.every((r) => !r.relPath.includes("node_modules"))).toBe(true);
  });

  it("returns nothing for a non-matching query", async () => {
    const results = await searchFiles(coreRoot, "zzzznotathing", 10);
    expect(results).toHaveLength(0);
  });
});
