import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ModelInfo, PermissionRequest, WorkflowState, WorkflowAgent } from "@whalex/shared";
import type { ProviderClient } from "../providers/Provider.js";
import type { PermissionEngine } from "../permissions/PermissionEngine.js";
import { createBuiltinRegistry, type ToolDef } from "../tools/index.js";
import { SessionStore } from "../session/SessionStore.js";
import { AgentLoop } from "../agent/AgentLoop.js";
import { runWorkflowScript } from "./ScriptHost.js";

export interface WorkflowDeps {
  provider: ProviderClient;
  permissions: PermissionEngine;
  modelInfo: ModelInfo;
  temperature: number;
  /** Passed through so sub-agents think as hard as the main session. */
  reasoningEffort?: string;
  /** Uncensored mode: fleet agents inherit the parent's directness prompt. */
  uncensoredMode?: boolean;
  cwd: string;
  extraTools?: () => ToolDef<never>[];
  maxAgents: number;
  concurrency: number;
  /**
   * Session-scoped result cache keyed by (prompt, schema). A model that
   * rewrites a failed script and reruns the workflow gets its already-
   * completed agents back instantly instead of paying for them again.
   */
  cache?: Map<string, unknown>;
  onUpdate: (state: WorkflowState) => void;
  /**
   * Fleet agents get the shell (execute) tool. Every command still passes
   * the shared PermissionEngine; pair with onPermissionAsk so "ask" verdicts
   * reach a human instead of auto-denying.
   */
  fleetShell?: boolean;
  /**
   * Forward a fleet agent's permission "ask" to the host UI. The host shows
   * the normal approval card; the shared engine resolves it. When absent,
   * asks are auto-denied (fleet agents have no UI of their own).
   */
  onPermissionAsk?: (request: PermissionRequest) => void;
  signal: AbortSignal;
}

/**
 * SuperCode workflow engine. Runs a restricted JS orchestration script in a
 * sandbox with injected hooks (agent/parallel/pipeline/phase/log). The script
 * has no filesystem or Node access — it can only call the hooks — so a model
 * can author it safely. agent() spawns a nested read-capable AgentLoop and
 * returns its text (or a schema-validated object).
 */
export class WorkflowRunner {
  private state: WorkflowState;
  private agentCount = 0;
  /** Promises of agents the script spawned; awaited even if it forgot to. */
  private inflight = new Set<Promise<unknown>>();
  private running = 0;
  private queue: Array<() => void> = [];
  /** File edits made by fleet agents, surfaced to the parent for rewind. */
  private fileEdits: Array<{ path: string; oldText: string; newText: string }> = [];

  /** File changes the fleet made (empty until the workflow has run). */
  get edits(): ReadonlyArray<{ path: string; oldText: string; newText: string }> {
    return this.fileEdits;
  }

  constructor(
    private deps: WorkflowDeps,
    name: string,
  ) {
    this.state = {
      workflowId: randomUUID(),
      name,
      state: "planning",
      phases: [],
      agents: [],
      totalTokens: 0,
      costUsd: 0,
      log: [],
    };
  }

  get workflowId(): string {
    return this.state.workflowId;
  }

