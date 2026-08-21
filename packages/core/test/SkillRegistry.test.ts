import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SkillRegistry } from "../src/skills/SkillRegistry.js";

function bundle(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "wx-skills-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

describe("SkillRegistry frontmatter parsing", () => {
  it("reads plain single-line frontmatter", async () => {
    const dir = bundle({
      "plain/SKILL.md": "---\nname: plain\ndescription: One line.\n---\n\nBody here.\n",
    });
    const reg = new SkillRegistry();
    await reg.scan(dir, [], { bundledDir: dir });
    const skill = reg.list().find((s) => s.name === "plain");
    expect(skill?.description).toBe("One line.");
  });

  it("folds YAML block-scalar descriptions (`description: >`)", async () => {
    const dir = bundle({
      "folded/SKILL.md": [
        "---",
        "name: folded",
        "description: >",
        "  Forces the simplest solution.",
        "  Use when: user asks for less code.", // looks like a key — must stay part of the description
        "argument-hint: \"[lite|full]\"",
        "license: MIT",
        "---",
        "",
        "Body.",
      ].join("\n"),
    });
    const reg = new SkillRegistry();
    await reg.scan(dir, [], { bundledDir: dir });
    const skill = reg.list().find((s) => s.name === "folded");
    expect(skill?.description).toBe("Forces the simplest solution. Use when: user asks for less code.");
  });

  it("ignores extra frontmatter keys and keeps the body intact", async () => {
    const dir = bundle({
      "extra/SKILL.md": "---\nname: extra\ndescription: D.\nlicense: MIT\n---\n\n# Title\ncontent\n",
    });
    const reg = new SkillRegistry();
    await reg.scan(dir, [], { bundledDir: dir });
    expect(reg.list().find((s) => s.name === "extra")?.description).toBe("D.");
    expect(reg.get("extra")?.body).toContain("# Title");
  });
});
