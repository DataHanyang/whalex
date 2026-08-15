import { randomUUID } from "node:crypto";
import { jsonrepair } from "jsonrepair";
import type { AgentEvent, ModelInfo, Todo } from "@whalex/shared";
import { ProviderError, type ProviderClient } from "../providers/Provider.js";
import type { ToolContext, ToolRegistry, ToolResult } from "../tools/Tool.js";
import type { PermissionEngine } from "../permissions/PermissionEngine.js";
import type { SessionStore } from "../session/SessionStore.js";
import { ContextManager } from "./ContextManager.js";
import { ToolCallAssembler } from "./ToolCallAssembler.js";
import { buildSystemPrompt } from "./SystemPrompt.js";
import { compactSession } from "./Compactor.js";

const MAX_ROUNDS = 60;
export const ARTIFACT_MARKER = "WHALEX_ARTIFACT:";

export interface AgentLoopOptions {
  provider: ProviderClient;
  registry: ToolRegistry;
  permissions: PermissionEngine;
  session: SessionStore;
  modelInfo: ModelInfo;
  temperature: number;
  /** Optional extra system-prompt text (subagent role, skills catalog). */
  extraSystemPrompt?: string;
  /** Live extra tools (MCP servers), fetched each turn so reconnects appear. */
  extraTools?: () => import("../tools/Tool.js").ToolDef<never>[];
}

interface CallOutcome {
  result: ToolResult;
  parsedArgs: unknown;
  durationMs: number;
  denied: boolean;
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
  private controller: AbortController | null = null;
  private systemPrompt: string | null = null;
  private running = false;

  constructor(private opts: AgentLoopOptions) {
    this.context = new ContextManager(opts.modelInfo);
  }

  get isRunning(): boolean {
    return this.running;
  }

  setModel(modelInfo: ModelInfo): void {
    this.opts.modelInfo = modelInfo;
    this.context.setModel(modelInfo);
  }

  abort(): void {
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

  async *run(userText: string): AsyncGenerator<AgentEvent> {
    if (this.running) throw new Error("Agent is already running for this session.");
    this.running = true;
    this.controller = new AbortController();
    const signal = this.controller.signal;
    const session = this.opts.session;

    try {
      if (this.systemPrompt === null) {
        const base = await buildSystemPrompt(session.cwd);
        this.systemPrompt = this.opts.extraSystemPrompt
          ? `${base}\n\n${this.opts.extraSystemPrompt}`
          : base;
      }
      session.append({ type: "user", id: randomUUID(), text: userText, ts: Date.now() });
      this.context.addPending(userText);
      yield { type: "status", state: "thinking" };

      for (let round = 0; round < MAX_ROUNDS; round++) {
        const messageId = randomUUID();
        yield { type: "message-start", messageId };

        const assembler = new ToolCallAssembler();
        let streamedText = false;
        try {
          const stream = this.opts.provider.streamChat({
            model: this.opts.modelInfo.id,
            messages: [
              { role: "system", content: this.systemPrompt },
              ...session.messages(),
            ],
            tools: this.opts.modelInfo.supportsTools ? this.toolSpecs() : undefined,
            temperature: this.opts.temperature,
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
          yield {
            type: "done",
            stopReason: turn.finishReason === "length" ? "length" : "stop",
          };
          return;
        }

        yield { type: "status", state: "tool" };
        for (const call of turn.toolCalls) {
          const outcome = yield* this.executeCall(call, signal);
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

  private async *executeCall(
    call: { id: string; name: string; argsJson: string },
    signal: AbortSignal,
  ): AsyncGenerator<AgentEvent, CallOutcome> {
    const started = Date.now();
    const session = this.opts.session;
    const tool = this.lookupTool(call.name);

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

    yield { type: "tool-start", toolCallId: call.id, toolName: call.name, args: rawArgs };

    const fail = (output: string, denied = false): CallOutcome => ({
      result: { ok: false, output },
      parsedArgs: rawArgs,
      durationMs: Date.now() - started,
      denied,
    });

    if (!tool) return fail(`Unknown tool: ${call.name}`);
    if (parseError) return fail(parseError);

    const parsed = tool.schema.safeParse(rawArgs);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      return fail(
        `Invalid arguments for ${call.name}: ${issues}. Fix the arguments and call the tool again.`,
      );
    }
    rawArgs = parsed.data;

    const todosRef: { current: Todo[] | null } = { current: null };
    const ctx: ToolContext = {
      cwd: session.cwd,
      sessionId: session.sessionId,
      signal,
      setTodos: (todos) => {
        todosRef.current = todos;
      },
    };

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
    if (decision.behavior === "deny") {
      return fail(decision.reason, true);
    }
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

    let result: ToolResult;
    try {
      result = await tool.execute(parsed.data as never, ctx);
    } catch (err) {
      result = {
        ok: false,
        output: `Tool failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
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
  if (!output.startsWith(ARTIFACT_MARKER)) return null;
  try {
    return JSON.parse(output.slice(ARTIFACT_MARKER.length)) as ExtractedArtifact;
  } catch {
    return null;
  }
}
