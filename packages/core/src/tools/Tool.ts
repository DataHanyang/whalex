import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { PermissionKind, Todo } from "@whalex/shared";
import type { ToolSpec } from "../providers/Provider.js";

export interface ToolContext {
  cwd: string;
  sessionId: string;
  signal: AbortSignal;
  setTodos(todos: Todo[]): void;
}

export interface ToolResult {
  ok: boolean;
  /** Text returned to the model (and shown collapsed in the UI). */
  output: string;
  /** Present when the tool changed a file — drives the DiffView. */
  diff?: { path: string; oldText: string; newText: string };
}

export interface ToolDef<TIn = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<TIn>;
  readOnly: boolean;
  kind: PermissionKind;
  /** One-line humanized summary for permission prompts and tool cards. */
  summarize(input: TIn, cwd: string): string;
  /**
   * The string permission rules match against: the command for execute,
   * the relative path for file tools. Undefined → only bare-name rules match.
   */
  ruleArg?(input: TIn, cwd: string): string;
  /** Computes the would-be diff before approval, so the prompt can show it. */
  prepare?(input: TIn, ctx: ToolContext): Promise<{ diff?: ToolResult["diff"] }>;
  execute(input: TIn, ctx: ToolContext): Promise<ToolResult>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDef<never>>();

  register(tool: ToolDef<never>): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDef<never> | undefined {
    return this.tools.get(name);
  }

  /**
   * Specs sent to the API. Iteration order is registration order and must
   * stay stable across requests — DeepSeek's context caching keys on it.
   */
  specs(): ToolSpec[] {
    return [...this.tools.values()].map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: zodToJsonSchema(t.schema, { $refStrategy: "none" }) as Record<
          string,
          unknown
        >,
      },
    }));
  }
}

export function toolError(message: string): ToolResult {
  return { ok: false, output: message };
}

/** Head+tail truncation so huge outputs don't blow the context window. */
export function truncateOutput(text: string, maxChars = 30_000): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.7));
  const tail = text.slice(-Math.floor(maxChars * 0.25));
  const omitted = text.length - head.length - tail.length;
  return `${head}\n\n... [${omitted} characters truncated] ...\n\n${tail}`;
}
