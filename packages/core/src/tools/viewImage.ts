import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { toolError, type ToolDef } from "./Tool.js";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

const MAX_BYTES = 10 * 1024 * 1024;

const schema = z.object({
  path: z.string().describe("Path to the image file (png/jpg/webp/gif/bmp)"),
  question: z
    .string()
    .optional()
    .describe(
      "What to look for. Be specific — e.g. 'Check this slide for text overflow, " +
        "overlapping elements, and inconsistent spacing.'",
    ),
});

/**
 * Lets a text-only main model "see" a local image by routing it through the
 * connected vision sidecar. Registered only when a vision model is configured.
 * This is the visual-QA workhorse: exported slide PNGs, page screenshots,
 * design references the user drops in.
 */
export function createViewImageTool(
  describe: (dataUrl: string, question?: string) => Promise<string>,
): ToolDef<z.infer<typeof schema>> {
  return {
    name: "view_image",
    description:
      "Look at a local image file through the connected vision model and get a " +
      "detailed description back. Use it to QA exported slide images or page " +
      "screenshots (pass a specific question — overflow? overlap? contrast?), " +
      "or to understand an image the user references.",
    schema,
    readOnly: true,
    kind: "read",
    summarize: (i) => `View image: ${i.path}`,
    ruleArg: (i) => i.path,
    async execute(input, ctx) {
      const abs = path.isAbsolute(input.path) ? input.path : path.resolve(ctx.cwd, input.path);
      const mime = MIME[path.extname(abs).toLowerCase()];
      if (!mime) return toolError(`Unsupported image type: ${path.extname(abs) || "(none)"}`);
      let buf: Buffer;
      try {
        buf = await fs.readFile(abs);
      } catch {
        return toolError(`Could not read ${abs}`);
      }
      if (buf.length > MAX_BYTES) {
        return toolError(`Image is ${(buf.length / 1024 / 1024).toFixed(1)}MB — over the 10MB limit.`);
      }
      try {
        const text = await describe(`data:${mime};base64,${buf.toString("base64")}`, input.question);
        return { ok: true, output: text };
      } catch (err) {
        return toolError(
          `Vision model failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  };
}
