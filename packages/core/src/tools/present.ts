import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { toolError, type ToolDef } from "./Tool.js";

const PresentInput = z.object({
  path: z.string().optional().describe("Path to a file to render (html/md/svg/image/csv)"),
  content: z.string().optional().describe("Inline content to render instead of a file"),
  kind: z
    .enum(["html", "markdown", "svg", "mermaid", "image", "code"])
    .describe("How to render the artifact"),
  title: z.string().describe("Short title shown on the artifact tab"),
  language: z.string().optional().describe("Language for code artifacts"),
});

/**
 * Opens the artifact/preview panel for the user. The tool result carries a
 * WHALEX_ARTIFACT marker that the agent host turns into an `artifact` event;
 * the renderer opens the split panel and renders it.
 */
export const presentFileTool: ToolDef<z.infer<typeof PresentInput>> = {
  name: "present_file",
  description:
    "Show a result to the user in the preview panel: render an HTML page, " +
    "markdown doc, SVG, Mermaid diagram, image, or code. Use this after " +
    "creating something visual so the user can see it without leaving Whalex. " +
    "Provide either a file path or inline content.",
  schema: PresentInput,
  readOnly: true,
  kind: "other",
  summarize: (i) => `Present ${i.title}`,
  async execute(input, ctx) {
    let content = input.content ?? "";
    let absPath: string | undefined;
    if (input.path) {
      absPath = path.isAbsolute(input.path)
        ? input.path
        : path.resolve(ctx.cwd, input.path);
      if (!input.content) {
        try {
          if (input.kind === "image") {
            const buf = await fs.readFile(absPath);
            const ext = path.extname(absPath).slice(1) || "png";
            content = `data:image/${ext};base64,${buf.toString("base64")}`;
          } else {
            content = await fs.readFile(absPath, "utf8");
          }
        } catch {
          return toolError(`Could not read ${absPath}`);
        }
      }
    }
    if (!content) return toolError("present_file needs either path or content.");

    const artifact = {
      artifactId: randomUUID(),
      title: input.title,
      kind: input.kind,
      path: absPath,
      content,
      language: input.language,
    };
    return {
      ok: true,
      output: `WHALEX_ARTIFACT:${JSON.stringify(artifact)}`,
    };
  },
};
