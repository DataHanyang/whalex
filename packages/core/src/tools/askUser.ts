import { z } from "zod";
import type { ToolDef } from "./Tool.js";

const questionSchema = z.object({
  question: z.string().describe("One question, ending with a question mark."),
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
    .describe("true when several options may be picked together."),
});

const schema = z.object({
  questions: z
    .array(questionSchema)
    .min(1)
    .max(4)
    .describe(
      "1-4 questions asked in ONE call. The card walks the user through them " +
      "one at a time; you get every answer back together. Prefer batching an " +
      "interview into one call over separate calls per question.",
    ),
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
    "Ask the user up to 4 questions, each with 2-5 selectable options, when " +
    "you are blocked on decisions only they can make. The card presents the " +
    "questions step-by-step and the turn pauses until all are answered; the " +
    "result lists each question with the chosen option(s) or a typed reply. " +
    "Don't use it for things you can decide or look up yourself.",
  schema,
  // Not readOnly: the fast path can't yield events; the sequential path can.
  readOnly: false,
  kind: "read",
  summarize: (i) => `Ask ${i.questions.length} question(s): ${i.questions[0]?.question.slice(0, 50) ?? ""}`,
  async execute() {
    // Never reached — the loop intercepts ask_user before dispatch.
    return { ok: false, output: "ask_user must be handled by the agent loop." };
  },
};
