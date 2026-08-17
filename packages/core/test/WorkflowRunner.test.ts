import { describe, expect, it } from "vitest";
import { detectSandboxEscape } from "../src/workflow/WorkflowRunner.js";

describe("detectSandboxEscape", () => {
  it("rejects the escapes the review demonstrated", () => {
    expect(detectSandboxEscape(`(0,eval)("globalThis")`)).toBeTruthy();
    expect(detectSandboxEscape(`({}).constructor.constructor("return process")()`)).toBeTruthy();
    expect(detectSandboxEscape(`await import("node:fs")`)).toBeTruthy();
    expect(detectSandboxEscape(`const x = require("node:child_process")`)).toBeTruthy();
    expect(detectSandboxEscape(`process.mainModule.require("fs")`)).toBeTruthy();
    expect(detectSandboxEscape(`globalThis.foo`)).toBeTruthy();
    expect(detectSandboxEscape(`Reflect.get(x, "y")`)).toBeTruthy();
  });

  it("allows a legitimate orchestration script", () => {
    const script = `
      phase("Find");
      const results = await parallel(
        FILES.map((f) => () => agent("Review " + f, { schema: SCHEMA, phase: "Find" })),
      );
      const bugs = results.filter(Boolean).flatMap((r) => r.bugs);
      log(bugs.length + " found");
      return JSON.stringify(bugs);
    `;
    expect(detectSandboxEscape(script)).toBeNull();
  });

  it("does not trip on identifiers that merely contain a banned word", () => {
    expect(detectSandboxEscape(`const importantData = 1; const constructorName = "x";`)).toBeNull();
  });
});
