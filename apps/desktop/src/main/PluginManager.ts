import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { whalexHome } from "@whalex/core";
import type { InstalledPlugin } from "@whalex/shared";
import type { SettingsManager } from "./settings.js";

/**
 * Installs plugins (folders bundling skills / mcp.json / commands) from a
 * local path or a git URL. Installed plugins live under ~/.whalex/plugins;
 * the manifest drives what they contribute. Enable/disable state is in
 * settings.json.
 */
export class PluginManager {
  private dir = path.join(whalexHome(), "plugins");

  constructor(private settings: SettingsManager) {}

  async install(
    source: "local" | "git",
    location: string,
  ): Promise<{ ok: boolean; name?: string; error?: string }> {
    try {
      await fs.mkdir(this.dir, { recursive: true });
      let name: string;
      let dest: string;
      if (source === "git") {
        name = (location.split("/").pop() ?? "plugin").replace(/\.git$/, "");
        dest = path.join(this.dir, name);
        await fs.rm(dest, { recursive: true, force: true });
        await execa("git", ["clone", "--depth", "1", location, dest], { reject: true });
      } else {
        name = path.basename(location);
        dest = path.join(this.dir, name);
        await fs.rm(dest, { recursive: true, force: true });
        await copyDir(location, dest);
      }
      const manifest = await this.readManifest(dest);
      const finalName = manifest?.name ?? name;
      const plugin: InstalledPlugin = {
        name: finalName,
        version: manifest?.version ?? "0.0.0",
        source,
        path: dest,
        enabled: true,
      };
      const plugins = this.settings.get().plugins.filter((p) => p.name !== finalName);
      this.settings.update({ plugins: [...plugins, plugin] });
      return { ok: true, name: finalName };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async remove(name: string): Promise<void> {
    const plugins = this.settings.get().plugins;
    const plugin = plugins.find((p) => p.name === name);
    if (plugin) {
      await fs.rm(plugin.path, { recursive: true, force: true }).catch(() => {});
      this.settings.update({ plugins: plugins.filter((p) => p.name !== name) });
    }
  }

  /** Skill directories contributed by enabled plugins. */
  skillDirs(): string[] {
    return this.settings
      .get()
      .plugins.filter((p) => p.enabled)
      .map((p) => path.join(p.path, "skills"));
  }

  private async readManifest(
    dir: string,
  ): Promise<{ name?: string; version?: string } | null> {
    try {
      return JSON.parse(await fs.readFile(path.join(dir, "plugin.json"), "utf8"));
    } catch {
      return null;
    }
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}
