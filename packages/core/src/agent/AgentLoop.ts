import { randomUUID } from "node:crypto";
import { jsonrepair } from "jsonrepair";
import type { AgentEvent, ModelInfo, Todo } from "@whalex/shared";
import { ProviderError, type ProviderClient } from "../providers/Provider.js";
import type { ToolContext, ToolDef, ToolRegistry, ToolResult } from "../tools/Tool.js";
import type { PermissionEngine } from "../permissions/PermissionEngine.js";
import type { SessionStore } from "../session/SessionStore.js";
import { ContextManager } from "./ContextManager.js";
import { ToolCallAssembler } from "./ToolCallAssembler.js";
import { buildSystemPrompt } from "./SystemPrompt.js";
import { compactSession } from "./Compactor.js";
import { NOOP_HOOKS, type HookRunner } from "./Hooks.js";

const MAX_ROUNDS = 60;
/** Retries granted when a turn is cut off by the output cap mid-tool-call. */
const MAX_TRUNCATION_RETRIES = 3;
export const ARTIFACT_MARKER = "WHALEX_ARTIFACT:";

export interface AgentLoopOptions {
  provider: ProviderClient;
  registry: ToolRegistry;
  permissions: PermissionEngine;
  session: SessionStore;
  modelInfo: ModelInfo;
  temperature: number;
  /** Thinking budget hint; only sent for models that advertise reasoning. */
  reasoningEffort?: string;
  /** Optional extra system-prompt text (subagent role, skills catalog). */
  extraSystemPrompt?: string;
  /** Live extra tools (MCP servers), fetched each turn so reconnects appear. */
  extraTools?: () => import("../tools/Tool.js").ToolDef<never>[];
  /** User lifecycle hooks (PreToolUse can block). Defaults to no-op. */
  hooks?: HookRunner;
}

interface CallOutcome {
  result: ToolResult;
  parsedArgs: unknown;
  durationMs: number;
  denied: boolean;
  todos?: Todo[] | null;
}

interface ParsedCall {
  call: { id: string; name: string; argsJson: string };
  rawArgs: unknown;
  parseError: string | null;
}

/**
 * The agent turn loop: stream a completion, execute any tool calls
 * (sequentially — edits and shell commands are order-dependent), append
 * results, and loop until the model stops asking for tools.
 *
 * Everything user-visible is yielded as AgentEvents in real time; in
 * particular a permission-request is yielded *before* the loop blocks on the
 * user's answer, so the host can show the approval UI.
 */
export class AgentLoop {
  readonly context: ContextManager;
  /** Pending ask_user questions: id → resolve(answer). */
  private questions = new Map<string, (answer: string) => void>();

  /** Host calls this when the user answers a question card. */
  answerQuestion(id: string, answer: string): boolean {
    const r = this.questions.get(id);
    if (!r) return false;
    this.questions.delete(id);
    r(answer);
    return true;
  }
  private controller: AbortController | null = null;
  private systemPrompt: string | null = null;
  private running = false;
  private goalStop = false;

