import { randomUUID } from "node:crypto";
import type {
  PermissionRequest,
  PermissionResponse,
  PermissionRules,
} from "@whalex/shared";
import type { ToolDef, ToolContext } from "../tools/Tool.js";

export type PermissionDecision =
  | { behavior: "allow" }
  | { behavior: "deny"; reason: string }
  | { behavior: "ask"; request: PermissionRequest; response: Promise<PermissionResponse> };

/**
 * Patterns that stay ask-always even in bypassPermissions mode. Keep these
 * precise: e.g. matching bare "format" would false-positive on PowerShell's
 * ubiquitous Format-List/Format-Table.
 */
const HARD_DENY_ASK = [
  /rm\s+-rf?\s+[/~]/i,
  // PowerShell aliases: rm/ri = Remove-Item, rd/rmdir = Remove-Item -Recurse.
  // rm -r targeting a drive root (rm -r C:\) is as catastrophic as rm -rf /.
  /\brm\s+-[a-z]*r[a-z]*\s+["']?[a-z]:[\\/]/i,
  /remove-item\s+.*-recurse/i,
  /\bri\s+.*-recurse/i,
  /\b(rd|rmdir)\s+\/s\b/i,
  /\bformat-volume\b/i,
  /\bformat(\.com|\.exe)?\s+[a-z]:/i,
  /\bdiskpart\b/i,
  /\breg(\.exe)?\s+(add|delete)\b/i,
  /\bdel\s+\/[sq]/i,
];

function ruleToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchRule(rule: string, toolName: string, arg: string | undefined): boolean {
  // Tool names include MCP tools like mcp__context7__get-library-docs, which
  // carry digits and hyphens — a bare [a-zA-Z_]+ silently failed to parse them,
  // so "always allow" rules for MCP tools never matched and re-asked forever.
  const m = rule.match(/^([A-Za-z0-9_.-]+)(?:\((.*)\))?$/);
  if (!m) return false;
  const [, ruleTool, rulePattern] = m;
  if (ruleTool !== toolName) return false;
  if (rulePattern === undefined || rulePattern === "") return true;
  if (arg === undefined) return false;
  return ruleToRegex(rulePattern).test(arg.replace(/\\/g, "/"));
}

/**
 * Gates every tool call: deny rules → allow rules → mode default → ask the
 * user. UI-agnostic: when a call needs approval it returns an `ask` decision
 * carrying the request plus a promise; the host surfaces the request (IPC
 * dialog, CLI prompt) and calls resolve() with the user's answer.
 */
export class PermissionEngine {
  private pending = new Map<string, (res: PermissionResponse) => void>();
  private sessionAllow: string[] = [];

  constructor(
    private rules: PermissionRules,
    private hooks: {
      /** Persist an "always allow" rule into settings. */
      persistRule?: (rule: string) => void;
    } = {},
  ) {}

  setRules(rules: PermissionRules): void {
    this.rules = rules;
  }

  check(
    tool: ToolDef<never>,
    input: unknown,
    ctx: ToolContext,
    sessionId: string,
    toolCallId: string,
    diff?: { path: string; oldText: string; newText: string },
  ): PermissionDecision {
    const arg = tool.ruleArg?.(input as never, ctx.cwd);
    const summary = tool.summarize(input as never, ctx.cwd);

    for (const rule of this.rules.deny) {
      if (matchRule(rule, tool.name, arg)) {
        return { behavior: "deny", reason: `Blocked by deny rule: ${rule}` };
      }
    }

    const alwaysAsk =
      tool.kind === "execute" && arg !== undefined && HARD_DENY_ASK.some((re) => re.test(arg));

    if (!alwaysAsk) {
      for (const rule of [...this.rules.allow, ...this.sessionAllow]) {
        if (matchRule(rule, tool.name, arg)) return { behavior: "allow" };
      }

      switch (this.rules.mode) {
        case "bypassPermissions":
          return { behavior: "allow" };
        case "plan":
          if (tool.readOnly) return { behavior: "allow" };
          // SuperCode reconnaissance runs during plan mode: the workflow tool
          // itself only orchestrates — every tool call its agents make still
          // routes through this engine, so writes stay blocked.
          if (tool.name === "workflow") return { behavior: "allow" };
          return {
            behavior: "deny",
            reason: "Plan mode is active: only read-only tools are allowed.",
          };
        case "acceptEdits":
          if (tool.readOnly || tool.kind === "edit") return { behavior: "allow" };
          break;
        case "default":
          if (tool.readOnly) return { behavior: "allow" };
          break;
      }
    } else if (this.rules.mode === "plan") {
      return { behavior: "deny", reason: "Plan mode is active: only read-only tools are allowed." };
    }

    const request: PermissionRequest = {
      id: randomUUID(),
      sessionId,
      toolCallId,
      toolName: tool.name,
      kind: tool.kind,
      summary,
      args: input,
      diff,
      suggestedRules: this.suggestRules(tool, arg),
    };
    const response = new Promise<PermissionResponse>((resolve) => {
      this.pending.set(request.id, resolve);
    });
    return { behavior: "ask", request, response };
  }

  resolve(res: PermissionResponse): boolean {
    const resolver = this.pending.get(res.id);
    if (!resolver) return false;
    this.pending.delete(res.id);
    if (res.behavior === "allow" && res.scope === "always" && res.rule) {
      this.sessionAllow.push(res.rule);
      this.hooks.persistRule?.(res.rule);
    }
    resolver(res);
    return true;
  }

  /** Deny every outstanding request (session aborted or closed). */
  abortPending(): void {
    for (const [id, resolve] of this.pending) {
      resolve({ id, behavior: "deny", scope: "once", message: "Session aborted." });
    }
    this.pending.clear();
  }

  private suggestRules(tool: ToolDef<never>, arg: string | undefined): string[] {
    const rules: string[] = [];
    if (tool.kind === "execute" && arg) {
      const firstWord = arg.trim().split(/\s+/)[0];
      if (firstWord) rules.push(`${tool.name}(${firstWord} *)`);
    }
    rules.push(tool.name);
    return rules;
  }
}