  async run(script: string): Promise<{ ok: boolean; result: string; error?: string }> {
    const escape = detectSandboxEscape(script);
    if (escape) {
      this.state.state = "error";
      this.emit();
      return {
        ok: false,
        result: "",
        error:
          `Workflow script rejected: it references "${escape}", which could reach ` +
          `Node/filesystem APIs and bypass the permission gate. Use only the ` +
          `injected hooks (agent/parallel/pipeline/phase/log) and plain data.`,
      };
    }
    this.state.state = "running";
    this.emit();
    const api = this.makeApi();
    try {
      // The script runs in a separate locked-down Node process (see
      // ScriptHost): even a sandbox escape lands in a child that has no
      // parent memory, no Electron, and — where the runtime supports the
      // permission model — no filesystem or child_process either. The DSL
      // hooks round-trip over IPC to here, where fleet agents' tool calls
      // still route through the PermissionEngine. detectSandboxEscape()
      // above stays as static defense-in-depth.
      const outcome = await runWorkflowScript(script, {
        agent: (prompt, opts) =>
          api.agent(prompt, opts as { schema?: unknown; label?: string; phase?: string }),
        phase: api.phase,
        log: api.log,
        warn: api.log,
        signal: this.deps.signal,
      });
      // A script that forgot to await its fan-out would otherwise return with
      // agents still running and an empty result; wait for them to settle.
      while (this.inflight.size > 0) {
        await Promise.allSettled([...this.inflight]);
      }
      this.state.state = this.deps.signal.aborted ? "aborted" : "done";
      this.emit();
      const result = outcome.hasValue ? outcome.value : undefined;
      // A script with no return statement must still yield a string result —
      // JSON.stringify(undefined) is undefined and would crash the caller.
      const text =
        typeof result === "string"
          ? result
          : result === undefined
            ? `Workflow completed: ${this.state.agents.length} agents ran (${this.state.agents.filter((a) => a.state === "done").length} done).`
            : JSON.stringify(result, null, 2);
      return { ok: true, result: text };
    } catch (err) {
      this.state.state = "error";
      this.emit();
      return {
        ok: false,
        result: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private makeApi() {
    const self = this;
    const phase = (title: string): void => {
      if (!self.state.phases.includes(title)) {
        self.state.phases.push(title);
        self.emit();
      }
    };
    const log = (message: string): void => {
      self.state.log.push(message);
      if (self.state.log.length > 200) self.state.log.shift();
      self.emit();
    };
    const agent = (
      prompt: string,
      opts: { schema?: unknown; label?: string; phase?: string } = {},
    ): Promise<unknown> => {
      const p = self.runAgent(prompt, opts);
      self.inflight.add(p);
      void p.catch(() => {}).finally(() => self.inflight.delete(p));
      return p;
    };
    const parallel = (thunks: Array<() => Promise<unknown>>): Promise<unknown[]> =>
      Promise.all(
        thunks.map((t) =>
          Promise.resolve()
            .then(t)
            .catch(() => null),
        ),
      );
    const pipeline = async (
      items: unknown[],
      ...stages: Array<(prev: unknown, item: unknown, i: number) => Promise<unknown>>
    ): Promise<unknown[]> =>
      Promise.all(
        items.map(async (item, i) => {
          let value: unknown = item;
          try {
            for (const stage of stages) value = await stage(value, item, i);
            return value;
          } catch {
            return null;
          }
        }),
      );
    return { agent, parallel, pipeline, phase, log };
  }

  private async acquireSlot(): Promise<void> {
    if (this.running < this.deps.concurrency) {
      this.running++;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.running++;
  }

  private releaseSlot(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }

  private async runAgent(
    prompt: string,
    opts: { schema?: unknown; label?: string; phase?: string },
  ): Promise<unknown> {
    if (this.deps.signal.aborted) throw new Error("Workflow aborted.");
    // Serve cached results before spending an agent-cap slot: a rerun of a
    // fixed script should return its completed agents for free, not fail on
    // the cap because cache hits consumed it.
    const cacheKey = JSON.stringify([prompt, opts.schema ?? null]);
    const cached = this.deps.cache?.get(cacheKey);
    const record: WorkflowAgent = {
      id: randomUUID(),
      label: opts.label ?? prompt.slice(0, 40),
      phase: opts.phase ?? this.state.phases[this.state.phases.length - 1] ?? "",
      state: "pending",
      tokens: 0,
      durationMs: 0,
    };
    this.state.agents.push(record);
    this.emit();

    if (cached !== undefined) {
      record.state = "done";
      this.emit();
      return cached;
    }

    if (this.agentCount >= this.deps.maxAgents) {
      record.state = "error";
      this.emit();
      throw new Error(`Workflow hit the agent cap (${this.deps.maxAgents}).`);
    }
    this.agentCount++;

    await this.acquireSlot();
    // A script queued behind the concurrency limit may have been aborted while
    // it waited — don't burn a full agent run on a slot acquired post-abort.
    if (this.deps.signal.aborted) {
      this.releaseSlot();
      record.state = "error";
      this.emit();
      throw new Error("Workflow aborted.");
    }
    record.state = "running";
    this.emit();
    const started = Date.now();

    try {
      const schemaHint =
        opts.schema !== undefined
          ? `\n\nReturn ONLY a JSON object matching this schema (no prose, no markdown fences):\n${JSON.stringify(opts.schema)}`
          : "";
      const session = SessionStore.createEphemeral(this.deps.cwd);
      const loop = new AgentLoop({
        provider: this.deps.provider,
        // Fleet agents read and write files — and, when fleetShell is on,
        // run shell commands. Every call still goes through the shared
        // PermissionEngine (plan mode keeps them read-only; "ask" verdicts
        // are forwarded to the host UI or denied, below).
        registry: createBuiltinRegistry({
          workerTools: true,
          includePresent: false,
          workerShell: this.deps.fleetShell,
        }),
        permissions: this.deps.permissions,
        session,
        modelInfo: this.deps.modelInfo,
        temperature: this.deps.temperature,
        reasoningEffort: this.deps.reasoningEffort,
        uncensoredMode: this.deps.uncensoredMode,
        extraSystemPrompt:
          "# Workflow agent\nYou are one agent in a larger orchestrated workflow. Do exactly your assigned task — read what you need, write only the files your task names" +
          (this.deps.fleetShell
            ? ", run only the commands your task requires (e.g. the tests for the module you touched)"
            : "") +
          " — and end with a concise, self-contained result." +
          schemaHint,
      });
      let text = "";
      for await (const ev of loop.run(prompt)) {
        if (this.deps.signal.aborted) {
          loop.abort();
          break;
        }
        if (ev.type === "text-delta") text += ev.delta;
        else if (ev.type === "file-edit") {
          this.fileEdits.push({ path: ev.path, oldText: ev.oldText, newText: ev.newText });
        }
        // Fleet agents have no UI surface of their own. When the host wires
        // onPermissionAsk, the request is forwarded to the session's normal
        // approval card and the shared engine resolves it (this is what makes
        // fleet shell usable outside bypass mode). Otherwise deny with a
        // reason the agent can act on.
        else if (ev.type === "permission-request") {
          if (this.deps.onPermissionAsk) {
            this.deps.onPermissionAsk(ev.request);
          } else {
            this.deps.permissions.resolve({
              id: ev.request.id,
              behavior: "deny",
              scope: "once",
              message:
                "Workflow agents cannot wait for interactive approval. Report what you would have written instead.",
            });
          }
        }
      }
      const usage = loop.context.snapshot();
      record.tokens = usage.outputTokens;
      record.durationMs = Date.now() - started;
      record.state = "done";
      this.state.totalTokens += usage.inputTokens + usage.outputTokens;
      this.state.costUsd += usage.costUsd;
      this.emit();

      const value = opts.schema !== undefined ? parseJsonLoose(text) : text.trim();
      this.deps.cache?.set(cacheKey, value);
      return value;
    } catch (err) {
      record.state = "error";
      record.durationMs = Date.now() - started;
      this.emit();
      throw err;
    } finally {
      this.releaseSlot();
    }
  }

  private emit(): void {
    this.deps.onUpdate(structuredClone(this.state));
  }
}

/**
 * Static rejection of the escape hatches a workflow script could use to reach
 * Node/filesystem APIs and sidestep the permission gate — the ones the code
 * review demonstrated: `(0,eval)(…)`, `({}).constructor.constructor(…)`,
 * `await import("node:fs")`, `process`/`require`/`globalThis`. Not a complete
 * sandbox (string-obfuscated access can still evade a substring scan), but it
 * blocks every escape a model would plausibly emit, and it's paired with the
 * PermissionEngine gate on the agents' own tool calls. Returns the offending
 * token, or null if the script looks clean.
 */
export function detectSandboxEscape(script: string): string | null {
  const banned = [
    "require",
    "process",
    "globalThis",
    "constructor",
    "__proto__",
    "eval",
    "Function",
    "Reflect",
    "Proxy",
    "import.meta",
    "Buffer",
  ];
  // Match as whole identifiers so e.g. a variable named `constructorName`
  // doesn't trip it, but `.constructor` does.
  for (const token of banned) {
    const re = new RegExp(`(^|[^\\w.$])${token.replace(".", "\\.")}\\b|\\.${token}\\b`);
    if (re.test(script)) return token;
  }
  // Dynamic import(): keyword form `import(` or `import (`.
  if (/\bimport\s*\(/.test(script)) return "import()";
  return null;
}

function parseJsonLoose(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1]! : text;
  const start = candidate.search(/[[{]/);
  const slice = start >= 0 ? candidate.slice(start) : candidate;
  try {
    return JSON.parse(slice);
  } catch {
    return { _raw: text.trim() };
  }
}

/**
 * The `workflow` tool (SuperCode). The model authors an orchestration script;
 * the runner executes it. Only exposed when SuperCode mode is on.
 */
export function createWorkflowTool(
  makeRunner: (name: string) => WorkflowRunner,
  registerWorkflow: (workflowId: string, name: string) => void,
): ToolDef<{ name: string; script: string }> {
  return {
    name: "workflow",
    description:
      "SuperCode: run a multi-agent orchestration script. Provide a JS script " +
      "body that uses the injected async hooks — agent(prompt, {schema,label,phase}), " +
      "parallel([...thunks]), pipeline(items, ...stages), phase(title), log(msg) — " +
      "to fan out work across many subagents and synthesize their results. " +
      "The script has no filesystem/Node access; only the hooks. Return the final " +
      "synthesized result as a string. " +
      "SuperCode exists to push quality and speed to the limit through scale — " +
      "size the fleet to the task, not to token thrift. A serious task should " +
      "decompose into MANY small, sharply-scoped agents (dozens is normal, " +
      "hundreds is fine for big jobs): one agent per file, per module, per test " +
      "case, per review dimension, per design alternative. Compose the proven " +
      "patterns: (1) understand — parallel readers over every relevant area, " +
      "then a synthesis agent builds the map; (2) design — N independent " +
      "approaches from different angles, a judge panel scores them, synthesize " +
      "the winner; (3) implement — decompose into independent units, one agent " +
      "each in parallel, then an integration agent merges; (4) review/verify — " +
      "finders per dimension, then EVERY finding gets its own adversarial " +
      "verifier agents (majority vote kills false positives); (5) loop-until-dry " +
      "— keep spawning finder rounds until two consecutive rounds surface " +
      "nothing new. Give each agent ONE tiny job with full context in its " +
      "prompt, use {schema} for structured returns, and never do serially what " +
      "can fan out in parallel. Efficiency rules: results of identical " +
      "agent(prompt, schema) calls are cached for the session, so if a script " +
      "fails partway, fix it and rerun — completed agents return instantly " +
      "and only the missing work runs. Never hand-parse JSON from agent text " +
      "(it may contain markdown fences); pass {schema} instead. Keep " +
      "judge/synthesis prompts compact: pass summaries, not full transcripts.",
    schema: z.object({
      name: z.string().describe("Short workflow name shown in the progress panel"),
      script: z.string().describe("The orchestration script body (JS, uses the injected hooks)"),
    }),
    readOnly: false,
    kind: "other",
    summarize: (i) => `SuperCode workflow: ${i.name}`,
    async execute(input) {
      const runner = makeRunner(input.name);
      registerWorkflow(runner.workflowId, input.name);
      const res = await runner.run(input.script);
      if (!res.ok) return { ok: false, output: `Workflow error: ${res.error}` };
      return { ok: true, output: res.result, extraDiffs: [...runner.edits] };
    },
  };
}
