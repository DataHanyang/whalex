import { describe, expect, it } from "vitest";
import type { Routine } from "@whalex/shared";
import type { ToolContext } from "@whalex/core";
import { createRoutineTools, type RoutineToolDeps } from "../src/main/routineTool.js";

function routine(over: Partial<Routine> = {}): Routine {
  return {
    id: "r1",
    name: "Morning tests",
    prompt: "Every day at 09:00, run the tests",
    cwd: "C:/work",
    schedule: { kind: "daily", time: "09:00" },
    permissionMode: "acceptEdits",
    enabled: true,
    ...over,
  };
}

// The tools only touch deps — an in-memory store keeps the tests free of
// Electron, settings files, and the schedule-parsing model call.
function harness(initial: Routine[]) {
  let routines = [...initial];
  const calls: string[] = [];
  const deps: RoutineToolDeps = {
    cwd: "C:/work",
    save: async (input) => {
      calls.push(`save:${input.id ?? "new"}`);
      const existing = routines.find((r) => r.id === input.id);
      const saved = routine({
        ...(existing ?? {}),
        id: input.id ?? "new-id",
        name: input.name ?? existing?.name ?? "Auto",
        prompt: input.prompt,
        cwd: input.cwd,
      });
      routines = existing
        ? routines.map((r) => (r.id === saved.id ? saved : r))
        : [...routines, saved];
      return saved;
    },
    list: () => routines,
    remove: (id) => {
      calls.push(`remove:${id}`);
      routines = routines.filter((r) => r.id !== id);
    },
    setEnabled: (id, enabled) => {
      calls.push(`setEnabled:${id}:${enabled}`);
      routines = routines.map((r) => (r.id === id ? { ...r, enabled } : r));
    },
  };
  const tools = Object.fromEntries(createRoutineTools(deps).map((t) => [t.name, t]));
  const run = (name: string, input: unknown) =>
    tools[name]!.execute(input as never, {} as ToolContext);
  return { run, calls, get: () => routines };
}

describe("routine tools", () => {
  it("registers all four management tools", () => {
    const names = createRoutineTools(harnessDeps()).map((t) => t.name);
    expect(names).toEqual(["create_routine", "list_routines", "update_routine", "delete_routine"]);
  });

  it("list_routines shows id, schedule, and paused state", async () => {
    const h = harness([routine(), routine({ id: "r2", name: "Backup", enabled: false })]);
    const res = await h.run("list_routines", {});
    expect(res.ok).toBe(true);
    expect(res.output).toContain("id: r1");
    expect(res.output).toContain("runs daily at 09:00");
    expect(res.output).toContain("(paused)");
  });

  it("delete_routine removes by id", async () => {
    const h = harness([routine()]);
    const res = await h.run("delete_routine", { id: "r1" });
    expect(res.ok).toBe(true);
    expect(h.get()).toHaveLength(0);
  });

  it("delete_routine resolves a unique name case-insensitively", async () => {
    const h = harness([routine()]);
    const res = await h.run("delete_routine", { id: "morning tests" });
    expect(res.ok).toBe(true);
    expect(h.get()).toHaveLength(0);
  });

  it("delete_routine fails clearly on an unknown ref and on ambiguous names", async () => {
    const twins = [routine(), routine({ id: "r2" })];
    const h = harness(twins);
    const missing = await h.run("delete_routine", { id: "nope" });
    expect(missing.ok).toBe(false);
    expect(missing.output).toContain("list_routines");
    const ambiguous = await h.run("delete_routine", { id: "Morning tests" });
    expect(ambiguous.ok).toBe(false);
    expect(h.get()).toHaveLength(2);
  });

  it("update_routine with only enabled toggles without re-saving", async () => {
    const h = harness([routine()]);
    const res = await h.run("update_routine", { id: "r1", enabled: false });
    expect(res.ok).toBe(true);
    expect(h.calls).toEqual(["setEnabled:r1:false"]);
    expect(h.get()[0]!.enabled).toBe(false);
  });

  it("update_routine with a new prompt re-saves through the schedule parser", async () => {
    const h = harness([routine()]);
    const res = await h.run("update_routine", { id: "r1", prompt: "Every hour, ping the server" });
    expect(res.ok).toBe(true);
    expect(h.calls).toEqual(["save:r1"]);
    expect(h.get()[0]!.prompt).toBe("Every hour, ping the server");
  });

  it("update_routine with nothing to change is an error, not a silent no-op", async () => {
    const h = harness([routine()]);
    const res = await h.run("update_routine", { id: "r1" });
    expect(res.ok).toBe(false);
    expect(h.calls).toEqual([]);
  });
});

function harnessDeps(): RoutineToolDeps {
  return {
    cwd: "C:/work",
    save: async () => routine(),
    list: () => [],
    remove: () => {},
    setEnabled: () => {},
  };
}