  constructor(private opts: AgentLoopOptions) {
    this.context = new ContextManager(opts.modelInfo);
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Messages typed while the loop is running; injected before the next round. */
  private steerQueue: string[] = [];

  steer(text: string): void {
    this.steerQueue.push(text);
  }

  /** Extra protocol section (e.g. SuperCode) appended to the system prompt. */
  private protocolPrompt: string | null = null;

  setProtocolPrompt(text: string | null): void {
    if (text !== this.protocolPrompt) {
      this.protocolPrompt = text;
      this.systemPrompt = null; // rebuild on next run
    }
  }

  /** Live-apply settings changes; the next completion picks them up. */
  updateTuning(t: { reasoningEffort?: string; temperature?: number }): void {
    if (t.reasoningEffort !== undefined)
      (this.opts as { reasoningEffort?: string }).reasoningEffort = t.reasoningEffort;
    if (t.temperature !== undefined) this.opts.temperature = t.temperature;
  }

  setModel(modelInfo: ModelInfo): void {
    this.opts.modelInfo = modelInfo;
    this.context.setModel(modelInfo);
  }

  abort(): void {
    this.goalStop = true;
    this.controller?.abort();
    this.opts.permissions.abortPending();
  }

  /** Manual /compact — summarize and shrink the context on demand. */
  async manualCompact(): Promise<{ ok: boolean; beforePct: number; afterPct: number; error?: string }> {
    const before = this.context.contextPct();
    const controller = new AbortController();
    const res = await compactSession(
      this.opts.provider,
      this.opts.session,
      this.opts.modelInfo.id,
      controller.signal,
    );
    if (res.ok) this.context.reset();
    return { ok: res.ok, beforePct: before, afterPct: this.context.contextPct(), error: res.error };
  }

  /**
   * Goal mode (Codex-style): run toward a goal autonomously, self-evaluating
   * completion after each turn and continuing until done, a max iteration
   * count, or an abort. Each iteration is a full agent turn on the same
   * session, so context and files carry over.
   */
  async *runGoal(goal: string, maxIterations = 12): AsyncGenerator<AgentEvent> {
    this.goalStop = false;
    let prompt =
      `다음 목표를 스스로 달성해줘. 완료될 때까지 필요한 모든 단계를 수행하고, ` +
      `각 단계 결과를 확인해가며 진행해.\n\n목표: ${goal}`;
    for (let i = 0; i < maxIterations; i++) {
      yield* this.run(prompt);
      if (this.goalStop) return;

      const check = await this.evaluateGoal(goal);
      yield {
        type: "goal-update",
        iteration: i + 1,
        maxIterations,
        done: check.done,
        remaining: check.remaining,
      };
      if (check.done) return;
      prompt =
        `아직 목표가 완료되지 않았어. 남은 작업을 이어서 진행해줘.\n\n목표: ${goal}\n남은 것: ${check.remaining}`;
    }
  }

  /** Asks the model to judge goal completion. Returns {done, remaining}. */
  private async evaluateGoal(goal: string): Promise<{ done: boolean; remaining: string }> {
    const controller = new AbortController();
    let text = "";
    try {
      for await (const delta of this.opts.provider.streamChat({
        model: this.opts.modelInfo.id,
        messages: [
          { role: "system", content: "You judge whether a coding goal is fully complete." },
          {
            role: "user",
            content:
              `목표: ${goal}\n\n지금까지의 작업 요약:\n${this.recentWork()}\n\n` +
              `이 목표가 완전히 달성되었는지 판단해줘. JSON만 출력: {"done": true/false, "remaining": "남은 작업 한 줄"}`,
          },
        ],
        temperature: 0,
        maxTokens: 300,
        signal: controller.signal,
      })) {
        if (delta.type === "text") text += delta.text;
      }
    } catch {
      return { done: false, remaining: "평가 실패" };
    }
    try {
      const m = /\{[\s\S]*\}/.exec(text);
      const parsed = JSON.parse(m ? m[0] : text) as { done?: boolean; remaining?: string };
      return { done: !!parsed.done, remaining: parsed.remaining ?? "" };
    } catch {
      return { done: /done|완료|끝/i.test(text), remaining: text.slice(0, 200) };
    }
  }

  private recentWork(): string {
    const recs = this.opts.session.effectiveRecords().slice(-16);
    return recs
      .map((r) => {
        if (r.type === "assistant" && r.text) return `A: ${r.text.slice(0, 300)}`;
        if (r.type === "tool_result") return `T(${r.toolName}): ${r.ok ? "ok" : "fail"} ${r.output.slice(0, 120)}`;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  private async ensureSystemPrompt(cwd: string): Promise<string> {
    if (this.systemPrompt !== null) return this.systemPrompt;
    const base = await buildSystemPrompt(cwd);
    const parts = [base];
    if (this.opts.extraSystemPrompt) parts.push(this.opts.extraSystemPrompt);
    if (this.protocolPrompt) parts.push(this.protocolPrompt);
    this.systemPrompt = parts.join("\n\n");
    return this.systemPrompt;
  }

  private drainSteerQueue(session: AgentLoopOptions["session"]): void {
    while (this.steerQueue.length > 0) {
      const text = this.steerQueue.shift()!;
      session.append({ type: "user", id: randomUUID(), text, ts: Date.now() });
      this.context.addPending(text);
    }
  }

  async *run(userText: string): AsyncGenerator<AgentEvent> {
    if (this.running) throw new Error("Agent is already running for this session.");
    this.running = true;
    this.controller = new AbortController();
    const signal = this.controller.signal;
    const session = this.opts.session;

    try {
      await this.ensureSystemPrompt(session.cwd);
      session.append({ type: "user", id: randomUUID(), text: userText, ts: Date.now() });
      this.context.addPending(userText);
      await this.hooks().run({
        event: "UserPromptSubmit",
        sessionId: session.sessionId,
        cwd: session.cwd,
        userText,
      });
      yield { type: "status", state: "thinking" };

      let truncationRetries = 0;
      for (let round = 0; round < MAX_ROUNDS; round++) {
        // A live protocol/SuperCode toggle invalidates the prompt mid-turn;
        // rebuild before the next completion instead of streaming null.
        const systemPrompt = await this.ensureSystemPrompt(session.cwd);
        this.drainSteerQueue(session);
        const messageId = randomUUID();
        yield { type: "message-start", messageId };

        const assembler = new ToolCallAssembler();
        let streamedText = false;
        try {
          const stream = this.opts.provider.streamChat({
            model: this.opts.modelInfo.id,
            messages: [
              { role: "system", content: systemPrompt },
              ...session.messages(),
            ],
            tools: this.opts.modelInfo.supportsTools ? this.toolSpecs() : undefined,
            temperature: this.opts.temperature,
            reasoningEffort:
              this.opts.modelInfo.supportsReasoning && this.opts.reasoningEffort !== "none"
                ? this.opts.reasoningEffort
                : undefined,
            maxTokens: this.opts.modelInfo.maxOutput,
            signal,
          });
          for await (const delta of stream) {
            assembler.push(delta);
            if (delta.type === "text") {
              if (!streamedText) {
                streamedText = true;
                yield { type: "status", state: "streaming" };
              }
              yield { type: "text-delta", messageId, delta: delta.text };
            } else if (delta.type === "reasoning") {
              yield { type: "reasoning-delta", messageId, delta: delta.text };
            }
          }
        } catch (err) {
          const partial = assembler.result();
          if (partial.text || partial.reasoning) {
            session.append({
              type: "assistant",
              id: messageId,
              text: partial.text,
              reasoning: partial.reasoning,
              toolCalls: [],
              interrupted: true,
              ts: Date.now(),
            });
          }
          const pe =
            err instanceof ProviderError
              ? err
              : new ProviderError("unknown", err instanceof Error ? err.message : String(err));
          if (pe.code === "aborted") {
            yield { type: "done", stopReason: "aborted" };
          } else {
            yield {
              type: "error",
              code: pe.code,
              message: pe.message,
              retryAfterMs: pe.retryAfterMs,
            };
            yield { type: "done", stopReason: "error" };
          }
          return;
        }

        const turn = assembler.result();
        this.context.recordUsage(turn.usage);
        session.append({
          type: "assistant",
          id: messageId,
          text: turn.text,
          reasoning: turn.reasoning,
          toolCalls: turn.toolCalls,
          ts: Date.now(),
        });
        yield { type: "usage", usage: this.context.snapshot() };

        if (turn.toolCalls.length === 0) {
          // Hitting the output cap mid-tool-call leaves the arguments JSON
          // truncated, so the assembler yields no usable calls and the turn
          // would otherwise end silently with nothing written. Tell the model
          // what happened and let it retry with smaller writes.
          if (turn.finishReason === "length" && truncationRetries < MAX_TRUNCATION_RETRIES) {
            truncationRetries += 1;
            session.append({
              type: "user",
              id: randomUUID(),
              text:
                "[system] Your previous response was cut off because it hit the " +
                "output token limit before completing a tool call, so nothing was " +
                "written. Do not repeat the whole thing in one shot. Instead write " +
                "the file in several smaller steps: create it with write_file " +
                "containing the first portion, then append the remaining portions " +
                "with additional edit_file calls.",
              ts: Date.now(),
            });
            yield { type: "status", state: "thinking" };
            continue;
          }
          if (this.steerQueue.length > 0) {
            // The user typed while the model was finishing — treat it as the
            // next prompt of the same run instead of stopping.
            this.drainSteerQueue(session);
            yield { type: "status", state: "thinking" };
            continue;
          }
          yield {
            type: "done",
            stopReason: turn.finishReason === "length" ? "length" : "stop",
          };
          return;
        }

        yield { type: "status", state: "tool" };

        // Parse args + show every tool card up front, then run read-only tools
        // (read/glob/grep/skill/present) concurrently — they need no approval
        // and don't mutate, so a batch of file reads no longer serializes.
        // Mutating tools still run in order, each with its permission gate.
        const parsedCalls = turn.toolCalls.map((call) => this.parseCallArgs(call));
        for (const pc of parsedCalls) {
          yield {
            type: "tool-start",
            toolCallId: pc.call.id,
            toolName: pc.call.name,
            args: pc.rawArgs,
          };
        }
        const inflight = new Map<string, Promise<CallOutcome>>();
        for (const pc of parsedCalls) {
          const tool = this.lookupTool(pc.call.name);
          if (tool && tool.readOnly && !pc.parseError) {
            inflight.set(pc.call.id, this.runReadOnlyBody(pc.call, tool, pc.rawArgs, signal));
          }
        }

        for (const pc of parsedCalls) {
          const call = pc.call;
          let outcome: CallOutcome;
          const pre = inflight.get(call.id);
          if (pre) {
            outcome = await pre;
            if (outcome.todos) {
              yield { type: "todo-update", todos: outcome.todos };
              session.append({ type: "todos", todos: outcome.todos, ts: Date.now() });
            }
          } else {
            outcome = yield* this.finishCall(pc, signal);
          }

          const artifact = extractArtifact(outcome.result.output);
          // The marker is an internal transport; the model just needs "shown".
          const modelOutput = artifact
            ? `Displayed "${artifact.title}" in the preview panel.`
            : outcome.result.output;
          session.append({
            type: "tool_result",
            toolCallId: call.id,
            toolName: call.name,
            args: outcome.parsedArgs,
            ok: outcome.result.ok,
            denied: outcome.denied,
            output: modelOutput,
            durationMs: outcome.durationMs,
            diff: outcome.result.diff,
            ts: Date.now(),
          });
          this.context.addPending(modelOutput);
          yield {
            type: "tool-result",
            toolCallId: call.id,
            ok: outcome.result.ok,
            output: modelOutput,
            durationMs: outcome.durationMs,
          };
          if (outcome.result.diff) {
            yield { type: "file-edit", toolCallId: call.id, ...outcome.result.diff };
          }
          if (artifact) {
            session.append({
              type: "artifact",
              artifactId: artifact.artifactId,
              title: artifact.title,
              artifactKind: artifact.kind,
              ts: Date.now(),
            });
            yield {
              type: "artifact",
              artifactId: artifact.artifactId,
              title: artifact.title,
              kind: artifact.kind,
              path: artifact.path,
              content: artifact.content,
              language: artifact.language,
            };
          }
          if (signal.aborted) {
            yield { type: "done", stopReason: "aborted" };
            return;
          }
        }

        if (this.context.needsCompaction()) {
          const before = this.context.contextPct();
          yield { type: "status", state: "thinking" };
          const res = await compactSession(
            this.opts.provider,
            session,
            this.opts.modelInfo.id,
            signal,
          );
          if (res.ok) {
            this.context.reset();
            yield { type: "compaction", beforePct: before, afterPct: this.context.contextPct() };
          }
        }
        yield { type: "status", state: "thinking" };
      }

      yield {
        type: "error",
        code: "unknown",
        message: `Stopped after ${MAX_ROUNDS} tool rounds without completing.`,
      };
      yield { type: "done", stopReason: "error" };
    } finally {
      this.running = false;
      this.controller = null;
      await this.hooks()
        .run({ event: "Stop", sessionId: session.sessionId, cwd: session.cwd })
        .catch(() => {});
    }
  }

  private toolSpecs() {
    const specs = this.opts.registry.specs();
    const extra = this.opts.extraTools?.() ?? [];
    for (const t of extra) {
      specs.push({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.rawParameters ?? { type: "object", properties: {} },
        },
      });
    }
    return specs;
  }

  private lookupTool(name: string) {
    return this.opts.registry.get(name) ?? this.opts.extraTools?.().find((t) => t.name === name);
  }

  private parseCallArgs(call: { id: string; name: string; argsJson: string }): ParsedCall {
    let rawArgs: unknown = {};
    let parseError: string | null = null;
    const argsJson = call.argsJson.trim() || "{}";
    try {
      rawArgs = JSON.parse(argsJson);
    } catch {
      try {
        rawArgs = JSON.parse(jsonrepair(argsJson));
      } catch {
        parseError = `Could not parse tool arguments as JSON: ${argsJson.slice(0, 200)}`;
      }
    }
    return { call, rawArgs, parseError };
  }

  private hooks(): HookRunner {
    return this.opts.hooks ?? NOOP_HOOKS;
  }

  /** PreToolUse gate. Returns a block reason, or null to proceed. */
  private async preToolBlock(toolName: string, args: unknown): Promise<string | null> {
    const out = await this.hooks().run({
      event: "PreToolUse",
      sessionId: this.opts.session.sessionId,
      cwd: this.opts.session.cwd,
      toolName,
      args,
    });
    return out.block ? (out.message ?? "Blocked by a PreToolUse hook.") : null;
  }

  private async postToolHook(toolName: string, args: unknown, result: ToolResult): Promise<void> {
    await this.hooks().run({
      event: "PostToolUse",
      sessionId: this.opts.session.sessionId,
      cwd: this.opts.session.cwd,
      toolName,
      args,
      result: { ok: result.ok, output: result.output },
    });
  }

  private makeCtx(signal: AbortSignal, todosRef: { current: Todo[] | null }): ToolContext {
    return {
      cwd: this.opts.session.cwd,
      sessionId: this.opts.session.sessionId,
      signal,
      setTodos: (todos) => {
        todosRef.current = todos;
      },
    };
  }

  /**
   * Fast path for read-only tools: no permission gate, no diff prepare. Runs
   * concurrently with sibling read-only calls in the same batch.
   */
  private async runReadOnlyBody(
    call: { id: string; name: string; argsJson: string },
    tool: ToolDef<never>,
    rawArgs: unknown,
    signal: AbortSignal,
  ): Promise<CallOutcome> {
    const started = Date.now();
    const parsed = tool.schema.safeParse(rawArgs);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      return {
        result: {
          ok: false,
          output: `Invalid arguments for ${call.name}: ${issues}. Fix the arguments and call the tool again.`,
        },
        parsedArgs: rawArgs,
        durationMs: Date.now() - started,
        denied: false,
      };
    }
    const blocked = await this.preToolBlock(call.name, parsed.data);
    if (blocked) {
      return {
        result: { ok: false, output: blocked },
        parsedArgs: parsed.data,
        durationMs: Date.now() - started,
        denied: true,
      };
    }
    const todosRef: { current: Todo[] | null } = { current: null };
    let result: ToolResult;
    try {
      result = await tool.execute(parsed.data as never, this.makeCtx(signal, todosRef));
    } catch (err) {
      result = { ok: false, output: `Tool failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    await this.postToolHook(call.name, parsed.data, result);
    return {
      result,
      parsedArgs: parsed.data,
      durationMs: Date.now() - started,
      denied: false,
      todos: todosRef.current,
    };
  }

  /**
   * Full path for mutating tools: validate → diff prepare → permission gate →
   * execute. tool-start is emitted by the caller before this runs.
   */
  private async *finishCall(pc: ParsedCall, signal: AbortSignal): AsyncGenerator<AgentEvent, CallOutcome> {
    const started = Date.now();
    const session = this.opts.session;
    const { call, rawArgs, parseError } = pc;
    const tool = this.lookupTool(call.name);

    const fail = (output: string, denied = false): CallOutcome => ({
      result: { ok: false, output },
      parsedArgs: rawArgs,
      durationMs: Date.now() - started,
      denied,
    });

    if (!tool) return fail(`Unknown tool: ${call.name}`);
    if (parseError) return fail(parseError);

    // ask_user pauses the turn on the user, exactly like a permission request:
    // yield the card, block on the answer, and hand the choice back as the
    // tool result. Aborting the turn resolves every pending question.
    if (call.name === "ask_user") {
      const q = rawArgs as {
        questions?: Array<{
          question?: string;
          options?: Array<{ label: string; description?: string }>;
          multi_select?: boolean;
        }>;
      };
      const request = {
        id: call.id,
        questions: (q.questions ?? []).map((item) => ({
          question: item.question ?? "",
          options: item.options ?? [],
          multiSelect: !!item.multi_select,
        })),
        allowOther: true,
      };
      yield { type: "question-request", request };
      const answer = await new Promise<string>((resolve) => {
        this.questions.set(call.id, resolve);
        signal.addEventListener("abort", () => this.answerQuestion(call.id, "(no answer — turn aborted)"), { once: true });
      });
      return {
        result: { ok: true, output: `User answered: ${answer}` },
        parsedArgs: rawArgs,
        durationMs: Date.now() - started,
        denied: false,
      };
    }


    const parsed = tool.schema.safeParse(rawArgs);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      return fail(
        `Invalid arguments for ${call.name}: ${issues}. Fix the arguments and call the tool again.`,
      );
    }

    const todosRef: { current: Todo[] | null } = { current: null };
    const ctx = this.makeCtx(signal, todosRef);

    let diff: ToolResult["diff"];
    if (tool.prepare) {
      try {
        diff = (await tool.prepare(parsed.data as never, ctx)).diff;
      } catch {
        // prepare is best-effort (used to show a diff in the approval card)
      }
    }

    const decision = this.opts.permissions.check(
      tool,
      parsed.data,
      ctx,
      session.sessionId,
      call.id,
      diff,
    );
    if (decision.behavior === "deny") return fail(decision.reason, true);
    if (decision.behavior === "ask") {
      yield { type: "permission-request", request: decision.request };
      const response = await decision.response;
      yield {
        type: "permission-resolved",
        requestId: decision.request.id,
        behavior: response.behavior,
      };
      if (response.behavior === "deny") {
        return fail(
          response.message
            ? `The user denied this action: ${response.message}`
            : "The user denied this action. Adjust your approach instead of retrying the same call.",
          true,
        );
      }
    }

    const blocked = await this.preToolBlock(call.name, parsed.data);
    if (blocked) return fail(blocked, true);

    let result: ToolResult;
    try {
      result = await tool.execute(parsed.data as never, ctx);
    } catch (err) {
      result = {
        ok: false,
        output: `Tool failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    await this.postToolHook(call.name, parsed.data, result);
    if (todosRef.current) {
      yield { type: "todo-update", todos: todosRef.current };
      session.append({ type: "todos", todos: todosRef.current, ts: Date.now() });
    }
    return {
      result,
      parsedArgs: parsed.data,
      durationMs: Date.now() - started,
      denied: false,
    };
  }
}

interface ExtractedArtifact {
  artifactId: string;
  title: string;
  kind: "html" | "markdown" | "svg" | "mermaid" | "image" | "code" | "url";
  path?: string;
  content?: string;
  language?: string;
}

function extractArtifact(output: string): ExtractedArtifact | null {
  if (typeof output !== "string" || !output.startsWith(ARTIFACT_MARKER)) return null;
  try {
    return JSON.parse(output.slice(ARTIFACT_MARKER.length)) as ExtractedArtifact;
  } catch {
    return null;
  }
}
