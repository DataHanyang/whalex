#!/usr/bin/env node
// Bump the version in every package.json in the monorepo at once, so a release
// tag can never disagree with the app version (release.yml enforces the match).
//
//   pnpm bump 0.9.0              desktop + packages
//   pnpm bump 0.9.0 --mobile 0.3.0   …and the Android app
//   pnpm bump --mobile 0.3.0     the Android app alone
//
// WHAT NUMBER TO PICK — while the project is pre-1.0:
//
//   MINOR (0.X.0)  a capability that did not exist before. Something a user
//                  can point at and use: phone pairing, a language picker,
//                  an update check.
//   PATCH (0.x.Y)  everything else — bug fixes, copy, layout, refactors,
//                  and repairs to a flow that was supposed to work already.
//
// The desktop and the Android app ship as separate artifacts on their own
// schedules, so they carry separate numbers and each follows the rule on its
// own. Both live here rather than being hand-edited: the mobile version drifted
// off the rule precisely because this script did not own it.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Desktop and the shared packages move together — they are one artifact. */
const DESKTOP_FILES = [
  "package.json",
  "packages/shared/package.json",
  "packages/client-core/package.json",
  "packages/i18n/package.json",
  "packages/core/package.json",
  "packages/cli/package.json",
  "apps/desktop/package.json",
];

const MOBILE_CONFIG = "apps/mobile/app.json";

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function parseArgs(argv) {
  const out = { version: null, mobile: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--mobile") out.mobile = argv[++i] ?? null;
    else if (!out.version) out.version = argv[i];
  }
  return out;
}

const { version, mobile } = parseArgs(process.argv.slice(2));

if (!version && !mobile) {
  console.error(
    "Usage: pnpm bump <version> [--mobile <version>]\n" +
      "       pnpm bump --mobile <version>\n\n" +
      "MINOR (0.X.0) for a new capability, PATCH (0.x.Y) for fixes and polish.",
  );
  process.exit(1);
}
for (const [name, v] of [
  ["version", version],
  ["--mobile", mobile],
]) {
  if (v && !SEMVER.test(v)) {
    console.error(`${name} must be semver, got "${v}"`);
    process.exit(1);
  }
}

if (version) {
  for (const rel of DESKTOP_FILES) {
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
}

if (mobile) {
  const path = resolve(root, MOBILE_CONFIG);
  const config = JSON.parse(readFileSync(path, "utf8"));
  const old = config.expo.version;
  config.expo.version = mobile;
  // Android refuses to install a build whose versionCode did not advance, so
  // it climbs on every release regardless of which digit the name moved.
  config.expo.android = config.expo.android ?? {};
  config.expo.android.versionCode = Number(config.expo.android.versionCode ?? 0) + 1;
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  console.log(
    `  ${MOBILE_CONFIG}: ${old} -> ${mobile} (versionCode ${config.expo.android.versionCode})`,
  );
}

const tag = version ? `v${version}` : null;
console.log(
  tag
    ? `
Done. To release:
  git commit -am "build: ${tag}"
  git tag ${tag}
  git push origin improve/roadmap ${tag}   # the tag triggers .github/workflows/release.yml
  gh release edit ${tag} --draft=false --latest
`
    : `
Done. The Android app is built from apps/mobile/android and attached to the
next desktop release; no tag of its own.
`,
);
