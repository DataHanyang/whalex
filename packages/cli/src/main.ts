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
import os from "node:os";
import {
  AgentLoop,
  OpenAICompatProvider,
  PermissionEngine,
  SessionStore,
  supercodeProtocol,
  WorkflowRunner,
  createBuiltinRegistry,
  createWorkflowTool,
  type ToolDef,
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
  const registry = createBuiltinRegistry({
    includeVerifyPage: process.env.WHALEX_VERIFY !== "0",
  });
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

  // SuperCode: same wiring the desktop's AgentHost.enableWorkflow applies —
  // protocol prompt, workflow tool, orchestrator at max reasoning effort.
  //   WHALEX_SUPERCODE=1 [WHALEX_MAX_AGENTS=400] [WHALEX_FLEET_EFFORT=medium]
  const superCode = process.env.WHALEX_SUPERCODE === "1";
  let workflowRan = false;
  let fleetTokens = 0;
  let fleetCostUsd = 0;
  // Fleet shell on by default (matches the desktop default); WHALEX_FLEET_SHELL=0 opts out.
  const fleetShell = process.env.WHALEX_FLEET_SHELL !== "0";
  if (superCode) {
    loop.setProtocolPrompt(supercodeProtocol({ fleetShell }));
    if (modelInfo.supportsReasoning) loop.updateTuning({ reasoningEffort: "max" });
    const workflowCache = new Map<string, unknown>();
    registry.register(
      createWorkflowTool(
        (name) =>
          new WorkflowRunner(
            {
              provider,
              permissions,
              modelInfo,
              temperature: 0.2,
              reasoningEffort: process.env.WHALEX_FLEET_EFFORT ?? "medium",
              cwd,
              maxAgents: Number(process.env.WHALEX_MAX_AGENTS ?? 400),
              concurrency: Math.max(4, Math.min(24, os.cpus().length * 2)),
              cache: workflowCache,
              fleetShell,
              onUpdate: (state) => {
                fleetTokens = state.totalTokens;
                fleetCostUsd = state.costUsd;
                const last = state.log[state.log.length - 1];
                if (last) console.log(`${DIM}[fleet] ${last}${RESET}`);
              },
              signal: new AbortController().signal,
            },
            name,
          ),
        (_workflowId, name) => {
          workflowRan = true;
          console.log(`${CYAN}[workflow] ${name}${RESET}`);
        },
      ) as unknown as ToolDef<never>,
    );
  }

  // Non-interactive one-shot mode (CI / benchmarks): run a prompt to
  // completion, auto-resolving permission requests per the selected mode, then
  // emit a machine-readable metrics line and exit. In SuperCode the protocol
  // wants an interview + plan approval; headless stands in for the user by
  // auto-answering questions and nudging the model onward (the desktop's
  // Accept click), up to a bounded number of turns.
  //   WHALEX_PROMPT="build X" WHALEX_PERMISSION_MODE=bypassPermissions \
  //   WHALEX_MODEL=deepseek-v4-pro DEEPSEEK_API_KEY=sk-... whalex <workdir>
  const execPrompt = process.env.WHALEX_PROMPT;
  if (execPrompt) {
    const startedAt = Date.now();
    const AUTO_ANSWER =
      "Headless run — the user pre-approved everything: pick whatever you judge best; " +
      "the deepest budget tier is approved; the plan is accepted. Do not ask further " +
      "questions; proceed to full execution now.";

    const runTurn = async (prompt: string): Promise<void> => {
      for await (const ev of loop.run(prompt)) {
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
          case "question-request": {
            // Stand in for the user. The loop registers the answer resolver
            // only after this event handler returns (the yield resumes), so an
            // immediate answerQuestion() finds no pending question and the
            // process would drain its event loop and exit silently. Retry on a
            // timer until the resolver exists.
            const qid = ev.request.id;
            const tryAnswer = () => {
              if (!loop.answerQuestion(qid, AUTO_ANSWER)) setTimeout(tryAnswer, 50);
            };
            setTimeout(tryAnswer, 0);
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
    };

    try {
      await runTurn(execPrompt);
      // SuperCode plans first and waits for the user's Accept. Headless, the
      // accept is a follow-up message; two nudges bound the loop.
      let nudges = 0;
      while (superCode && !workflowRan && nudges < 2) {
        nudges += 1;
        console.log(`\n${YELLOW}[auto-accept ${nudges}]${RESET}`);
        await runTurn(
          "Plan accepted — permissions are now full-auto. Execute the plan to completion " +
            "now (use the workflow fleet as planned). Do not ask anything further.",
        );
      }
    } catch (err) {
      console.error(`${RED}${err instanceof Error ? err.message : String(err)}${RESET}`);
    }
    const u = loop.context.snapshot();
    const metrics = {
      model: modelId,
      superCode,
      workflowRan,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      cachedInputTokens: u.cachedInputTokens,
      costUsd: u.costUsd,
      fleetTokens,
      fleetCostUsd,
      totalCostUsd: (u.costUsd ?? 0) + fleetCostUsd,
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
