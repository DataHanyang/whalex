import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// RoutineManager reaches for Electron only to raise a toast; the scheduler
// itself is plain logic and should be testable without a desktop.
vi.mock("electron", () => ({
  Notification: { isSupported: () => false },
  app: { getLocale: () => "en" },
}));

const { RoutineManager } = await import("../src/main/RoutineManager.js");
import type { Routine, Settings } from "@whalex/shared";
import type { AgentHost } from "../src/main/AgentHost.js";
import type { SettingsManager } from "../src/main/settings.js";

const TICK = 30_000;

function routine(over: Partial<Routine> = {}): Routine {
  return {
    id: "r1",
    name: "Nightly",
    prompt: "check the build",
    cwd: "C:/work/ledger",
    schedule: { kind: "interval", minutes: 60 },
    permissionMode: "acceptEdits",
    enabled: true,
    ...over,
  };
}

/** Settings + host stubs that record what the scheduler did. */
function harness(routines: Routine[]) {
  let state = { routines, defaultModel: "deepseek-v4-flash" } as unknown as Settings;
  const runs: Routine[] = [];
  let running = false;
  let fail = false;

  const settings = {
    get: () => state,
    update: (patch: Partial<Settings>) => {
      state = { ...state, ...patch };
      return state;
    },
  } as unknown as SettingsManager;

  const host = {
    runRoutine: async (r: Routine) => {
      if (fail) throw new Error("cwd is gone");
      runs.push(r);
      return { sessionId: `s${runs.length}` };
    },
    isSessionRunning: () => running,
  } as unknown as AgentHost;

  return {
    manager: new RoutineManager(settings, host),
    runs,
    current: () => state.routines[0]!,
    setRunning: (v: boolean) => (running = v),
    setFail: (v: boolean) => (fail = v),
  };
}

