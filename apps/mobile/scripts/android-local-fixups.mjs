#!/usr/bin/env node
/**
 * Re-applies this machine's Android build workarounds after `expo prebuild`,
 * which regenerates android/ from scratch. The directory is gitignored, so
 * this script is the durable record of why the build needs them.
 *
 *   node scripts/android-local-fixups.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const android = path.resolve(here, "../android");

if (!fs.existsSync(android)) {
  console.error("no android/ directory — run `expo prebuild --platform android` first");
  process.exit(1);
}

const SDK = process.env.ANDROID_SDK_ROOT ?? "C:/Android/Sdk";
const JDK = process.env.WHALEX_JDK ?? "C:/gradle-home/jdks/eclipse_adoptium-17-amd64-windows.2";
const TMP = process.env.WHALEX_BUILD_TMP ?? "C:/tmp-android";

fs.mkdirSync(TMP, { recursive: true });
fs.writeFileSync(path.join(android, "local.properties"), `sdk.dir=${SDK}\n`, "utf8");

const gradleProps = path.join(android, "gradle.properties");
let text = fs.readFileSync(gradleProps, "utf8");

// 1. AGP writes the prefab helper as a .bat that embeds java.io.tmpdir. A
//    non-ASCII Windows username makes cmd.exe mis-parse it, so the native
//    C++ configure step dies before it starts.
text = text.replace(
  /^org\.gradle\.jvmargs=.*$/m,
  (line) => `${line} -Djava.io.tmpdir=${TMP}`,
);

// 2. Compile in a daemon on the same JDK the Android toolchain resolves.
//    Mismatched JVMs made the forked Java worker die on a classpath CNFE.
if (!/^org\.gradle\.java\.home=/m.test(text)) {
  text += `\norg.gradle.java.home=${JDK}\n`;
}

// 3. Phone ABIs only: the emulator x86 slices double the APK for no benefit
//    to a sideloaded preview build.
text = text.replace(/^reactNativeArchitectures=.*$/m, "reactNativeArchitectures=arm64-v8a");

fs.writeFileSync(gradleProps, text, "utf8");
console.log("android/ fixups applied (sdk, jdk, tmpdir, abi)");
