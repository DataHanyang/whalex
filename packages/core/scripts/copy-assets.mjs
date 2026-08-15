// tsc only emits compiled TS; the verify_page runner is a .cjs asset that must
// sit next to the built tools so the tool can spawn it.
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = [["src/tools/verifyRunner.cjs", "dist/tools/verifyRunner.cjs"]];

for (const [from, to] of assets) {
  const dest = path.join(root, to);
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(path.join(root, from), dest);
  console.log(`copied ${from} -> ${to}`);
}
