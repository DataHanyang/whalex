import { ToolRegistry, type ToolDef } from "./Tool.js";
import { editFileTool, readFileTool, writeFileTool } from "./fs.js";
import { executeTool } from "./shell.js";
import { globTool, grepTool } from "./search.js";
import { todoWriteTool } from "./todo.js";

export * from "./Tool.js";

/** Registration order is the API tool order — keep it stable (context caching). */
export function createBuiltinRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  const tools: ToolDef<never>[] = [
    readFileTool,
    writeFileTool,
    editFileTool,
    executeTool,
    globTool,
    grepTool,
    todoWriteTool,
  ] as ToolDef<never>[];
  for (const t of tools) registry.register(t);
  return registry;
}
