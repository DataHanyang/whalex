// The whole local APK build, in the order that actually survives Windows:
//
//   node scripts/build-apk.mjs
//
// 1. Kill every JVM — the Kotlin compile daemon outlives `gradlew --stop`
//    and keeps a classes*.dex mapped, which makes any clean fail on EBUSY.
// 2. Remove android/ with retries — the kernel releases the mapping a few
//    seconds after the kill, not instantly.
// 3. expo prebuild (fresh dir, so --clean is unnecessary) + local fixups.
// 4. gradlew assembleRelease into the shared gradle home.
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const android = path.join(mobile, "android");

try {
  execSync("taskkill /F /IM java.exe", { stdio: "ignore" });
  console.log("JVMs killed");
} catch {
  console.log("no JVMs running");
}

let removed = false;
for (let i = 0; i < 20 && !removed; i++) {
  try {
    fs.rmSync(android, { recursive: true, force: true });
    removed = true;
  } catch (e) {
    console.log(`android/ still locked (${e.code}), retrying…`);
    execSync("ping -n 4 127.0.0.1 >nul", { shell: "cmd.exe" }); // ~3s without sleep
  }
}
if (!removed) {
  console.error("android/ would not release; find the locker via Restart Manager");
  process.exit(1);
}

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run("pnpm", ["exec", "expo", "prebuild", "--platform", "android", "--no-install"], mobile);
run("node", ["scripts/android-local-fixups.mjs"], mobile);
run("./gradlew", ["assembleRelease", "-g", "C:/gradle-home"], android);

const version = JSON.parse(fs.readFileSync(path.join(mobile, "app.json"), "utf8")).expo.version;
const apk = path.join(android, "app/build/outputs/apk/release/app-release.apk");
const out = path.join(mobile, `whalex-mobile-${version}.apk`);
fs.copyFileSync(apk, out);
console.log(`\nAPK: ${out}`);
