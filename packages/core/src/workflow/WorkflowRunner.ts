import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ModelInfo, WorkflowState, WorkflowAgent } from "@whalex/shared";
import type { ProviderClient } from "../providers/Provider.js";
import type { PermissionEngine } from "../permissions/PermissionEngine.js";
import { createBuiltinRegistry, type ToolDef } from "../tools/index.js";
import { SessionStore } from "../session/SessionStore.js";
import { AgentLoop } from "../agent/AgentLoop.js";

export interface WorkflowDeps {
  provider: ProviderClient;
  permissions: PermissionEngine;
  modelInfo: ModelInfo;
  temperature: number;
  /** Passed through so sub-agents think as hard as the main session. */
  reasoningEffort?: string;
  cwd: string;
  extraTools?: () => ToolDef<never>[];
  maxAgents: number;
  concurrency: number;
  onUpdate: (state: WorkflowState) => void;
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
  private running = 0;
  private queue: Array<() => void> = [];

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
    this.state.state = "running";
    this.emit();
    const api = this.makeApi();
    try {
      // The script body runs in an async function with only the injected
      // hooks in scope. No require/import/process/globalThis passthrough.
      const fn = new Function(
        "agent",
        "parallel",
        "pipeline",
        "phase",
        "log",
        `"use strict"; return (async () => { ${script}\n })();`,
      );
      const result = await fn(api.agent, api.parallel, api.pipeline, api.phase, api.log);
      this.state.state = this.deps.signal.aborted ? "aborted" : "done";
      this.emit();
      return { ok: true, result: typeof result === "string" ? result : JSON.stringify(result, null, 2) };
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
    const agent = (prompt: string, opts: { schema?: unknown; label?: string; phase?: string } = {}) =>
      self.runAgent(prompt, opts);
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
    if (this.agentCount >= this.deps.maxAgents) {
      throw new Error(`Workflow hit the agent cap (${this.deps.maxAgents}).`);
    }
    this.agentCount++;
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

    await this.acquireSlot();
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
        registry: createBuiltinRegistry({ readOnlyOnly: true, includePresent: false }),
        permissions: this.deps.permissions,
        session,
        modelInfo: this.deps.modelInfo,
        temperature: this.deps.temperature,
        reasoningEffort: this.deps.reasoningEffort,
        extraSystemPrompt:
          "# Workflow agent\nYou are one agent in a larger orchestrated workflow. Do your assigned task using read-only tools and end with a concise, self-contained result." +
          schemaHint,
      });
      let text = "";
      for await (const ev of loop.run(prompt)) {
        if (this.deps.signal.aborted) {
          loop.abort();
          break;
        }
        if (ev.type === "text-delta") text += ev.delta;
      }
      const usage = loop.context.snapshot();
      record.tokens = usage.outputTokens;
      record.durationMs = Date.now() - started;
      record.state = "done";
      this.state.totalTokens += usage.inputTokens + usage.outputTokens;
      this.state.costUsd += usage.costUsd;
      this.emit();

      if (opts.schema !== undefined) {
        return parseJsonLoose(text);
      }
      return text.trim();
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
      "synthesized result as a string. Use this for thorough reviews, broad research, " +
      "or large parallelizable tasks.",
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
      return { ok: true, output: res.result };
    },
  };
}
