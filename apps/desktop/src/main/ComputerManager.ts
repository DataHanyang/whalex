import { VisionBridge, type ComputerController } from "@whalex/core";
import type { SettingsManager } from "./settings.js";
import type { SecretVault } from "./secrets.js";

/**
 * Implements OS input control with nut-js (loaded lazily so the dependency
 * doesn't slow startup when the feature is off). Screenshots are described by
 * the vision bridge — computer use is only offered when vision is configured.
 */
export class ComputerManager implements ComputerController {
  constructor(
    private settings: SettingsManager,
    private vault: SecretVault,
  ) {}

  /** Enabled only when the user opted in AND a vision model is connected. */
  isAvailable(): boolean {
    const s = this.settings.get();
    return s.computerUse.enabled && !!s.vision.baseUrl && !!s.vision.model;
  }

  private async nut() {
    return import("@nut-tree-fork/nut-js");
  }

  async screenshot() {
    const v = this.settings.get().vision;
    if (!v.baseUrl || !v.model) return { ok: false, error: "No vision model configured." };
    try {
      const { screen } = await this.nut();
      const width = await screen.width();
      const height = await screen.height();
      const image = await screen.grab();
      // nut-js image → PNG data URL via its provider, then describe.
      const dataUrl = await this.imageToDataUrl(image);
      const bridge = new VisionBridge({
        baseUrl: v.baseUrl,
        model: v.model,
        apiKey: this.vault.get(v.apiKeyRef),
      });
      const description = await bridge.describe(
        dataUrl,
        "This is a screenshot of a computer screen. Describe the UI: windows, buttons, text fields, menus, and their approximate pixel positions, so an agent can decide where to click.",
      );
      return { ok: true, description, width, height };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async imageToDataUrl(image: unknown): Promise<string> {
    // nut-js Image → raw BGRA buffer; encode as PNG with jimp if available,
    // else fall back to a note (vision still gets dimensions from the caller).
    try {
      const { imageResource } = (await this.nut()) as unknown as {
        imageResource?: unknown;
      };
      void imageResource;
      const img = image as { toRGB?: () => Promise<{ data: Buffer; width: number; height: number }> };
      if (img.toRGB) {
        const rgb = await img.toRGB();
        // Minimal PNG via zlib+manual — instead use a tiny dependency-free path:
        // most vision endpoints accept raw base64 with a data: prefix only for
        // real image formats, so encode via sharp/jimp if present.
        return await encodePng(rgb.data, rgb.width, rgb.height);
      }
    } catch {
      // fall through
    }
    throw new Error("Could not encode screenshot.");
  }

  async click(x: number, y: number, button: "left" | "right" | "double") {
    const { mouse, Point, Button, straightTo } = await this.nut();
    await mouse.move(straightTo(new Point(x, y)));
    if (button === "double") await mouse.doubleClick(Button.LEFT);
    else await mouse.click(button === "right" ? Button.RIGHT : Button.LEFT);
    return `clicked ${button} at (${x}, ${y})`;
  }

  async moveMouse(x: number, y: number) {
    const { mouse, Point, straightTo } = await this.nut();
    await mouse.move(straightTo(new Point(x, y)));
    return `moved to (${x}, ${y})`;
  }

  async typeText(text: string) {
    const { keyboard } = await this.nut();
    await keyboard.type(text);
    return `typed ${text.length} chars`;
  }

  async pressKey(keyChord: string) {
    const nut = await this.nut();
    const parts = keyChord.split("+").map((p) => p.trim());
    const keyEnum = nut.Key as unknown as Record<string, number>;
    const keys = parts
      .map((p) => keyEnum[normalizeKey(p)])
      .filter((k): k is number => typeof k === "number");
    if (keys.length === 0) return `unknown key: ${keyChord}`;
    await nut.keyboard.pressKey(...keys);
    await nut.keyboard.releaseKey(...keys);
    return `pressed ${keyChord}`;
  }
}

function normalizeKey(k: string): string {
  const map: Record<string, string> = {
    ctrl: "LeftControl",
    control: "LeftControl",
    alt: "LeftAlt",
    shift: "LeftShift",
    cmd: "LeftSuper",
    win: "LeftSuper",
    enter: "Enter",
    esc: "Escape",
    escape: "Escape",
    tab: "Tab",
    space: "Space",
    backspace: "Backspace",
    delete: "Delete",
    up: "Up",
    down: "Down",
    left: "Left",
    right: "Right",
  };
  return map[k.toLowerCase()] ?? k.toUpperCase();
}

/** Encode raw RGB(A) to a PNG data URL using pngjs if present, else fail. */
async function encodePng(data: Buffer, width: number, height: number): Promise<string> {
  try {
    const { PNG } = await import("pngjs");
    const png = new PNG({ width, height });
    // nut-js delivers BGRA/RGBA; assume 4 channels and copy.
    data.copy(png.data);
    const buf = PNG.sync.write(png);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    throw new Error("PNG encoder (pngjs) not available.");
  }
}
