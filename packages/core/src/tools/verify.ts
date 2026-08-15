import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { ToolDef } from "./Tool.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Path to the Electron binary, resolved lazily so the tool degrades to a clear
 * error instead of crashing the loop when Electron isn't installed (CI, CLI
 * users on a bare Node install).
 */
function resolveElectron(): string | null {
  try {
    // `electron` exports the binary path as its default export.
    const req = createRequire(import.meta.url);
    const bin = req("electron") as unknown;
    return typeof bin === "string" ? bin : null;
  } catch {
    return null;
  }
}

const schema = z.object({
  path: z.string().describe("Path to the HTML file to open and verify."),
  wait_ms: z
    .number()
    .int()
    .min(500)
    .max(30_000)
    .default(6000)
    .describe("How long to let the page run before sampling it."),
});

export interface PageReport {
  loaded: boolean;
  animates: boolean | null;
  /** Share of canvas pixels that changed over ~2s — how much actually moves. */
  motionPct: number | null;
  /** Animation frames delivered during sampling — liveness for WebGL pages. */
  frames?: number | null;
  /** True when the canvas is WebGL, whose pixels can't be read back reliably. */
  webgl?: boolean;
  canvasCovered: number | null;
  bodyHeight: number | null;
  imageCount: number | null;
  consoleErrors: string[];
  note?: string;
}

/**
 * Renders an HTML file in a real browser engine and reports whether it actually
 * draws and animates. Static inspection cannot catch a canvas that stays blank
 * or a loop that never advances, so the agent uses this to check its own work.
 */
export const verifyPageTool: ToolDef<z.input<typeof schema>> = {
  name: "verify_page",
  description:
    "Open a local HTML file in a real browser engine, let it run, and report " +
    "whether it rendered and animated: canvas coverage, whether pixels change " +
    "over time, page height, and console errors. Use this after creating or " +
    "editing an HTML page to confirm it actually works, especially for canvas " +
    "or WebGL animations where the file can look correct but render nothing.",
  schema,
  readOnly: true,
  kind: "read",
  summarize(input) {
    return `Verify rendering of ${input.path}`;
  },
  ruleArg(input) {
    return input.path;
  },
  async execute(input, ctx) {
    const { path: filePath, wait_ms = 6000 } = input;
    const abs = path.resolve(ctx.cwd, filePath);
    const electronBin = resolveElectron();
    if (!electronBin) {
      return {
        ok: false,
        output:
          "verify_page unavailable: the 'electron' package is not installed in " +
          "this environment, so the page cannot be rendered here.",
      };
    }
    const runner = path.join(HERE, "verifyRunner.cjs");
    const report = await new Promise<PageReport>((resolve) => {
      const child = spawn(electronBin, [runner, abs, String(wait_ms)], {
        cwd: ctx.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
      });
      let out = "";
      child.stdout.on("data", (d: Buffer) => {
        out += d.toString();
      });
      const timer = setTimeout(() => child.kill(), wait_ms + 25_000);
      child.on("close", () => {
        clearTimeout(timer);
        const line = out
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.startsWith("{"))
          .pop();
        if (!line) {
          resolve({
            loaded: false,
            animates: null,
            motionPct: null,
            canvasCovered: null,
            bodyHeight: null,
            imageCount: null,
            consoleErrors: [],
            note: "renderer produced no report",
          });
          return;
        }
        try {
          resolve(JSON.parse(line) as PageReport);
        } catch {
          resolve({
            loaded: false,
            animates: null,
            motionPct: null,
            canvasCovered: null,
            bodyHeight: null,
            imageCount: null,
            consoleErrors: [],
            note: "unparseable report",
          });
        }
      });
      child.on("error", () => {
        clearTimeout(timer);
        resolve({
          loaded: false,
          animates: null,
          motionPct: null,
          canvasCovered: null,
          bodyHeight: null,
          imageCount: null,
          consoleErrors: [],
          note: "failed to launch renderer",
        });
      });
    });

    const lines = [
      `loaded: ${report.loaded}`,
      `animates: ${report.animates}${
        report.motionPct === null ? "" : ` (${report.motionPct}% of pixels moved over 2s)`
      }`,
      `canvas non-background coverage: ${
        report.canvasCovered === null
          ? report.webgl
            ? `n/a (WebGL canvas; ${report.frames ?? 0} frames rendered)`
            : "n/a (no canvas)"
          : `${report.canvasCovered}%`
      }`,
      `page height: ${report.bodyHeight ?? "n/a"}px, images: ${report.imageCount ?? 0}`,
    ];
    if (report.consoleErrors.length > 0) {
      lines.push(`console errors:\n  ${report.consoleErrors.join("\n  ")}`);
    } else {
      lines.push("console errors: none");
    }
    if (report.note) lines.push(`note: ${report.note}`);

    // Call out the failure mode the agent most needs to act on.
    if (report.loaded && report.canvasCovered !== null && report.canvasCovered < 2) {
      lines.push(
        "WARNING: the canvas is essentially blank — the drawing code is not " +
          "putting anything on screen. Fix this before finishing.",
      );
    }
    if (report.loaded && report.animates === false) {
      lines.push(
        "WARNING: nothing changed between samples — the animation is not " +
          "running (the frame loop may never start or never update state).",
      );
    } else if (
      report.loaded &&
      !report.webgl &&
      report.motionPct !== null &&
      report.motionPct > 0 &&
      report.motionPct < 1.5
    ) {
      // A moving subject repaints a meaningful slice of the frame. Barely any
      // motion usually means only an ambient detail (twinkling stars, a pulsing
      // glow) is alive while the main subject is missing or parked off-screen.
      lines.push(
        `WARNING: only ${report.motionPct}% of the frame changes — the main ` +
          "subject is probably not visible (off-screen, never drawn, or drawn " +
          "outside the canvas bounds). Check its position and that it is drawn " +
          "within the visible area.",
      );
    }

    return { ok: report.loaded, output: lines.join("\n") };
  },
};
