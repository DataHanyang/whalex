import { ToolRegistry, type ToolDef } from "./Tool.js";
import { editFileTool, readFileTool, writeFileTool } from "./fs.js";
import { executeTool } from "./shell.js";
import { globTool, grepTool } from "./search.js";
import { todoWriteTool } from "./todo.js";
import { presentFileTool } from "./present.js";
import { webFetchTool } from "./web.js";
import { verifyPageTool } from "./verify.js";
import { askUserTool } from "./askUser.js";

export * from "./Tool.js";
export { presentFileTool } from "./present.js";
export { webFetchTool } from "./web.js";
export { verifyPageTool } from "./verify.js";
export { askUserTool } from "./askUser.js";

export interface BuiltinToolOptions {
  /** Read-only agents (e.g. the "explore" subagent type) get a reduced set. */
  readOnlyOnly?: boolean;
  /** Workflow fleet agents: files in/out but no shell, no user interaction. */
  workerTools?: boolean;
  includeWebFetch?: boolean;
  includePresent?: boolean;
  /** Renders a produced HTML page to check it actually draws (needs Electron). */
  includeVerifyPage?: boolean;
}

/** Registration order is the API tool order — keep it stable (context caching). */
export function createBuiltinRegistry(opts: BuiltinToolOptions = {}): ToolRegistry {
  const registry = new ToolRegistry();
  const all: ToolDef<never>[] = [
    readFileTool,
    writeFileTool,
    editFileTool,
    executeTool,
    globTool,
    grepTool,
    todoWriteTool,
    askUserTool,
    ...(opts.includePresent !== false ? [presentFileTool] : []),
    ...(opts.includeWebFetch !== false ? [webFetchTool] : []),
    ...(opts.includeVerifyPage ? [verifyPageTool] : []),
  ] as ToolDef<never>[];
  let tools = opts.readOnlyOnly ? all.filter((t) => t.readOnly) : all;
  if (opts.workerTools) {
    tools = all.filter(
      (t) => t.readOnly || t.name === "write_file" || t.name === "edit_file",
    );
  }
  for (const t of tools) registry.register(t);
  return registry;
}
