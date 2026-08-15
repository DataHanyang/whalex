import { z } from "zod";
import { toolError, truncateOutput, type ToolDef } from "../tools/Tool.js";

/**
 * OS-level input control. Because DeepSeek is text-only, computer_screenshot
 * routes the capture through the vision bridge and returns a text description
 * — so this whole tool set is only exposed when a vision model is connected.
 * Every action is a real OS input event, so the tools gate on permission and
 * the feature is off by default.
 */
export interface ComputerController {
  screenshot(): Promise<{ ok: boolean; description?: string; width?: number; height?: number; error?: string }>;
  click(x: number, y: number, button: "left" | "right" | "double"): Promise<string>;
  moveMouse(x: number, y: number): Promise<string>;
  typeText(text: string): Promise<string>;
  pressKey(key: string): Promise<string>;
}

export function createComputerTools(controller: ComputerController): ToolDef<never>[] {
  const screenshot: ToolDef<Record<string, never>> = {
    name: "computer_screenshot",
    description:
      "Capture the screen and return a text description of what's on it " +
      "(via the connected vision model), with the screen dimensions so you " +
      "can target coordinates. Take a screenshot before clicking.",
    schema: z.object({}),
    readOnly: true,
    kind: "read",
    summarize: () => "Computer: screenshot",
    async execute() {
      const r = await controller.screenshot();
      if (!r.ok) return toolError(r.error ?? "screenshot failed");
      return {
        ok: true,
        output: truncateOutput(`Screen ${r.width}x${r.height}\n\n${r.description}`, 20_000),
      };
    },
  };

  const click: ToolDef<{ x: number; y: number; button?: "left" | "right" | "double" }> = {
    name: "computer_click",
    description: "Click the mouse at screen pixel coordinates (x, y).",
    schema: z.object({
      x: z.number().int(),
      y: z.number().int(),
      button: z.enum(["left", "right", "double"]).optional(),
    }),
    readOnly: false,
    kind: "execute",
    summarize: (i) => `Computer: click (${i.x}, ${i.y})`,
    async execute(input) {
      return { ok: true, output: await controller.click(input.x, input.y, input.button ?? "left") };
    },
  };

  const move: ToolDef<{ x: number; y: number }> = {
    name: "computer_move",
    description: "Move the mouse cursor to screen pixel coordinates (x, y).",
    schema: z.object({ x: z.number().int(), y: z.number().int() }),
    readOnly: false,
    kind: "execute",
    summarize: (i) => `Computer: move to (${i.x}, ${i.y})`,
    async execute(input) {
      return { ok: true, output: await controller.moveMouse(input.x, input.y) };
    },
  };

  const typeText: ToolDef<{ text: string }> = {
    name: "computer_type",
    description: "Type text at the current focus.",
    schema: z.object({ text: z.string() }),
    readOnly: false,
    kind: "execute",
    summarize: (i) => `Computer: type "${i.text.slice(0, 40)}"`,
    async execute(input) {
      return { ok: true, output: await controller.typeText(input.text) };
    },
  };

  const key: ToolDef<{ key: string }> = {
    name: "computer_key",
    description: 'Press a key or chord (e.g. "Enter", "Escape", "Control+C", "Alt+Tab").',
    schema: z.object({ key: z.string() }),
    readOnly: false,
    kind: "execute",
    summarize: (i) => `Computer: press ${i.key}`,
    async execute(input) {
      return { ok: true, output: await controller.pressKey(input.key) };
    },
  };

  return [screenshot, click, move, typeText, key] as unknown as ToolDef<never>[];
}
