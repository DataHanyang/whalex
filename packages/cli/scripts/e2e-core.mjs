// Core E2E harness: runs one agent turn against the real DeepSeek API with
// permissions bypassed. Usage:
//   DEEPSEEK_API_KEY=... node scripts/e2e-core.mjs <workdir> "<prompt>"
import {
  AgentLoop,
  OpenAICompatProvider,
  PermissionEngine,
  SessionStore,
  createBuiltinRegistry,
} from "@whalex/core";
import { DEEPSEEK_BASE_URL, resolveModelInfo } from "@whalex/shared";

const [cwd, prompt] = process.argv.slice(2);
if (!cwd || !prompt || !process.env.DEEPSEEK_API_KEY) {
  console.error("usage: DEEPSEEK_API_KEY=... node scripts/e2e-core.mjs <workdir> <prompt>");
  process.exit(1);
}

const permissions = new PermissionEngine({
  mode: "bypassPermissions",
  allow: [],
  deny: [],
});
const loop = new AgentLoop({
  provider: new OpenAICompatProvider({
    baseUrl: DEEPSEEK_BASE_URL,
    apiKey: process.env.DEEPSEEK_API_KEY,
  }),
  registry: createBuiltinRegistry(),
  permissions,
  session: SessionStore.create(cwd),
  modelInfo: resolveModelInfo(process.env.WHALEX_MODEL ?? "deepseek-v4-flash"),
  temperature: 0.2,
});

let sawText = false;
let toolCount = 0;
let failed = false;
const started = Date.now();

for await (const ev of loop.run(prompt)) {
  switch (ev.type) {
    case "text-delta":
      if (!sawText) {
        sawText = true;
        process.stdout.write("\n[assistant] ");
      }
      process.stdout.write(ev.delta);
      break;
    case "tool-start":
      toolCount++;
      console.log(`\n[tool ${toolCount}] ${ev.toolName} ${JSON.stringify(ev.args).slice(0, 140)}`);
      break;
    case "tool-result":
      console.log(`[tool done] ok=${ev.ok} ${ev.durationMs}ms :: ${ev.output.split("\n")[0]?.slice(0, 120)}`);
      if (!ev.ok) console.log(`  full error: ${ev.output.slice(0, 400)}`);
      break;
    case "permission-request":
      // Headless harness: auto-approve, but log it — bypass mode should
      // only reach here for hard-deny patterns.
      console.log(`\n[permission auto-allow] ${ev.request.summary}`);
      permissions.resolve({ id: ev.request.id, behavior: "allow", scope: "once" });
      break;
    case "error":
      failed = true;
      console.error(`\n[ERROR ${ev.code}] ${ev.message}`);
      break;
    case "done": {
      const u = loop.context.snapshot();
      console.log(
        `\n\n[done ${ev.stopReason}] ${((Date.now() - started) / 1000).toFixed(1)}s · tools=${toolCount} · in=${u.inputTokens} out=${u.outputTokens} cached=${u.cachedInputTokens} ctx=${u.contextPct}%`,
      );
      break;
    }
  }
}
process.exit(failed ? 1 : 0);
