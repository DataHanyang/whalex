import { z } from "zod";
import { toolError, truncateOutput, type ToolDef } from "../tools/Tool.js";

/**
 * The browser operations the agent can drive. Implemented in the Electron
 * main process by a WebContentsView (DOM-based, no vision needed) so DeepSeek
 * can build, test, and debug web apps despite being text-only.
 */
export interface BrowserController {
  navigate(
    url: string,
    newTab?: boolean,
  ): Promise<{ ok: boolean; title?: string; url?: string; error?: string }>;
  readPage(): Promise<string>;
  click(ref: string): Promise<string>;
  type(ref: string, text: string, submit: boolean): Promise<string>;
  scroll(direction: "up" | "down"): Promise<string>;
  readConsole(): Promise<string>;
}

export function createBrowserTools(controller: BrowserController): ToolDef<never>[] {
  const navigate: ToolDef<{ url: string; new_tab?: boolean }> = {
    name: "browser_navigate",
    description:
      "Open a URL in the in-app browser panel (or 'back'/'forward'). Use it to " +
      "preview a running web app or open documentation. Set new_tab to open a " +
      "second page side by side instead of replacing the current one. After " +
      "navigating, call browser_read_page to see the content.",
    schema: z.object({
      url: z.string().describe("URL, or 'back'/'forward'"),
      new_tab: z.boolean().optional().describe("Open in a new browser tab"),
    }),
    readOnly: false,
    kind: "fetch",
    summarize: (i) => `Browser: open ${i.url}`,
    ruleArg: (i) => {
      try {
        return new URL(i.url).host;
      } catch {
        return i.url;
      }
    },
    async execute(input) {
      const res = await controller.navigate(input.url, input.new_tab ?? false);
      if (!res.ok) return toolError(res.error ?? "navigation failed");
      return { ok: true, output: `Opened ${res.url}\nTitle: ${res.title}` };
    },
  };

  const readPage: ToolDef<Record<string, never>> = {
    name: "browser_read_page",
    description:
      "Read the current browser page as a text outline with interactive " +
      "elements tagged [ref_N]. Use those refs with browser_click / browser_type.",
    schema: z.object({}),
    readOnly: true,
    kind: "read",
    summarize: () => "Browser: read page",
    async execute() {
      return { ok: true, output: truncateOutput(await controller.readPage(), 30_000) };
    },
  };

  const click: ToolDef<{ ref: string }> = {
    name: "browser_click",
    description: "Click an element by its [ref_N] id from browser_read_page.",
    schema: z.object({ ref: z.string().describe("Element ref, e.g. ref_3") }),
    readOnly: false,
    kind: "other",
    summarize: (i) => `Browser: click ${i.ref}`,
    async execute(input) {
      return { ok: true, output: await controller.click(input.ref) };
    },
  };

  const type: ToolDef<{ ref: string; text: string; submit?: boolean }> = {
    name: "browser_type",
    description: "Type text into an input identified by [ref_N]. Set submit to press Enter after.",
    schema: z.object({
      ref: z.string(),
      text: z.string(),
      submit: z.boolean().optional(),
    }),
    readOnly: false,
    kind: "other",
    summarize: (i) => `Browser: type into ${i.ref}`,
    async execute(input) {
      return { ok: true, output: await controller.type(input.ref, input.text, input.submit ?? false) };
    },
  };

  const scroll: ToolDef<{ direction: "up" | "down" }> = {
    name: "browser_scroll",
    description: "Scroll the browser page up or down.",
    schema: z.object({ direction: z.enum(["up", "down"]) }),
    readOnly: false,
    kind: "other",
    summarize: (i) => `Browser: scroll ${i.direction}`,
    async execute(input) {
      return { ok: true, output: await controller.scroll(input.direction) };
    },
  };

  const consoleTool: ToolDef<Record<string, never>> = {
    name: "browser_console",
    description: "Read recent console messages and errors from the browser page (for debugging).",
    schema: z.object({}),
    readOnly: true,
    kind: "read",
    summarize: () => "Browser: read console",
    async execute() {
      return { ok: true, output: truncateOutput(await controller.readConsole(), 10_000) };
    },
  };

  return [navigate, readPage, click, type, scroll, consoleTool] as unknown as ToolDef<never>[];
}
