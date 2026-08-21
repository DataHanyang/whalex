import { z } from "zod";
import type { Routine, RoutineSchedule } from "@whalex/shared";
import type { ToolDef } from "@whalex/core";

const CreateInput = z.object({
  prompt: z
    .string()
    .describe("What the routine should do, INCLUDING when to run it, in natural language."),
  name: z.string().optional().describe("Optional short title; auto-derived if omitted."),
  cwd: z.string().optional().describe("Working folder; defaults to the current session's folder."),
});

const ListInput = z.object({});

const UpdateInput = z.object({
  id: z.string().describe("Routine id (preferred) or its exact name, from list_routines."),
  prompt: z
    .string()
    .optional()
    .describe(
      "New full prompt (task + timing in natural language). Replaces the old prompt and " +
        "re-parses the schedule from it.",
    ),
  name: z.string().optional().describe("New title."),
  enabled: z.boolean().optional().describe("Pause (false) or resume (true) the routine."),
});

const DeleteInput = z.object({
  id: z.string().describe("Routine id (preferred) or its exact name, from list_routines."),
});

export interface RoutineToolDeps {
  cwd: string;
  save: (input: { id?: string; prompt: string; name?: string; cwd: string }) => Promise<Routine>;
  list: () => Routine[];
  remove: (id: string) => void;
  setEnabled: (id: string, enabled: boolean) => void;
}

/**
 * Full routine management from chat: create, list, update, delete. Routines
 * are stored in the `routines` array of ~/.whalex/settings.json and also
 * manageable in Settings → Routines. Schedule extraction happens in
 * saveRoutine (the model reads the prompt).
 */
export function createRoutineTools(deps: RoutineToolDeps): ToolDef<never>[] {
  const create: ToolDef<z.infer<typeof CreateInput>> = {
    name: "create_routine",
    description:
      "Save a scheduled or on-demand routine that will later run in its own session. " +
      "Put BOTH the timing and the task in `prompt`, in natural language — e.g. " +
      "'Every weekday at 9am, pull main and run the tests, summarize failures'. " +
      "The schedule is parsed from the prompt automatically; if no time is given the " +
      "routine is saved as manual (run on demand). To change or remove routines later, " +
      "use list_routines / update_routine / delete_routine.",
    schema: CreateInput,
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
          `Saved routine "${routine.name}" (id ${routine.id}) — ` +
          `${describeSchedule(routine.schedule)}.`,
      };
    },
  };

  const list: ToolDef<z.infer<typeof ListInput>> = {
    name: "list_routines",
    description:
      "List every saved routine with its id, schedule, enabled state, folder, and prompt. " +
      "Call this first when the user asks to change, pause, run, or delete a routine — " +
      "update_routine and delete_routine need the id from here.",
    schema: ListInput,
    readOnly: true,
    kind: "other",
    summarize: () => "List routines",
    async execute() {
      const routines = deps.list();
      if (!routines.length) return { ok: true, output: "No routines saved." };
      const lines = routines.map(
        (r) =>
          `- id: ${r.id}\n  name: ${r.name}\n  schedule: ${describeSchedule(r.schedule)}` +
          `${r.enabled ? "" : " (paused)"}\n  cwd: ${r.cwd}\n  prompt: ${oneLine(r.prompt, 160)}`,
      );
      return { ok: true, output: lines.join("\n") };
    },
  };

  const update: ToolDef<z.infer<typeof UpdateInput>> = {
    name: "update_routine",
    description:
      "Update a saved routine: change its prompt (which re-parses the schedule from the new " +
      "text), rename it, or pause/resume it with `enabled`. Get the id from list_routines. " +
      "To reschedule a routine, pass a new `prompt` containing the new timing.",
    schema: UpdateInput,
    readOnly: false,
    kind: "other",
    summarize: (i) => `Update routine: ${i.id}`,
    async execute(input) {
      const found = resolve(deps.list(), input.id);
      if ("error" in found) return { ok: false, output: found.error };
      const routine = found.routine;
      if (input.prompt !== undefined || input.name !== undefined) {
        const saved = await deps.save({
          id: routine.id,
          prompt: input.prompt ?? routine.prompt,
          name: input.name ?? routine.name,
          cwd: routine.cwd,
        });
        if (input.enabled !== undefined) deps.setEnabled(saved.id, input.enabled);
        return {
          ok: true,
          output:
            `Updated routine "${saved.name}" — ${describeSchedule(saved.schedule)}` +
            `${input.enabled === false ? " (paused)" : ""}.`,
        };
      }
      if (input.enabled === undefined) {
        return { ok: false, output: "Nothing to change: pass prompt, name, and/or enabled." };
      }
      deps.setEnabled(routine.id, input.enabled);
      return {
        ok: true,
        output: `Routine "${routine.name}" is now ${input.enabled ? "enabled" : "paused"}.`,
      };
    },
  };

  const del: ToolDef<z.infer<typeof DeleteInput>> = {
    name: "delete_routine",
    description:
      "Permanently delete a saved routine. Get the id from list_routines first. " +
      "To merely stop it from running while keeping it, use update_routine with enabled=false.",
    schema: DeleteInput,
    readOnly: false,
    kind: "other",
    summarize: (i) => `Delete routine: ${i.id}`,
    async execute(input) {
      const found = resolve(deps.list(), input.id);
      if ("error" in found) return { ok: false, output: found.error };
      deps.remove(found.routine.id);
      return { ok: true, output: `Deleted routine "${found.routine.name}".` };
    },
  };

  return [create, list, update, del] as ToolDef<never>[];
}

/** Accepts an id or an exact (case-insensitive) unique name. */
function resolve(routines: Routine[], ref: string): { routine: Routine } | { error: string } {
  const byId = routines.find((r) => r.id === ref);
  if (byId) return { routine: byId };
  const byName = routines.filter((r) => r.name.toLowerCase() === ref.trim().toLowerCase());
  if (byName.length === 1) return { routine: byName[0]! };
  if (byName.length > 1) {
    return { error: `Multiple routines named "${ref}" — use the id from list_routines.` };
  }
  return { error: `No routine matches "${ref}". Call list_routines to see what exists.` };
}

function oneLine(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
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
      return "manual — runs on demand only";
  }
}
