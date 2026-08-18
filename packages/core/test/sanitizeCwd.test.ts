import { describe, expect, it } from "vitest";
import path from "node:path";
import { sanitizeCwd } from "../src/session/SessionStore.js";

describe("sanitizeCwd", () => {
  it("keys distinct paths distinctly (the old '-' squash collided)", () => {
    const a = sanitizeCwd(path.join(path.sep, "a", "b"));
    const b = sanitizeCwd(path.join(path.sep, "a-b"));
    expect(a).not.toBe(b);
  });

  it("is stable for the same path", () => {
    const p = path.join(path.sep, "proj", "x");
    expect(sanitizeCwd(p)).toBe(sanitizeCwd(p));
  });

  it("stays filesystem-safe and readable", () => {
    const key = sanitizeCwd(path.join(path.sep, "My Проект!", "웨일 X"));
    expect(key).toMatch(/^[a-zA-Z0-9가-힣_-]+$/);
    expect(key).toContain("-"); // basename prefix + hash suffix
  });

  it("keys case-insensitively on Windows", () => {
    if (process.platform !== "win32") return;
    expect(sanitizeCwd("C:\\Proj\\App")).toBe(sanitizeCwd("c:\\proj\\app"));
  });
});
