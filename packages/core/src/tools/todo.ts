import { z } from "zod";
import { TodoSchema } from "@whalex/shared";
import type { ToolDef } from "./Tool.js";

const TodoWriteInput = z.object({
  todos: z.array(TodoSchema).describe("The complete, updated todo list"),
});

export const todoWriteTool: ToolDef<z.infer<typeof TodoWriteInput>> = {
  name: "todo_write",
  description:
    "Replace the session todo list. Use it to plan multi-step work and keep " +
    "the user informed: add tasks up front, mark one in_progress while working " +
    "on it, and completed as soon as it is done.",
  schema: TodoWriteInput,
  readOnly: true,
  kind: "other",
  summarize: (i) => {
    const done = i.todos.filter((t) => t.status === "completed").length;
    return `Update todos (${done}/${i.todos.length} done)`;
  },
  async execute(input, ctx) {
    ctx.setTodos(input.todos);
    return { ok: true, output: `Todo list updated (${input.todos.length} items).` };
  },
};
