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
  {
    name: "time",
    description: "시간대 변환·날짜 계산 (공식 레퍼런스 서버, 키 불필요)",
    category: "core",
    config: { type: "stdio", command: "uvx", args: ["mcp-server-time"], env: {} },
  },
  {
    name: "context7",
    description: "라이브러리 최신 공식 문서·API 검색 — 학습시점 이후 버전도 정확하게 (키 없이 동작, 키 있으면 한도 상승)",
    category: "dev",
    config: { type: "stdio", command: "npx", args: ["-y", "@upstash/context7-mcp"], env: {} },
  },
  {
    name: "brave-search",
    description: "Brave 웹 검색 (공식, BRAVE_API_KEY 필요 — 무료 티어 있음)",
    category: "web",
    requiresSetup: true,
    config: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@brave/brave-search-mcp-server"],
      env: { BRAVE_API_KEY: "" },
    },
  },
  {
    name: "figma",
    description: "피그마 디자인 → 코드 핸드오프 (Figma 개인 액세스 토큰 필요)",
    category: "design",
    requiresSetup: true,
    config: {
      type: "stdio",
      command: "npx",
      args: ["-y", "figma-developer-mcp", "--stdio"],
      env: { FIGMA_API_KEY: "" },
    },
  },
  {
    name: "firecrawl",
    description: "안티봇 사이트 스크래핑·크롤링 (FIRECRAWL_API_KEY 필요)",
    category: "web",
    requiresSetup: true,
    config: {
      type: "stdio",
      command: "npx",
      args: ["-y", "firecrawl-mcp"],
      env: { FIRECRAWL_API_KEY: "" },
    },
  },
  {
    name: "naver-search",
    description: "네이버 검색 (웹·뉴스·블로그·쇼핑) + DataLab 트렌드 — 네이버 개발자센터 키 필요",
    category: "korea",
    requiresSetup: true,
    config: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@isnow890/naver-search-mcp"],
      env: { NAVER_CLIENT_ID: "", NAVER_CLIENT_SECRET: "" },
    },
  },
  {
    name: "youtube-transcript",
    description: "유튜브 영상 자막/스크립트 추출 — 키 불필요",
    category: "media",
    config: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@sinco-lab/mcp-youtube-transcript"],
      env: {},
    },
  },
  {
    name: "youtube-data",
    description: "유튜브 검색·영상·채널 정보 (YouTube Data API v3 키 필요)",
    category: "media",
    requiresSetup: true,
    config: {
      type: "stdio",
      command: "npx",
      args: ["-y", "youtube-data-mcp-server"],
      env: { YOUTUBE_API_KEY: "", YOUTUBE_TRANSCRIPT_LANG: "ko" },
    },
  },
  {
    name: "google-calendar",
    description: "구글 캘린더 일정 조회·생성 — GCP OAuth 클라이언트 JSON 경로 필요, 첫 실행 시 브라우저 인증",
    category: "office",
    requiresSetup: true,
    config: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@cocal/google-calendar-mcp"],
      env: { GOOGLE_OAUTH_CREDENTIALS: "" },
    },
  },
  {
    name: "instagram-threads",
    description: "인스타그램·스레드 게시/조회 (Meta 공식 Graph API — 비즈니스 계정 + 토큰 필요, 토큰은 약 60일마다 갱신)",
    category: "social",
    requiresSetup: true,
    config: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@mikusnuz/meta-mcp"],
      env: {
        INSTAGRAM_ACCESS_TOKEN: "",
        INSTAGRAM_USER_ID: "",
        THREADS_ACCESS_TOKEN: "",
        THREADS_USER_ID: "",
      },
    },
  },
  {
    name: "notion",
    description: "노션 페이지·데이터베이스 읽기/쓰기 (공식 서버, 내부 통합 토큰 필요)",
    category: "office",
    requiresSetup: true,
    config: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@notionhq/notion-mcp-server"],
      env: { NOTION_TOKEN: "" },
    },
  },
  {
    name: "slack",
    description: "슬랙 채널·메시지 읽기/보내기 (사용자 OAuth 토큰 필요)",
    category: "office",
    requiresSetup: true,
    config: {
      type: "stdio",
      command: "npx",
      args: ["-y", "slack-mcp-server@latest", "--transport", "stdio"],
      env: { SLACK_MCP_XOXP_TOKEN: "" },
    },
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
