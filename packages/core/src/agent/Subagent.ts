import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ModelInfo } from "@whalex/shared";
import type { ProviderClient } from "../providers/Provider.js";
import type { PermissionEngine } from "../permissions/PermissionEngine.js";
import { createBuiltinRegistry, type ToolDef } from "../tools/index.js";
import { SessionStore } from "../session/SessionStore.js";
import { AgentLoop } from "./AgentLoop.js";

export const AGENT_TYPES = {
  general: {
    description: "General-purpose agent for multi-step tasks and research.",
    readOnlyOnly: false,
  },
  explore: {
    description: "Read-only agent for searching and understanding code (no edits or commands).",
    readOnlyOnly: true,
  },
  plan: {
    description: "Designs an implementation plan without making changes (read-only).",
    readOnlyOnly: true,
  },
} as const;

export type AgentType = keyof typeof AGENT_TYPES;

export interface SubagentDeps {
  provider: ProviderClient;
  permissions: PermissionEngine;
  modelInfo: ModelInfo;
  temperature: number;
  /** Passed through so sub-agents think as hard as the main session. */
  reasoningEffort?: string;
  cwd: string;
  /** Agent types the user disabled — the tool won't offer them. */
  disabledTypes?: string[];
  /** MCP tools, shared with the parent so subagents can use them too. */
  extraTools?: () => ToolDef<never>[];
  /** Streams subagent progress up to the parent UI. */
  onProgress?: (update: {
    agentRunId: string;
    state: "running" | "done" | "error";
    toolCount: number;
    lastActivity: string;
    tokens: number;
  }) => void;
}

/**
 * The `agent` tool: spawns a nested AgentLoop with its own context window and
 * session, runs it to completion, and returns its final text as the tool
 * result. Recursion is one level deep — subagents don't get the agent tool.
 */
export function createAgentTool(deps: SubagentDeps): ToolDef<{
  agent_type: AgentType;
  description: string;
  prompt: string;
}> {
  const disabled = new Set(deps.disabledTypes ?? []);
  const enabledTypes = (Object.keys(AGENT_TYPES) as AgentType[]).filter((k) => !disabled.has(k));
  const typeList = enabledTypes
    .map((k) => `"${k}" (${AGENT_TYPES[k].description})`)
    .join(", ");
  return {
    name: "agent",
    description:
      "Delegate a self-contained task to a subagent with its own context. " +
      "Use it to parallelize research, explore large codebases, or offload " +
      `heavy multi-step work. agent_type is one of: ${typeList}. ` +
      "The subagent returns its final summary as the result.",
    schema: z.object({
      agent_type: z.enum(["general", "explore", "plan"]),
      description: z.string().describe("A 3-5 word label for this task"),
      prompt: z.string().describe("The full task for the subagent — it has no other context"),
    }),
    readOnly: false,
    kind: "other",
    summarize: (i) => `Subagent (${i.agent_type}): ${i.description}`,
    async execute(input, ctx) {
      if (disabled.has(input.agent_type)) {
        return { ok: false, output: `Agent type "${input.agent_type}" is disabled. Available: ${typeList}` };
      }
      const typeInfo = AGENT_TYPES[input.agent_type];
      const registry = createBuiltinRegistry({
        readOnlyOnly: typeInfo.readOnlyOnly,
        includePresent: false,
      });
      const session = SessionStore.createEphemeral(deps.cwd);
      const loop = new AgentLoop({
        provider: deps.provider,
        registry,
        permissions: deps.permissions,
        session,
        modelInfo: deps.modelInfo,
        temperature: deps.temperature,
        reasoningEffort: deps.reasoningEffort,
        extraTools: typeInfo.readOnlyOnly ? undefined : deps.extraTools,
        extraSystemPrompt: `# Subagent role
You are a ${input.agent_type} subagent. Complete the delegated task autonomously and end with a concise summary of what you found or did — that summary is your entire return value to the calling agent. You cannot ask the user questions.`,
      });

      const agentRunId = randomUUID();
      let toolCount = 0;
      let finalText = "";
      const started = Date.now();
      try {
        for await (const ev of loop.run(input.prompt)) {
          if (ctx.signal.aborted) {
            loop.abort();
            break;
          }
          if (ev.type === "tool-start") {
            toolCount++;
            deps.onProgress?.({
              agentRunId,
              state: "running",
              toolCount,
              lastActivity: ev.toolName,
              tokens: loop.context.snapshot().outputTokens,
            });
          } else if (ev.type === "text-delta") {
            finalText += ev.delta;
          }
        }
      } catch (err) {
        return { ok: false, output: `Subagent failed: ${err instanceof Error ? err.message : String(err)}` };
      }
      const usage = loop.context.snapshot();
      deps.onProgress?.({
        agentRunId,
        state: "done",
        toolCount,
        lastActivity: "done",
        tokens: usage.outputTokens,
      });
      return {
        ok: true,
        output:
          `[Subagent ${input.agent_type} completed in ${((Date.now() - started) / 1000).toFixed(0)}s, ${toolCount} tools]\n\n` +
          (finalText.trim() || "(no output)"),
      };
    },
  };
}
