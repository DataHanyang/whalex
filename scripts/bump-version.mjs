#!/usr/bin/env node
// Bump the version in every package.json in the monorepo at once, so a release
// tag can never disagree with the app version (release.yml enforces the match).
//
// Usage: pnpm bump 0.2.2

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const FILES = [
  "package.json",
  "packages/shared/package.json",
  "packages/client-core/package.json",
  "packages/i18n/package.json",
  "packages/core/package.json",
  "packages/cli/package.json",
  "apps/desktop/package.json",
];

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: pnpm bump <version>    e.g. pnpm bump 0.2.2");
  process.exit(1);
}

for (const rel of FILES) {
  const path = resolve(root, rel);
  const raw = readFileSync(path, "utf8");
  const old = JSON.parse(raw).version;
  // Regex edit (not JSON.stringify) so formatting/key order stays untouched.
  const next = raw.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`);
  if (next === raw && old !== version) {
    console.error(`No "version" field updated in ${rel} — aborting.`);
    process.exit(1);
  }
  writeFileSync(path, next);
  console.log(`  ${rel}: ${old} -> ${version}`);
}

console.log(`
Done. To release:
  git commit -am "release: v${version}"
  git tag v${version}
  git push origin main v${version}    # the v${version} tag triggers .github/workflows/release.yml
`);