/** Advances the clock and lets the scheduler's own interval fire. */
async function elapse(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
  // A Wednesday, mid-afternoon — well past a 09:00 slot.
  vi.setSystemTime(new Date(2026, 7, 19, 14, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("interval routines", () => {
  it("starts the clock on first sighting instead of firing", async () => {
    const h = harness([routine({ schedule: { kind: "interval", minutes: 60 } })]);
    h.manager.start();
    await elapse(TICK);
    expect(h.runs).toHaveLength(0);
    expect(h.current().lastRunAt).toBe(Date.now());
    h.manager.stop();
  });

  it("fires once the interval has passed, and not before", async () => {
    const h = harness([routine({ schedule: { kind: "interval", minutes: 60 } })]);
    h.manager.start();
    await elapse(TICK); // clock starts
    await elapse(59 * 60_000);
    expect(h.runs).toHaveLength(0);
    await elapse(2 * 60_000);
    expect(h.runs).toHaveLength(1);
    h.manager.stop();
  });
});

describe("daily routines", () => {
  it("does not fire the moment it is saved, when today's time already passed", async () => {
    // Saved at 14:00 for 09:00. The user asked for tomorrow morning, not now.
    const h = harness([routine({ schedule: { kind: "daily", time: "09:00" } })]);
    h.manager.start();
    await elapse(TICK);
    expect(h.runs).toHaveLength(0);
    h.manager.stop();
  });

  it("fires when the time arrives, and only once that day", async () => {
    vi.setSystemTime(new Date(2026, 7, 19, 8, 55, 0));
    const h = harness([routine({ schedule: { kind: "daily", time: "09:00" } })]);
    h.manager.start();
    await elapse(TICK); // 08:55 — not yet
    expect(h.runs).toHaveLength(0);

    await elapse(10 * 60_000); // past 09:00
    expect(h.runs).toHaveLength(1);

    await elapse(6 * 60 * 60_000); // rest of the day
    expect(h.runs).toHaveLength(1);
    h.manager.stop();
  });

  it("fires again the next day", async () => {
    vi.setSystemTime(new Date(2026, 7, 19, 8, 59, 0));
    const h = harness([routine({ schedule: { kind: "daily", time: "09:00" } })]);
    h.manager.start();
    await elapse(5 * 60_000);
    expect(h.runs).toHaveLength(1);
    await elapse(24 * 60 * 60_000);
    expect(h.runs).toHaveLength(2);
    h.manager.stop();
  });
});

describe("weekly routines", () => {
  it("ignores every day but the one it was set for", async () => {
    // System time is Wednesday (3); ask for Friday (5) at 09:00.
    vi.setSystemTime(new Date(2026, 7, 19, 8, 59, 0));
    const h = harness([routine({ schedule: { kind: "weekly", weekday: 5, time: "09:00" } })]);
    h.manager.start();
    await elapse(10 * 60_000); // Wednesday 09:09 — wrong day
    expect(h.runs).toHaveLength(0);

    await elapse(2 * 24 * 60 * 60_000); // roll to Friday
    expect(h.runs).toHaveLength(1);
    h.manager.stop();
  });
});

describe("one-shot routines", () => {
  it("fires at its moment and switches itself off", async () => {
    const at = Date.now() + 5 * 60_000;
    const h = harness([routine({ schedule: { kind: "once", at } })]);
    h.manager.start();
    await elapse(TICK);
    expect(h.runs).toHaveLength(0);

    await elapse(6 * 60_000);
    expect(h.runs).toHaveLength(1);
    expect(h.current().enabled).toBe(false);

    await elapse(60 * 60_000);
    expect(h.runs).toHaveLength(1);
    h.manager.stop();
  });
});

describe("manual routines", () => {
  it("never fires on a tick", async () => {
    const h = harness([routine({ schedule: { kind: "manual" } })]);
    h.manager.start();
    await elapse(10 * 60 * 60_000);
    expect(h.runs).toHaveLength(0);
    h.manager.stop();
  });

  it("runs on demand, schedule and enabled flag aside", async () => {
    const h = harness([routine({ schedule: { kind: "manual" }, enabled: false })]);
    expect(await h.manager.runNow("r1")).toEqual({ ok: true });
    expect(h.runs).toHaveLength(1);
  });

  it("reports an unknown id rather than throwing", async () => {
    const h = harness([routine()]);
    const res = await h.manager.runNow("nope");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not found/i);
  });
});

describe("guards", () => {
  it("skips disabled routines", async () => {
    const h = harness([
      routine({ schedule: { kind: "once", at: Date.now() - 1000 }, enabled: false }),
    ]);
    h.manager.start();
    await elapse(TICK);
    expect(h.runs).toHaveLength(0);
    h.manager.stop();
  });

  it("will not start a second run while the first is still going", async () => {
    const h = harness([routine({ schedule: { kind: "interval", minutes: 10 } })]);
    h.manager.start();
    await elapse(TICK); // clock starts
    await elapse(11 * 60_000);
    expect(h.runs).toHaveLength(1);

    // The run takes half an hour — three intervals come and go untouched.
    h.setRunning(true);
    await elapse(30 * 60_000);
    expect(h.runs).toHaveLength(1);

    h.setRunning(false);
    await elapse(TICK);
    expect(h.runs).toHaveLength(2);
    h.manager.stop();
  });

  it("refuses a manual run that would overlap", async () => {
    const h = harness([routine({ schedule: { kind: "manual" } })]);
    await h.manager.runNow("r1");
    h.setRunning(true);
    const res = await h.manager.runNow("r1");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/already running/i);
  });

  it("keeps scheduling after a run throws, without retrying every tick", async () => {
    const h = harness([routine({ schedule: { kind: "interval", minutes: 10 } })]);
    h.setFail(true);
    h.manager.start();
    await elapse(TICK);
    await elapse(11 * 60_000);
    expect(h.runs).toHaveLength(0);
    // The failed attempt still bumped lastRunAt, so the next tick stays quiet.
    const after = h.current().lastRunAt;
    await elapse(TICK);
    expect(h.current().lastRunAt).toBe(after);

    h.setFail(false);
    await elapse(11 * 60_000);
    expect(h.runs).toHaveLength(1);
    h.manager.stop();
  });

  it("stop() ends the polling", async () => {
    const h = harness([routine({ schedule: { kind: "interval", minutes: 10 } })]);
    h.manager.start();
    await elapse(TICK);
    h.manager.stop();
    await elapse(60 * 60_000);
    expect(h.runs).toHaveLength(0);
  });
});
