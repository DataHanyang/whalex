import { describe, expect, it } from "vitest";
import { PermissionEngine } from "../src/permissions/PermissionEngine.js";
import type { ToolDef, ToolContext } from "../src/tools/Tool.js";
import { z } from "zod";

const ctx: ToolContext = {
  cwd: "C:/proj",
  sessionId: "s",
  signal: new AbortController().signal,
  setTodos: () => {},
};

function tool(over: Partial<ToolDef<never>>): ToolDef<never> {
  return {
    name: "Execute",
    description: "",
    schema: z.any() as never,
    readOnly: false,
    kind: "execute",
    summarize: () => "run",
    ruleArg: (i: unknown) => (i as { command: string }).command,
    execute: async () => ({ ok: true, output: "" }),
    ...over,
  } as ToolDef<never>;
}

function check(engine: PermissionEngine, t: ToolDef<never>, input: unknown) {
  return engine.check(t, input, ctx, "s", "call1");
}

describe("PermissionEngine", () => {
  it("auto-allows read-only tools in default mode", () => {
    const e = new PermissionEngine({ mode: "default", allow: [], deny: [] });
    const read = tool({ name: "Read", readOnly: true, kind: "read", ruleArg: () => "a.ts" });
    expect(check(e, read, {}).behavior).toBe("allow");
  });

  it("asks for writes in default mode", () => {
    const e = new PermissionEngine({ mode: "default", allow: [], deny: [] });
    expect(check(e, tool({}), { command: "npm test" }).behavior).toBe("ask");
  });

  it("matches an allow rule with a glob", () => {
    const e = new PermissionEngine({ mode: "default", allow: ["Execute(git *)"], deny: [] });
    expect(check(e, tool({}), { command: "git status" }).behavior).toBe("allow");
    expect(check(e, tool({}), { command: "rm x" }).behavior).toBe("ask");
  });

  it("deny wins over allow", () => {
    const e = new PermissionEngine({
      mode: "bypassPermissions",
      allow: ["Execute(*)"],
      deny: ["Execute(git push*)"],
    });
    expect(check(e, tool({}), { command: "git push origin" }).behavior).toBe("deny");
    expect(check(e, tool({}), { command: "git status" }).behavior).toBe("allow");
  });

  it("bypassPermissions allows writes but still asks on destructive patterns", () => {
    const e = new PermissionEngine({ mode: "bypassPermissions", allow: [], deny: [] });
    expect(check(e, tool({}), { command: "echo hi" }).behavior).toBe("allow");
    expect(check(e, tool({}), { command: "format c:" }).behavior).toBe("ask");
  });

  it("does not false-positive on PowerShell Format-List", () => {
    const e = new PermissionEngine({ mode: "bypassPermissions", allow: [], deny: [] });
    expect(check(e, tool({}), { command: "Get-Item x | Format-List" }).behavior).toBe("allow");
  });

  it("plan mode allows read-only, denies mutations", () => {
    const e = new PermissionEngine({ mode: "plan", allow: [], deny: [] });
    const read = tool({ name: "Read", readOnly: true, kind: "read", ruleArg: () => "a.ts" });
    expect(check(e, read, {}).behavior).toBe("allow");
    expect(check(e, tool({}), { command: "npm i" }).behavior).toBe("deny");
  });

  it("acceptEdits auto-approves edits but asks for shell", () => {
    const e = new PermissionEngine({ mode: "acceptEdits", allow: [], deny: [] });
    const edit = tool({ name: "Edit", kind: "edit", ruleArg: () => "src/a.ts" });
    expect(check(e, edit, {}).behavior).toBe("allow");
    expect(check(e, tool({}), { command: "npm i" }).behavior).toBe("ask");
  });

  it("matches an always-allow rule for an MCP tool with digits and hyphens", () => {
    // Regression: the rule parser's [a-zA-Z_]+ tool-name class failed to parse
    // mcp__context7__get-library-docs, so "always allow" never matched and the
    // user was re-asked every call.
    const e = new PermissionEngine({ mode: "default", allow: [], deny: [] });
    const mcp = tool({
      name: "mcp__context7__get-library-docs",
      kind: "other",
      ruleArg: () => "get-library-docs",
    });
    const decision = check(e, mcp, {});
    expect(decision.behavior).toBe("ask");
    if (decision.behavior !== "ask") return;
    e.resolve({
      id: decision.request.id,
      behavior: "allow",
      scope: "always",
      rule: "mcp__context7__get-library-docs",
    });
    expect(check(e, mcp, {}).behavior).toBe("allow");
  });

  it("asks on PowerShell recursive-delete aliases even in bypass mode", () => {
    const e = new PermissionEngine({ mode: "bypassPermissions", allow: [], deny: [] });
    expect(check(e, tool({}), { command: "rm -r C:\\Windows" }).behavior).toBe("ask");
    expect(check(e, tool({}), { command: "Remove-Item -Recurse -Force C:\\x" }).behavior).toBe("ask");
    expect(check(e, tool({}), { command: "ri -Recurse ." }).behavior).toBe("ask");
    expect(check(e, tool({}), { command: "rd /s /q C:\\temp" }).behavior).toBe("ask");
    // A non-recursive rm of a relative path is still fine in bypass mode.
    expect(check(e, tool({}), { command: "rm ./build/out.txt" }).behavior).toBe("allow");
  });

  it("resolves an ask with allow and persists an always-rule", () => {
    const persisted: string[] = [];
    const e = new PermissionEngine(
      { mode: "default", allow: [], deny: [] },
      { persistRule: (r) => persisted.push(r) },
    );
    const decision = check(e, tool({}), { command: "npm test" });
    expect(decision.behavior).toBe("ask");
    if (decision.behavior !== "ask") return;
    e.resolve({ id: decision.request.id, behavior: "allow", scope: "always", rule: "Execute(npm *)" });
    expect(persisted).toContain("Execute(npm *)");
    // The session-scoped rule now auto-allows.
    expect(check(e, tool({}), { command: "npm run build" }).behavior).toBe("allow");
  });
});
