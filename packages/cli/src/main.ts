#!/usr/bin/env node
/**
 * Headless Whalex harness: drives @whalex/core from a terminal without
 * Electron. Used for core E2E testing and CI.
 *
 *   DEEPSEEK_API_KEY=sk-... whalex [workdir]
 *   WHALEX_MODEL=deepseek-v4-flash (optional)
 */
import path from "node:path";
import readline from "node:readline/promises";
import {
  AgentLoop,
  OpenAICompatProvider,
  PermissionEngine,
  SessionStore,
  createBuiltinRegistry,
} from "@whalex/core";
import { DEEPSEEK_BASE_URL, resolveModelInfo } from "@whalex/shared";

const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

async function main(): Promise<void> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error(`${RED}DEEPSEEK_API_KEY environment variable is required.${RESET}`);
    process.exit(1);
  }
  const cwd = path.resolve(process.argv[2] ?? process.cwd());
  const modelId = process.env.WHALEX_MODEL ?? "deepseek-v4-flash";
  const modelInfo = resolveModelInfo(modelId);

  const provider = new OpenAICompatProvider({ baseUrl: DEEPSEEK_BASE_URL, apiKey });
  const registry = createBuiltinRegistry({ includeVerifyPage: true });
  const permMode = (process.env.WHALEX_PERMISSION_MODE ?? "default") as
    | "default"
    | "acceptEdits"
    | "bypassPermissions"
    | "plan";
  const permissions = new PermissionEngine({ mode: permMode, allow: [], deny: [] });
  const session = SessionStore.create(cwd);
  const loop = new AgentLoop({
    provider,
    registry,
    permissions,
    session,
    modelInfo,
    temperature: 0.2,
  });

  // Non-interactive one-shot mode (CI / benchmarks): run a single prompt to
  // completion, auto-resolving permission requests per the selected mode, then
  // emit a machine-readable metrics line and exit.
  //   WHALEX_PROMPT="build X" WHALEX_PERMISSION_MODE=bypassPermissions \
  //   WHALEX_MODEL=deepseek-v4-pro DEEPSEEK_API_KEY=sk-... whalex <workdir>
  const execPrompt = process.env.WHALEX_PROMPT;
  if (execPrompt) {
    const startedAt = Date.now();
    try {
      for await (const ev of loop.run(execPrompt)) {
        switch (ev.type) {
          case "text-delta":
            process.stdout.write(ev.delta);
            break;
          case "tool-start":
            console.log(`\n${CYAN}⚙ ${ev.toolName}${RESET} ${DIM}${JSON.stringify(ev.args).slice(0, 160)}${RESET}`);
            break;
          case "tool-result": {
            const mark = ev.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
            console.log(`${mark} ${DIM}(${ev.durationMs}ms)${RESET}`);
            break;
          }
          case "permission-request":
            // Full-auto: allow whatever the mode did not already auto-approve.
            permissions.resolve({
              id: ev.request.id,
              behavior: "allow",
              scope: "once",
            });
            break;
          case "error":
            console.error(`\n${RED}[${ev.code}] ${ev.message}${RESET}`);
            break;
          default:
            break;
        }
      }
    } catch (err) {
      console.error(`${RED}${err instanceof Error ? err.message : String(err)}${RESET}`);
    }
    const u = loop.context.snapshot();
    const metrics = {
      model: modelId,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      cachedInputTokens: u.cachedInputTokens,
      costUsd: u.costUsd,
      wallMs: Date.now() - startedAt,
    };
    console.log(`\n__WHALEX_METRICS__ ${JSON.stringify(metrics)}`);
    process.exit(0);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`${CYAN}Whalex CLI${RESET} — model ${modelId}, cwd ${cwd}`);
  console.log(`${DIM}Type a request, or "exit" to quit. Ctrl+C aborts a running turn.${RESET}\n`);

  process.on("SIGINT", () => {
    if (loop.isRunning) {
      loop.abort();
      console.log(`\n${YELLOW}[interrupted]${RESET}`);
    } else {
      process.exit(0);
    }
  });

  for (;;) {
    const input = (await rl.question("> ")).trim();
    if (!input) continue;
    if (input === "exit" || input === "quit") break;

    let inReasoning = false;
    try {
      for await (const ev of loop.run(input)) {
        switch (ev.type) {
          case "reasoning-delta":
            if (!inReasoning) {
              process.stdout.write(`${DIM}[reasoning] `);
              inReasoning = true;
            }
            process.stdout.write(ev.delta);
            break;
          case "text-delta":
            if (inReasoning) {
              process.stdout.write(`${RESET}\n`);
              inReasoning = false;
            }
            process.stdout.write(ev.delta);
            break;
          case "tool-start":
            if (inReasoning) {
              process.stdout.write(`${RESET}\n`);
              inReasoning = false;
            }
            console.log(`\n${CYAN}⚙ ${ev.toolName}${RESET} ${DIM}${JSON.stringify(ev.args).slice(0, 160)}${RESET}`);
            break;
          case "tool-result": {
            const mark = ev.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
            const preview = ev.output.split("\n").slice(0, 5).join("\n");
            console.log(`${mark} ${DIM}(${ev.durationMs}ms)${RESET}\n${DIM}${preview}${RESET}`);
            break;
          }
          case "permission-request": {
            const answer = (
              await rl.question(
                `${YELLOW}Permission:${RESET} ${ev.request.summary}  [y=allow / a=always / N=deny] `,
              )
            )
              .trim()
              .toLowerCase();
            const always = answer === "a";
            permissions.resolve({
              id: ev.request.id,
              behavior: answer === "y" || always ? "allow" : "deny",
              scope: always ? "always" : "once",
              rule: always ? ev.request.suggestedRules[0] : undefined,
            });
            break;
          }
          case "todo-update":
            console.log(
              `${DIM}todos: ${ev.todos
                .map((t) => `${t.status === "completed" ? "[x]" : t.status === "in_progress" ? "[~]" : "[ ]"} ${t.content}`)
                .join(" | ")}${RESET}`,
            );
            break;
          case "usage":
            break;
          case "error":
            console.error(`\n${RED}[${ev.code}] ${ev.message}${RESET}`);
            break;
          case "done": {
            const usage = loop.context.snapshot();
            console.log(
              `\n${DIM}— ${ev.stopReason} · ctx ${usage.contextPct}% · in ${usage.inputTokens} out ${usage.outputTokens}${RESET}\n`,
            );
            break;
          }
          default:
            break;
        }
      }
    } catch (err) {
      console.error(`${RED}${err instanceof Error ? err.message : String(err)}${RESET}`);
    }
  }
  rl.close();
}

void main();
