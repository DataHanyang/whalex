import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SETTINGS, SettingsSchema, type Settings } from "@whalex/shared";
import { whalexHome } from "@whalex/core";

/**
 * ~/.whalex/settings.json — user-level settings. Parsed through the zod
 * schema on load so a corrupt or outdated file degrades to defaults
 * per-field instead of crashing the app.
 */
export class SettingsManager {
  private settings: Settings;
  private file = path.join(whalexHome(), "settings.json");

  constructor() {
    this.settings = this.load();
  }

  private load(): Settings {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      const parsed = SettingsSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
      // Salvage whatever fields still validate.
      const merged = SettingsSchema.safeParse({ ...structuredClone(DEFAULT_SETTINGS), ...raw });
      return merged.success ? merged.data : structuredClone(DEFAULT_SETTINGS);
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  get(): Settings {
    return this.settings;
  }

  update(partial: Partial<Settings>): Settings {
    this.settings = SettingsSchema.parse({ ...this.settings, ...partial });
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.settings, null, 2), "utf8");
    return this.settings;
  }

  addAllowRule(rule: string): void {
    if (this.settings.permissions.allow.includes(rule)) return;
    this.update({
      permissions: {
        ...this.settings.permissions,
        allow: [...this.settings.permissions.allow, rule],
      },
    });
  }
}
