import { fork, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Runs a workflow orchestration script in a separate, locked-down Node
 * process. The script's only capabilities are the injected DSL hooks
 * (agent/parallel/pipeline/phase/log), which round-trip over IPC to the
 * parent — where every agent tool call still passes the PermissionEngine.
 *
 * Isolation layers (each independent of the others):
 * 1. Separate process — even a full sandbox escape cannot reach the parent's
 *    memory (API keys, sessions) or its Electron privileges.
 * 2. Node's permission model (--permission / --experimental-permission):
 *    filesystem, child_process, and worker access are denied at the runtime
 *    level. If the current Node build rejects the flag, the host retries
 *    without it and reports the downgrade so the caller can log it.
 * 3. The scripts are also statically screened before ever reaching this
 *    host (detectSandboxEscape) and run under "use strict" with the obvious
 *    globals shadowed.
 */

export interface ScriptHostHooks {
  agent(prompt: string, opts: Record<string, unknown>): Promise<unknown>;
  phase(title: string): void;
  log(message: string): void;
  /** Non-fatal downgrade notices (e.g. permission model unavailable). */
  warn(message: string): void;
  signal: AbortSignal;
}

export interface ScriptResult {
  hasValue: boolean;
  value: unknown;
}

/** The worker source. Kept dependency-free CJS so it runs from a temp file. */
const WORKER_JS = `"use strict";
const pending = new Map();
let nextId = 1;
function rpc(fn, args) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    process.send({ t: "call", id, fn, args });
  });
}
function notify(fn, args) {
  process.send({ t: "call", id: 0, fn, args });
}
process.on("message", (m) => {
  if (m.t === "ret") {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.value);
    else p.reject(new Error(m.error));
  } else if (m.t === "run") {
    const agent = (prompt, opts) => rpc("agent", [prompt, opts || {}]);
    const phase = (title) => notify("phase", [String(title)]);
    const log = (msg) => notify("log", [String(msg)]);
    const parallel = (thunks) =>
      Promise.all(thunks.map((t) => Promise.resolve().then(t).catch(() => null)));
    const pipeline = (items, ...stages) =>
      Promise.all(
        items.map(async (item, i) => {
          let value = item;
          try {
            for (const stage of stages) value = await stage(value, item, i);
            return value;
          } catch {
            return null;
          }
        }),
      );
    let fn;
    try {
      fn = new Function(
        "agent", "parallel", "pipeline", "phase", "log",
        "process", "require", "globalThis", "global",
        "module", "exports", "__dirname", "__filename",
        '"use strict"; return (async () => { ' + m.script + "\\n })();",
      );
    } catch (err) {
      process.send({ t: "done", ok: false, error: "Script syntax error: " + (err && err.message ? err.message : String(err)) });
      return;
    }
    fn(agent, parallel, pipeline, phase, log)
      .then((value) => {
        const hasValue = value !== undefined;
        process.send({ t: "done", ok: true, hasValue, value: hasValue ? value : null });
      })
      .catch((err) => {
        process.send({ t: "done", ok: false, error: err && err.message ? err.message : String(err) });
      });
  }
});
process.send({ t: "ready" });
`;

/** Permission-model flag for the running Node major (renamed in Node 22). */
function permissionExecArgv(workerPath: string): string[] {
  const major = Number(process.versions.node.split(".")[0]);
  const flag = major >= 22 ? "--permission" : "--experimental-permission";
  return [flag, `--allow-fs-read=${workerPath}`, "--max-old-space-size=512"];
}

export function runWorkflowScript(script: string, hooks: ScriptHostHooks): Promise<ScriptResult> {
  const workerPath = path.join(os.tmpdir(), `whalex-workflow-${randomUUID()}.cjs`);
  fs.writeFileSync(workerPath, WORKER_JS, "utf8");
  const cleanupFile = () => {
    try {
      fs.rmSync(workerPath, { force: true });
    } catch {
      // temp cleanup is best-effort
    }
  };

  const spawnWorker = (execArgv: string[]): Promise<{ child: ChildProcess; ready: boolean }> =>
    new Promise((resolve) => {
      const child = fork(workerPath, [], {
        execArgv,
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        env: { ELECTRON_RUN_AS_NODE: "1", PATH: process.env.PATH ?? "" },
      });
      let settled = false;
      const settle = (ready: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ child, ready });
      };
      // A worker that can't boot (unsupported flag, permission denial on its
      // own entry file) exits or errors without ever sending "ready".
      const timer = setTimeout(() => settle(false), 10_000);
      child.once("message", () => settle(true));
      child.once("error", () => settle(false));
      child.once("exit", () => settle(false));
    });

  return new Promise<ScriptResult>((resolve, reject) => {
    void (async () => {
      let child: ChildProcess;
      {
        const strict = await spawnWorker(permissionExecArgv(workerPath));
        if (strict.ready) {
          child = strict.child;
        } else {
          strict.child.kill();
          // This Node build doesn't speak the permission-model flags (or
          // denies the entry read). Process isolation still holds.
          hooks.warn(
            "Workflow sandbox: Node permission model unavailable — running with process isolation only.",
          );
          const loose = await spawnWorker([]);
          if (!loose.ready) {
            loose.child.kill();
            cleanupFile();
            reject(new Error("Workflow script host failed to start."));
            return;
          }
          child = loose.child;
        }
      }

      let done = false;
      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        hooks.signal.removeEventListener("abort", onAbort);
        cleanupFile();
        fn();
        // Kill after settling so a straggler exit event can't double-settle.
        try {
          child.kill();
        } catch {
          // already gone
        }
      };
      const onAbort = () => finish(() => reject(new Error("Workflow aborted.")));
      if (hooks.signal.aborted) {
        onAbort();
        return;
      }
      hooks.signal.addEventListener("abort", onAbort, { once: true });

      child.on("message", (raw: unknown) => {
        const m = raw as {
          t: string;
          id?: number;
          fn?: string;
          args?: unknown[];
          ok?: boolean;
          hasValue?: boolean;
          value?: unknown;
          error?: string;
        };
        if (m.t === "call") {
          const args = m.args ?? [];
          if (m.fn === "phase") hooks.phase(String(args[0] ?? ""));
          else if (m.fn === "log") hooks.log(String(args[0] ?? ""));
          else if (m.fn === "agent") {
            const id = m.id!;
            hooks
              .agent(String(args[0] ?? ""), (args[1] ?? {}) as Record<string, unknown>)
              .then(
                (value) => child.connected && child.send({ t: "ret", id, ok: true, value }),
                (err: unknown) =>
                  child.connected &&
                  child.send({
                    t: "ret",
                    id,
                    ok: false,
                    error: err instanceof Error ? err.message : String(err),
                  }),
              );
          }
        } else if (m.t === "done") {
          if (m.ok) {
            finish(() => resolve({ hasValue: m.hasValue ?? false, value: m.value }));
          } else {
            finish(() => reject(new Error(m.error ?? "Workflow script failed.")));
          }
        }
      });
      child.on("exit", (code) => {
        finish(() => reject(new Error(`Workflow script process exited unexpectedly (code ${code}).`)));
      });
      child.send({ t: "run", script });
    })();
  });
}
