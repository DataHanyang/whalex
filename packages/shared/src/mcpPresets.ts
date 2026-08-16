import type { McpServerConfig } from "./settings.js";

export interface McpPreset {
  name: string;
  description: string;
  category: string;
  /** {cwd} is substituted with the active project directory at enable time. */
  config: McpServerConfig;
  /** Needs a token/env the user must fill in before it works. */
  requiresSetup?: boolean;
}

/**
 * Curated MCP servers offered out of the box. They ship disabled; the user
 * enables them with one click in Settings → MCP, which copies the config into
 * settings.mcpServers. Most run via `npx -y`, so no manual install is needed.
 */
export const MCP_PRESETS: McpPreset[] = [
  {
    name: "filesystem",
    description: "Standard filesystem server that reads and writes files in the working folder",
    category: "core",
    config: { type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "{cwd}"], env: {} },
  },
  {
    name: "memory",
    description: "Knowledge-graph memory that persists across sessions",
    category: "core",
    config: { type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], env: {} },
  },
  {
    name: "sequential-thinking",
    description: "Helps reason through complex problems step by step",
    category: "reasoning",
    config: { type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"], env: {} },
  },
  {
    name: "fetch",
    description: "Fetches web pages and converts them to Markdown",
    category: "web",
    config: { type: "stdio", command: "npx", args: ["-y", "@kazuph/mcp-fetch"], env: {} },
  },
  {
    name: "everything",
    description: "Reference server demonstrating every MCP capability (for testing)",
    category: "dev",
    config: { type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-everything"], env: {} },
  },
  {
    name: "github",
    description: "GitHub issues, PRs and repositories (needs GITHUB_TOKEN)",
    category: "dev",
    requiresSetup: true,
    config: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
    },
  },
  {
    name: "playwright",
    description: "Browser automation via Playwright (separate from built-in browser use)",
    category: "web",
    config: { type: "stdio", command: "npx", args: ["-y", "@playwright/mcp"], env: {} },
  },
  {
    name: "excel",
    description: "Read and write .xlsx workbooks — sheets, ranges, formulas",
    category: "office",
    config: { type: "stdio", command: "npx", args: ["-y", "@negokaz/excel-mcp-server"], env: {} },
  },
  {
    name: "powerpoint",
    description: "Build and edit .pptx decks — slides, text, images, charts",
    category: "office",
    // Python-based; uvx fetches it on first run the way npx does for node.
    config: { type: "stdio", command: "uvx", args: ["office-powerpoint-mcp-server"], env: {} },
    requiresSetup: true,
  },
  {
    name: "gmail",
    description: "Read, search and send Gmail — OAuth on first run",
    category: "office",
    config: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@gongrzhe/server-gmail-autoauth-mcp"],
      env: {},
    },
    requiresSetup: true,
  },
];

/** Fill {cwd} placeholders in a preset config. */
export function materializePreset(preset: McpPreset, cwd: string): McpServerConfig {
  const cfg = structuredClone(preset.config);
  if (cfg.type === "stdio") {
    cfg.args = cfg.args.map((a) => a.replace("{cwd}", cwd));
  }
  return cfg;
}
