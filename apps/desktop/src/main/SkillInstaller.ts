import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { whalexHome } from "@whalex/core";

/**
 * Installs skills (folders holding a Claude Code-compatible SKILL.md) into
 * ~/.whalex/skills from a local folder or a git/GitHub URL. GitHub "tree"
 * links are understood, so a subfolder of a big skills repo installs directly:
 *   https://github.com/anthropics/skills/tree/main/document-skills/docx
 * A repo (or folder) that contains several skill subfolders installs them all.
 */
export async function installSkills(
  source: string,
): Promise<{ ok: boolean; installed: string[]; error?: string }> {
  const target = path.join(whalexHome(), "skills");
  let cleanup: string | null = null;
  try {
    await fs.mkdir(target, { recursive: true });
    let root: string;
    if (await isDir(source)) {
      root = source;
    } else {
      const { repo, branch, subpath } = parseGitUrl(source);
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "whalex-skill-"));
      cleanup = tmp;
      const args = ["clone", "--depth", "1"];
      if (branch) args.push("--branch", branch);
      args.push(repo, tmp);
      await execa("git", args, { reject: true, timeout: 120_000 });
      root = subpath ? path.join(tmp, subpath) : tmp;
      if (!(await isDir(root))) throw new Error(`Path not found in repo: ${subpath}`);
    }

    const skillDirs = await findSkillDirs(root);
    if (skillDirs.length === 0) {
      throw new Error("No SKILL.md found (looked in the folder and its direct children).");
    }
    const installed: string[] = [];
    for (const dir of skillDirs.slice(0, 30)) {
      const name = path.basename(dir);
      const dest = path.join(target, name);
      await fs.rm(dest, { recursive: true, force: true });
      await copyDir(dir, dest);
      installed.push(name);
    }
    return { ok: true, installed };
  } catch (err) {
    return { ok: false, installed: [], error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (cleanup) await fs.rm(cleanup, { recursive: true, force: true }).catch(() => {});
  }
}

function parseGitUrl(url: string): { repo: string; branch?: string; subpath?: string } {
  // GitHub tree link → repo + branch + subfolder.
  const m = url.match(/^(https:\/\/github\.com\/[^/]+\/[^/]+)\/tree\/([^/]+)\/(.+?)\/?$/);
  if (m) return { repo: `${m[1]}.git`, branch: m[2], subpath: m[3] };
  const b = url.match(/^(https:\/\/github\.com\/[^/]+\/[^/]+)\/tree\/([^/]+)\/?$/);
  if (b) return { repo: `${b[1]}.git`, branch: b[2] };
  return { repo: url };
}

async function findSkillDirs(root: string): Promise<string[]> {
  if (await exists(path.join(root, "SKILL.md"))) return [root];
  const out: string[] = [];
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const dir = path.join(root, e.name);
    if (await exists(path.join(dir, "SKILL.md"))) {
      out.push(dir);
    } else {
      // one more level: repos often group skills (document-skills/docx/…)
      try {
        const sub = await fs.readdir(dir, { withFileTypes: true });
        for (const s of sub) {
          if (s.isDirectory() && (await exists(path.join(dir, s.name, "SKILL.md")))) {
            out.push(path.join(dir, s.name));
          }
        }
      } catch {
        // ignore
      }
    }
  }
  return out;
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === ".git") continue;
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    if (e.isDirectory()) await copyDir(from, to);
    else await fs.copyFile(from, to);
  }
}
