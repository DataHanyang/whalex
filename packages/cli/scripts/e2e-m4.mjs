// M4 core E2E: exercises subagent + workflow (SuperCode) against the real API.
//   DEEPSEEK_API_KEY=... node scripts/e2e-m4.mjs
import {
  OpenAICompatProvider,
  PermissionEngine,
  WorkflowRunner,
  createAgentTool,
} from "@whalex/core";
import { DEEPSEEK_BASE_URL, resolveModelInfo } from "@whalex/shared";

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error("DEEPSEEK_API_KEY required");
  process.exit(1);
}
const provider = new OpenAICompatProvider({ baseUrl: DEEPSEEK_BASE_URL, apiKey });
const permissions = new PermissionEngine({ mode: "bypassPermissions", allow: [], deny: [] });
const modelInfo = resolveModelInfo("deepseek-v4-flash");
const cwd = process.cwd();

// --- 1. Subagent tool ---
console.log("=== Subagent test ===");
const agentTool = createAgentTool({
  provider,
  permissions,
  modelInfo,
  temperature: 0.2,
  cwd,
  onProgress: (u) => process.stdout.write(`  [subagent ${u.state} tools=${u.toolCount}]\r`),
});
const ac = new AbortController();
const subRes = await agentTool.execute(
  {
    agent_type: "explore",
    description: "count core files",
    prompt: "packages/core/src 폴더에 있는 .ts 파일이 대략 몇 개인지 glob로 세어보고 숫자만 알려줘.",
  },
  { cwd, sessionId: "t", signal: ac.signal, setTodos: () => {} },
);
console.log("\n  result ok=" + subRes.ok);
console.log("  " + subRes.output.slice(0, 200).replace(/\n/g, " "));

// --- 2. Workflow (SuperCode) ---
console.log("\n=== SuperCode workflow test ===");
const runner = new WorkflowRunner(
  {
    provider,
    permissions,
    modelInfo,
    temperature: 0.3,
    cwd,
    maxAgents: 10,
    concurrency: 4,
    onUpdate: (state) => {
      const done = state.agents.filter((a) => a.state === "done").length;
      process.stdout.write(`  [workflow ${state.state} agents=${done}/${state.agents.length} tok=${state.totalTokens}]\r`);
    },
    signal: ac.signal,
  },
  "3-idea brainstorm",
);
const script = `
phase("Generate");
const ideas = await parallel([
  () => agent("이름 짓기 앱의 참신한 기능 아이디어 1개를 한 문장으로 제안해줘.", { label: "idea-A", phase: "Generate" }),
  () => agent("이름 짓기 앱의 실용적 기능 아이디어 1개를 한 문장으로 제안해줘.", { label: "idea-B", phase: "Generate" }),
  () => agent("이름 짓기 앱의 재미있는 기능 아이디어 1개를 한 문장으로 제안해줘.", { label: "idea-C", phase: "Generate" }),
]);
phase("Synthesize");
const best = await agent("다음 세 아이디어 중 가장 좋은 것을 골라 이유와 함께 한국어로 요약해줘:\\n" + ideas.filter(Boolean).join("\\n"), { label: "synthesize", phase: "Synthesize" });
return best;
`;
const wfRes = await runner.run(script);
console.log("\n  workflow ok=" + wfRes.ok);
console.log("  " + (wfRes.result || wfRes.error || "").slice(0, 300).replace(/\n/g, " "));

process.exit(subRes.ok && wfRes.ok ? 0 : 1);
