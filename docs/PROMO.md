# WhaleX Promotion Kit (v0.2.0)

Ready-to-paste launch posts. Publish from your own accounts.

---

## 1) Hacker News — Show HN

**Title:**
Show HN: WhaleX – Claude Code-style agent on your own DeepSeek key (1/50th cost)

**Body:**
I built an open-source coding-agent desktop app that works like Claude Code or Codex, but runs on your own DeepSeek API key.

Why: DeepSeek V4 costs $0.435/$0.87 per 1M tokens vs $5/$25+ for frontier models. I wanted to know whether the agent-harness patterns (plan mode, permission gates, MCP, skills, sub-agent fleets) survive the model swap. They mostly do.

Numbers from a five-task head-to-head on one machine (same prompts, full-auto, artifacts verified in a real browser engine): WhaleX $0.135 total vs Codex $7.30 vs Claude Code ~$14.10. All three scored 100% on the two objectively-scored tasks — on well-specified work the gap is cost and time, not correctness. Full method + raw numbers in the repo.

The fun part is SuperCode: an Ultracode-style orchestration mode. Toggle it and the session auto-switches to the strongest model at max reasoning, runs a 3-explorer+1-critic recon fleet, interviews you (including how much budget to spend), presents a plan, then executes with parallel agent fleets — judge panels, adversarial verification. The README hero image is a real-time tracker of 10,961 satellites it built end-to-end from one prompt. The same brief to a solo agent took 45% longer; both cost single-digit dollars where the same token volume at frontier rates would be $120–290.

Windows/macOS/Linux builds on the releases page (unsigned for now — checksums attached). Privacy: BYOK, zero telemetry, and secret-shaped strings (keys, tokens) are masked before any request leaves your machine.

https://github.com/leejoong/whalex

Honest caveats: DeepSeek is weaker than frontier models at underspecified tasks; builds are unsigned; one run per benchmark task (order-of-magnitude comparison, not a model ranking). Happy to answer anything.

---

## 2) Reddit — r/LocalLLaMA

**Title:** WhaleX: open-source Claude Code alternative that runs on your DeepSeek key — benchmarked at 1/50th the cost, with a multi-agent "SuperCode" mode

**Body:**
Desktop app (Electron, MIT) with the full agent-harness kit: streaming tool calls, plan mode with Accept/Revise/Reject, permission system, MCP servers, Claude Code-compatible skills (installs straight from anthropics/skills or any GitHub repo), checkpoints/rewind, in-app multi-tab browser, and auto-updates.

The headline feature is SuperCode — hundreds-of-agents orchestration on DeepSeek pricing. It always starts in plan mode: recon fleet (3 explorers + 1 critic) → interview incl. a budget dial (Economy/Standard/Deep/Unlimited) → plan that names its fleet → full-auto execution with judge panels and adversarial verification. One prompt produced a live tracker of 10,961 satellites (hero image in the repo); the identical prompt to a solo agent shipped comparable quality 45% slower.

Cost reality check from our five-task benchmark: $0.135 total vs $7.30 (Codex) / ~$14.10 (Claude Code). BYOK, no telemetry, secrets masked before requests leave the machine. Works with any OpenAI-compatible endpoint, so local models via Ollama work too.

https://github.com/leejoong/whalex — feedback and issues very welcome.

---

## 3) X / Twitter thread

1/ Claude Code costs add up. DeepSeek tokens cost 1/50th. So I built WhaleX — an open-source coding-agent desktop app that runs the same workflows on your own DeepSeek key. 🐋

2/ Five-task benchmark, same prompts, same machine, full-auto:
WhaleX $0.135 · Codex $7.30 · Claude Code ~$14.10
Both scored tasks: all three hit 100%. The gap on specified work is cost, not correctness.

3/ The flagship mode is SuperCode — Ultracode-class orchestration. Recon fleet → budget interview → plan → parallel agent fleets with judge panels + adversarial verification. This tracker of 10,961 live satellites came from ONE prompt: [attach hero image]

4/ Same prompt, solo agent: excellent result too — 45% slower. Fleet ~57M tokens ≤$26 list (real bill far lower with caching). Same volume at frontier rates: ~$290. That's the whole thesis: cheap tokens make fleets a default, not a splurge.

5/ Win/mac/Linux. BYOK, zero telemetry, secrets masked before anything leaves your machine. MIT.
https://github.com/leejoong/whalex

---

## Posting tips
- Show HN lands best Tue–Wed mornings US Eastern
- The first hour of replies decides ranking — stay at the keyboard after posting
- Attach docs/screenshots/hero.png to tweet 3
- Keep docs/bench/report.html handy for data questions
