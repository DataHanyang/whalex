import path from "node:path";
import { glob } from "tinyglobby";
import type { FileMatch } from "@whalex/shared";

/**
 * Fuzzy file search for @-mentions in the composer. Ranks by subsequence
 * match quality (contiguous, path-tail, and prefix bonuses), like editors do.
 */
export async function searchFiles(
  cwd: string,
  query: string,
  limit = 20,
): Promise<FileMatch[]> {
  const all = await glob("**/*", {
    cwd,
    ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/out/**", "**/release/**"],
    onlyFiles: false,
    dot: false,
  }).catch(() => [] as string[]);

  const q = query.toLowerCase().trim();
  if (!q) {
    return all.slice(0, limit).map((p) => toMatch(cwd, p));
  }

  const scored: Array<{ p: string; score: number }> = [];
  for (const p of all) {
    const score = fuzzyScore(p.toLowerCase(), q);
    if (score > 0) scored.push({ p, score });
  }
  scored.sort((a, b) => b.score - a.score || a.p.length - b.p.length);
  return scored.slice(0, limit).map((s) => toMatch(cwd, s.p));
}

function toMatch(cwd: string, rel: string): FileMatch {
  const normalized = rel.replace(/\\/g, "/");
  const isDir = rel.endsWith("/");
  return {
    path: path.join(cwd, rel),
    relPath: normalized,
    isDir,
  };
}

function fuzzyScore(text: string, query: string): number {
  const base = text.split("/").pop() ?? text;
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (let qi = 0; qi < query.length; qi++) {
    const c = query[qi]!;
    const found = text.indexOf(c, ti);
    if (found === -1) return 0;
    streak = found === ti ? streak + 1 : 0;
    score += 1 + streak;
    ti = found + 1;
  }
  if (base.startsWith(query)) score += 10;
  if (base.includes(query)) score += 5;
  return score;
}
