import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { z } from "zod";
import type { McpServerConfig, McpStatus } from "@whalex/shared";
import type { ToolDef, ToolResult } from "../tools/Tool.js";
import type { ToolSpec } from "../providers/Provider.js";

interface Connection {
  name: string;
  client: Client;
  status: McpStatus;
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
}

// A cold `npx -y` run downloads the package first; give it room.
const CONNECT_TIMEOUT = 60_000;
// Concurrent npx invocations contend on the npm cache lock — a parallel boot
// of 8 stdio servers made every handshake exceed the timeout. Connect a few
// at a time instead.
const CONNECT_POOL = 3;

/**
 * Connects to and manages multiple MCP servers. Runs in the Electron main
 * process (stdio servers spawn child processes). Tools are namespaced
 * `mcp__<server>__<tool>` and merged into the agent's tool list; calls route
 * back through the same PermissionEngine as built-in tools.
 */
export class McpManager {
  private connections = new Map<string, Connection>();
  private onStatusChange?: (statuses: McpStatus[]) => void;

  setStatusListener(fn: (statuses: McpStatus[]) => void): void {
    this.onStatusChange = fn;
  }

  async startAll(servers: Record<string, { config: McpServerConfig; enabled: boolean }>): Promise<void> {
    const entries = Object.entries(servers);
    for (const [name, entry] of entries) {
      if (!entry.enabled) this.markDisabled(name, entry.config);
    }
    const queue = entries.filter(([, e]) => e.enabled);
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        await this.connect(job[0], job[1].config);
      }
    };
    await Promise.all(Array.from({ length: CONNECT_POOL }, worker));
    this.emitStatus();
  }

  private markDisabled(name: string, config: McpServerConfig): void {
    this.connections.set(name, {
      name,
      client: null as never,
      status: { name, state: "disabled", transport: config.type, toolCount: 0 },
      tools: [],
    });
  }

  async connect(name: string, config: McpServerConfig): Promise<void> {
    // Tear down any previous connection under this name.
    await this.disconnect(name);
    const status: McpStatus = { name, state: "connecting", transport: config.type, toolCount: 0 };
    this.connections.set(name, { name, client: null as never, status, tools: [] });
    this.emitStatus();

    let client: Client | undefined;
    try {
      client = new Client({ name: "whalex", version: "0.1.0" }, { capabilities: {} });
      const transport = this.makeTransport(config);
      await withTimeout(client.connect(transport), CONNECT_TIMEOUT, `connect ${name}`);
      const listed = await withTimeout(client.listTools(), CONNECT_TIMEOUT, `listTools ${name}`);
      const tools = listed.tools.map((t) => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: (t.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
      }));
      this.connections.set(name, {
        name,
        client,
        status: { name, state: "connected", transport: config.type, toolCount: tools.length },
        tools,
      });
    } catch (err) {
      // A timed-out stdio connect leaves the spawned `npx` child running with
      // no client reference to close — a zombie holding the npm cache lock.
      // Close whatever we have so the transport tears the child down.
      if (client) {
        try {
          await client.close();
        } catch {
          // ignore — best-effort cleanup
        }
      }
      this.connections.set(name, {
        name,
        client: null as never,
        status: {
          name,
          state: "error",
          transport: config.type,
          toolCount: 0,
          error: err instanceof Error ? err.message : String(err),
        },
        tools: [],
      });
    }
    this.emitStatus();
  }

  private makeTransport(config: McpServerConfig) {
    if (config.type === "stdio") {
      // On Windows, `npx`/`npm` must resolve to the .cmd shim.
      const command =
        process.platform === "win32" && /^(npx|npm|node)$/.test(config.command)
          ? `${config.command}.cmd`
          : config.command;
      return new StdioClientTransport({
        command,
        args: config.args,
        env: { ...inheritableEnv(), ...config.env },
      });
    }
    const url = new URL(config.url);
    if (config.type === "sse") {
      return new SSEClientTransport(url, { requestInit: { headers: config.headers } });
    }
    return new StreamableHTTPClientTransport(url, { requestInit: { headers: config.headers } });
  }

  async restart(name: string, config: McpServerConfig): Promise<void> {
    await this.connect(name, config);
  }

  async disconnect(name: string): Promise<void> {
    const conn = this.connections.get(name);
    if (conn?.client) {
      try {
        await conn.client.close();
      } catch {
        // ignore
      }
    }
    this.connections.delete(name);
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.connections.keys()].map((n) => this.disconnect(n)));
    this.emitStatus();
  }

  statuses(): McpStatus[] {
    return [...this.connections.values()].map((c) => c.status);
  }

  /** Namespaced tool specs to merge into the agent's tool list. */
  toolSpecs(): ToolSpec[] {
    const specs: ToolSpec[] = [];
    for (const conn of this.connections.values()) {
      for (const tool of conn.tools) {
        specs.push({
          type: "function",
          function: {
            name: `mcp__${conn.name}__${tool.name}`,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        });
      }
    }
    return specs;
  }

  isMcpTool(name: string): boolean {
    return name.startsWith("mcp__");
  }

  /**
   * ToolDefs for every connected MCP tool, so they flow through the same
   * registry, permission engine, and executor as built-in tools. The schema
   * is a passthrough (the MCP server validates); rawParameters carries the
   * real JSON Schema for the API.
   */
  toolDefs(): ToolDef<never>[] {
    const defs: ToolDef<never>[] = [];
    for (const conn of this.connections.values()) {
      for (const tool of conn.tools) {
        const fullName = `mcp__${conn.name}__${tool.name}`;
        defs.push({
          name: fullName,
          description: tool.description,
          schema: z.record(z.unknown()) as unknown as z.ZodType<never>,
          rawParameters: tool.inputSchema,
          readOnly: false,
          kind: "other",
          summarize: () => `MCP ${conn.name}: ${tool.name}`,
          ruleArg: () => tool.name,
          execute: (input, ctx) => this.callTool(fullName, input, ctx.signal),
        });
      }
    }
    return defs;
  }

  async callTool(namespaced: string, args: unknown, signal: AbortSignal): Promise<ToolResult> {
    const match = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(namespaced);
    if (!match) return { ok: false, output: `Bad MCP tool name: ${namespaced}` };
    const [, , toolName] = match;
    // Find the connection whose name is the longest matching prefix, so a
    // server "foo" never shadows "foo__bar" (or vice versa) by insertion order.
    let conn: Connection | undefined;
    for (const c of this.connections.values()) {
      if (
        namespaced.startsWith(`mcp__${c.name}__`) &&
        (!conn || c.name.length > conn.name.length)
      ) {
        conn = c;
      }
    }
    if (!conn || !conn.client) {
      return { ok: false, output: `MCP server not connected for ${namespaced}` };
    }
    const realTool = namespaced.slice(`mcp__${conn.name}__`.length) || toolName || "";
    try {
      const result = await conn.client.callTool(
        { name: realTool, arguments: (args ?? {}) as Record<string, unknown> },
        undefined,
        { signal, timeout: 120_000 },
      );
      const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
      const text = content
        .map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type}]`))
        .join("\n");
      return { ok: !result.isError, output: text || "(no output)" };
    } catch (err) {
      return { ok: false, output: `MCP call failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  private emitStatus(): void {
    this.onStatusChange?.(this.statuses());
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  // Clear the timer whichever side wins, so a fast success doesn't keep the
  // event loop alive for the full timeout.
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Environment passed to stdio MCP servers. Third-party server processes used
 * to inherit the whole process.env — API keys included. Now only the
 * variables a child process needs to run at all are inherited; anything a
 * server genuinely needs is declared explicitly in its config.env.
 */
function inheritableEnv(): Record<string, string> {
  const ALLOW = [
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "SYSTEMDRIVE",
    "WINDIR",
    "COMSPEC",
    "TEMP",
    "TMP",
    "TMPDIR",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "PROGRAMFILES",
    "PROGRAMDATA",
    "ALLUSERSPROFILE",
    "SHELL",
    "USER",
    "LOGNAME",
    "LANG",
    "LC_ALL",
    "TZ",
  ];
  const out: Record<string, string> = {};
  // Windows env var names are case-insensitive; match by uppercased key.
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && ALLOW.includes(key.toUpperCase())) out[key] = value;
  }
  return out;
}
