import { z } from "zod";
import type { ToolDef } from "./Tool.js";

const schema = z.object({
  question: z.string().describe("The question to put to the user, ending with a question mark."),
  options: z
    .array(
      z.object({
        label: z.string().describe("Short choice text (1-6 words)"),
        description: z.string().optional().describe("One line on what picking this means"),
      }),
    )
    .min(2)
    .max(5)
    .describe("2-5 choices."),
  multi_select: z
    .boolean()
    .optional()
    .describe("true when several options may be picked together; answers come back comma-separated."),
});

export type AskUserInput = z.infer<typeof schema>;

/**
 * Lets the agent put a real question to the user as a card with options —
 * for decisions it cannot make from the request or the code alone. Execution
 * is intercepted by the agent loop, which pauses the turn until the user
 * answers (the same shape as a permission request); this definition only
 * carries the schema and description to the model.
 */
export const askUserTool: ToolDef<AskUserInput> = {
  name: "ask_user",
  description:
    "Ask the user a question with 2-5 selectable options when you are blocked " +
    "on a decision only they can make (which approach, which file, which " +
    "trade-off). Ask one thing per call and chain calls for a step-by-step " +
    "interview. The turn pauses until they answer; the result is the chosen " +
    "option(s) or their typed reply. Don't use it for things you can decide yourself.",
  schema,
  // Not readOnly: the fast path can't yield events; the sequential path can.
  readOnly: false,
  kind: "read",
  summarize: (i) => `Ask: ${i.question.slice(0, 60)}`,
  async execute() {
    // Never reached — the loop intercepts ask_user before dispatch.
    return { ok: false, output: "ask_user must be handled by the agent loop." };
  },
};
