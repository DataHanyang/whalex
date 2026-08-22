import Constants from "expo-constants";

/**
 * Update check for a sideloaded build.
 *
 * The app ships as an APK rather than through a store, so nothing tells the
 * phone a new version exists. It asks GitHub for the newest release carrying
 * an APK and compares versions itself; installing is still the user tapping
 * the file, which is the honest flow for an app installed this way.
 */

const RELEASES = "https://api.github.com/repos/leejoong/whalex/releases?per_page=10";
const APK = /^whalex-mobile-(\d+\.\d+\.\d+)\.apk$/i;

export const currentVersion: string = Constants.expoConfig?.version ?? "0.0.0";

export interface UpdateInfo {
  version: string;
  url: string;
}

/** Numeric compare, so 0.1.10 beats 0.1.9 rather than losing alphabetically. */
function isNewer(candidate: string, current: string): boolean {
  const a = candidate.split(".").map(Number);
  const b = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** Resolves to the newer release, or null when this build is current. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const res = await fetch(RELEASES, { headers: { accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
  const releases = (await res.json()) as Array<{
    draft?: boolean;
    prerelease?: boolean;
    assets?: Array<{ name: string; browser_download_url: string }>;
  }>;
  if (!Array.isArray(releases)) return null;

  for (const release of releases) {
    if (release.draft || release.prerelease) continue;
    for (const asset of release.assets ?? []) {
      const m = APK.exec(asset.name);
      if (!m) continue;
      // The newest release wins; older ones are not worth walking past.
      return isNewer(m[1]!, currentVersion)
        ? { version: m[1]!, url: asset.browser_download_url }
        : null;
    }
  }
  return null;
}
