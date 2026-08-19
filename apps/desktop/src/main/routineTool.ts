import { z } from "zod";
import type { Routine, RoutineSchedule } from "@whalex/shared";
import type { ToolDef } from "@whalex/core";

const RoutineToolInput = z.object({
  prompt: z
    .string()
    .describe("What the routine should do, INCLUDING when to run it, in natural language."),
  name: z.string().optional().describe("Optional short title; auto-derived if omitted."),
  cwd: z.string().optional().describe("Working folder; defaults to the current session's folder."),
});

/**
 * Lets the agent save a routine mid-conversation ("run this every morning").
 * The saved routine is managed in Settings → Routines; this tool only creates
 * it. Schedule extraction happens in saveRoutine (the model reads the prompt).
 */
export function createRoutineTool(deps: {
  cwd: string;
  save: (input: { prompt: string; name?: string; cwd: string }) => Promise<Routine>;
}): ToolDef<z.infer<typeof RoutineToolInput>> {
  return {
    name: "create_routine",
    description:
      "Save a scheduled or on-demand routine that will later run in its own session. " +
      "Put BOTH the timing and the task in `prompt`, in natural language — e.g. " +
      "'Every weekday at 9am, pull main and run the tests, summarize failures'. " +
      "The schedule is parsed from the prompt automatically; if no time is given the " +
      "routine is saved as manual (run on demand). Routines are managed in Settings.",
    schema: RoutineToolInput,
    readOnly: false,
    kind: "other",
    summarize: (i) => `Create routine: ${i.name ?? i.prompt.slice(0, 40)}`,
    async execute(input) {
      const routine = await deps.save({
        prompt: input.prompt,
        name: input.name,
        cwd: input.cwd ?? deps.cwd,
      });
      return {
        ok: true,
        output:
          `Saved routine "${routine.name}" — ${describeSchedule(routine.schedule)}. ` +
          `Manage it in Settings → Routines.`,
      };
    },
  };
}

function describeSchedule(s: RoutineSchedule): string {
  switch (s.kind) {
    case "interval":
      return `runs every ${s.minutes} min`;
    case "daily":
      return `runs daily at ${s.time}`;
    case "weekly":
      return `runs weekly on day ${s.weekday} at ${s.time}`;
    case "once":
      return `runs once at ${new Date(s.at).toLocaleString()}`;
    case "manual":
      return "no time found — run it on demand from Settings";
  }
}
