import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { SkillInfo } from "@whalex/shared";
import { toolError, type ToolDef } from "../tools/Tool.js";

/**
 * Discovers SKILL.md files (Claude Code-compatible) from the user-level and
 * project-level skill directories, plus enabled plugins. The system prompt
 * gets a one-line catalog; the full body is loaded on demand by the `skill`
 * tool. Project skills win over user skills on a name clash.
 */
export interface SkillScanOptions {
  /** Directory of app-bundled default skills (lowest precedence). */
  bundledDir?: string | null;
  /** Skill names switched off in settings — kept in list(), excluded from the catalog. */
  disabled?: readonly string[];
}

export class SkillRegistry {
  private skills = new Map<string, SkillInfo & { body: string }>();
  private disabled = new Set<string>();

  async scan(cwd: string, pluginSkillDirs: string[] = [], opts: SkillScanOptions = {}): Promise<void> {
    this.skills.clear();
    this.disabled = new Set(opts.disabled ?? []);
    const roots: Array<{ dir: string; source: SkillInfo["source"] }> = [
      ...(opts.bundledDir ? [{ dir: opts.bundledDir, source: "bundled" as const }] : []),
      { dir: path.join(os.homedir(), ".whalex", "skills"), source: "user" },
      ...pluginSkillDirs.map((dir) => ({ dir, source: "plugin" as const })),
      { dir: path.join(cwd, ".whalex", "skills"), source: "project" as const },
    ];
    for (const { dir, source } of roots) {
      let entries: string[];
      try {
        entries = await fs.readdir(dir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const skillFile = path.join(dir, entry, "SKILL.md");
        try {
          const raw = await fs.readFile(skillFile, "utf8");
          const { name, description, body } = parseSkill(raw, entry);
          this.skills.set(name, {
            name,
            description,
            source,
            path: skillFile,
            enabled: !this.disabled.has(name),
            body,
          });
        } catch {
          // not a skill dir
        }
      }
    }
  }

  list(): SkillInfo[] {
    return [...this.skills.values()].map(({ body: _body, ...info }) => info);
  }

  /** Compact catalog injected into the system prompt (enabled skills only). */
  catalog(): string {
    const all = [...this.skills.values()].filter((s) => s.enabled);
    if (all.length === 0) return "";
    const lines = all.map((s) => `- ${s.name}: ${s.description}`).join("\n");
    return `# Available skills\nWhen a task matches one of these, call the \`skill\` tool with its name to load detailed instructions BEFORE starting the work — the skill is the expert playbook for that kind of task.\n\n${lines}`;
  }

  get(name: string): (SkillInfo & { body: string }) | undefined {
    return this.skills.get(name);
  }

  /** The `skill` tool: loads a skill's full instructions into the conversation. */
  tool(): ToolDef<{ name: string }> {
    const registry = this;
    return {
      name: "skill",
      description:
        "Load a skill's detailed instructions when a task matches its description. " +
        "Pass the skill name from the available-skills catalog.",
      schema: z.object({ name: z.string().describe("The skill name to load") }),
      readOnly: true,
      kind: "other",
      summarize: (i) => `Load skill: ${i.name}`,
      async execute(input) {
        const skill = registry.get(input.name);
        if (!skill || !skill.enabled) {
          const names = registry
            .list()
            .filter((s) => s.enabled)
            .map((s) => s.name)
            .join(", ");
          return toolError(`Unknown skill "${input.name}". Available: ${names || "(none)"}`);
        }
        const dir = path.dirname(skill.path);
        return {
          ok: true,
          output: `# Skill: ${skill.name}\n(resources are in ${dir} — read them with read_file as needed)\n\n${skill.body}`,
        };
      },
    };
  }
}

function parseSkill(raw: string, fallbackName: string): { name: string; description: string; body: string } {
  const fm = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(raw);
  let name = fallbackName;
  let description = "";
  let body = raw;
  if (fm) {
    body = raw.slice(fm[0].length).trim();
    const lines = fm[1]!.split("\n");
    for (let i = 0; i < lines.length; i++) {
      // A top-level key starts at column 0 — indented lines are continuations
      // of a block scalar, never keys (a folded description may well contain
      // "word: something" text of its own).
      const m = /^(\w[\w-]*):\s*(.*)$/.exec(lines[i]!);
      if (!m) continue;
      const key = m[1]!.toLowerCase();
      let value = m[2]!.trim();
      // YAML block scalars (`description: >` / `|`, with optional +/- chomp):
      // gather the indented lines that follow. `>` folds with spaces, `|`
      // keeps newlines — for a one-line catalog entry both fold fine.
      if (/^[>|][+-]?$/.test(value)) {
        const parts: string[] = [];
        while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]!) || lines[i + 1]!.trim() === "")) {
          i++;
          parts.push(lines[i]!.trim());
        }
        value = parts.filter(Boolean).join(" ");
      }
      value = value.replace(/^["']|["']$/g, "").trim();
      if (key === "name") name = value;
      if (key === "description") description = value;
    }
  }
  return { name, description, body };
}
