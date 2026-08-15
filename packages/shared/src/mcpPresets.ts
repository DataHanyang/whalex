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
    description: "작업 폴더의 파일을 읽고 쓰는 표준 파일시스템 서버",
    category: "core",
    config: { type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "{cwd}"], env: {} },
  },
  {
    name: "memory",
    description: "세션 간 유지되는 지식 그래프 메모리",
    category: "core",
    config: { type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], env: {} },
  },
  {
    name: "sequential-thinking",
    description: "복잡한 문제를 단계적으로 사고하도록 돕는 도구",
    category: "reasoning",
    config: { type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"], env: {} },
  },
  {
    name: "fetch",
    description: "웹 페이지를 가져와 마크다운으로 변환",
    category: "web",
    config: { type: "stdio", command: "npx", args: ["-y", "@kazuph/mcp-fetch"], env: {} },
  },
  {
    name: "everything",
    description: "MCP 기능을 모두 시연하는 레퍼런스 서버 (테스트용)",
    category: "dev",
    config: { type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-everything"], env: {} },
  },
  {
    name: "github",
    description: "GitHub 이슈·PR·저장소 (GITHUB_TOKEN 필요)",
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
    description: "Playwright로 브라우저 자동화 (별도 브라우저 유즈)",
    category: "web",
    config: { type: "stdio", command: "npx", args: ["-y", "@playwright/mcp"], env: {} },
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
