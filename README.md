<div align="center">

<img src="docs/logo.png" alt="Whalex" width="380">

### A local coding-agent desktop app, powered by DeepSeek

Like **Claude Code** / **Codex** — but it runs on your own DeepSeek key.
Reads, edits and runs code in a folder on your machine, and shows you what it built in a live preview.

[![Release](https://img.shields.io/github/v/release/DataHanyang/whalex?include_prereleases&label=release&color=4d6bfe)](https://github.com/DataHanyang/whalex/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-4d6bfe.svg)](LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-4d6bfe)](https://github.com/DataHanyang/whalex/releases)
[![Made with DeepSeek](https://img.shields.io/badge/model-DeepSeek-4d6bfe)](https://platform.deepseek.com)
[![i18n](https://img.shields.io/badge/i18n-EN·KO·中文·日本語·FR-4d6bfe)](#-languages)

**English** · [한국어](#-한국어-요약)

<br>

<img src="docs/screenshots/hero.png" alt="Whalex with a satellite mission-control dashboard rendered in its live preview panel" width="900">

<sub><em>A live satellite mission-control dashboard — orbit tracks, streaming telemetry, event log — built by Whalex from one prompt and rendered in its preview panel. About five cents of DeepSeek tokens.</em></sub>

</div>

---

## ✨ What it does

| | | |
|---|---|---|
| 🛠<br>**Local control** | Read, write and edit files; run PowerShell or bash; `glob`, `grep`, `web_fetch` — all scoped to your project folder. | |
| 🎨<br>**Artifact preview** | HTML, SVG, Mermaid and Markdown the agent creates render in a split panel, hot-reloading as it edits. | `present_file` |
| ✅<br>**Self-verification** | `verify_page` opens a page it built in a real browser engine and measures whether it actually draws and animates — so a blank canvas gets caught and fixed, not shipped. | `verify_page` |
| 🌐<br>**Browser use** | Reads pages through the DOM and the accessibility tree, so it can build and test web apps even though DeepSeek is text-only. | `browser_*` |
| 🤖<br>**Sub-agents** | Delegates a scoped job to a child agent with its own context — or fans out a fleet of them in parallel. | `agent`, SuperCode |
| 🎯<br>**Goal mode** | Give it a goal instead of a task; it iterates and self-assesses until the goal is met. | Codex-style loop |
| ⏪<br>**Checkpoints** | `/rewind` restores your files *and* the conversation to any earlier turn. | `/rewind` |
| 🔌<br>**Extensible** | One-click MCP presets, `SKILL.md` skills, git or local plugins, and shell Hooks on tool events. | MCP · Skills · Plugins |
| 🖼<br>**Vision bridge** | Paste an image and a vision model you connect describes it into context — DeepSeek never has to see pixels. | optional |
| ⚡<br>**Fast &amp; current** | Read-only tools run in parallel, rate limits retry themselves, and the app updates itself in place. | auto-update |

## 📸 In action

| SuperCode — multi-agent fan-out | Browser use — self-verification |
|---|---|
| <img src="docs/screenshots/supercode.png" alt="SuperCode progress tree"> | <img src="docs/screenshots/browser-use.png" alt="Browser use reading a calculator page"> |
| **Rewind — restore a checkpoint** | **Home — start with one tap** |
| <img src="docs/screenshots/rewind.png" alt="Rewind dialog"> | <img src="docs/screenshots/home.png" alt="Home screen"> |

## 🚀 Quick start

### Download a build

Grab the installer for your OS from **[Releases](https://github.com/DataHanyang/whalex/releases)**:

| OS | File | Notes |
|---|---|---|
| **Windows** | `Whalex-Setup-0.1.0.exe` | Unsigned → SmartScreen warns on first run. Click **More info → Run anyway**. |
| **Linux** | `Whalex-0.1.0.AppImage` | `chmod +x` then run. |
| **macOS** | `Whalex-0.1.0-mac.zip` | Unsigned/unnotarized — right-click → **Open** to bypass Gatekeeper. |

Then launch it and follow the onboarding: **paste your [DeepSeek API key](https://platform.deepseek.com/api_keys) → pick a folder → go.**

### Or build from source

```bash
git clone https://github.com/DataHanyang/whalex && cd whalex
pnpm install
pnpm dev        # launch the desktop app (run from the repo root)
```

Requirements: **Node ≥ 20**, **pnpm 9**, a **DeepSeek API key**.

## 🧭 How it works

```mermaid
flowchart LR
    U([You: &quot;build X&quot;]) --> A{Agent loop}
    A -->|write_file| F[📄 create files]
    A -->|execute / browser| V[✅ verify]
    A -->|present_file| P[🎨 live preview]
    F --> A
    V --> A
    P --> D([Done])
    A -.needs approval.-> G[/🔒 permission card/]
    G -.you allow.-> A
```

Every write or command is gated by a **permission card** unless you switch modes. Cycle modes with **Shift+Tab**:

| Mode | Behavior |
|---|---|
| **Ask** (default) | Confirm every write / command |
| **Auto-edit** | Auto-approve file edits, still ask for shell |
| **Plan** | Read-only — the agent plans without changing anything |
| **Auto** | Approve everything (a warning banner stays on) |

## 📊 Measured against Codex and Claude Code

Five tasks, same prompts, all three CLIs running full-auto on the same Windows machine. Tokens come from each
tool's own usage report; cost is computed from published rates. Artifacts were **rendered in a
real browser engine** to confirm they work — not just that a file was written.

<table>
<thead>
<tr>
  <th rowspan="2" align="left">Task</th>
  <th colspan="3">⏱ Time</th>
  <th colspan="3">💵 Cost</th>
</tr>
<tr>
  <th>🐋 Whalex</th><th>Codex</th><th>Claude&nbsp;Code</th>
  <th>🐋 Whalex</th><th>Codex</th><th>Claude&nbsp;Code</th>
</tr>
</thead>
<tbody>
<tr>
  <td align="left"><b>Steam locomotive</b><br><sub>canvas animation, night scene</sub></td>
  <td align="right"><b>6m 48s</b></td><td align="right">7m 24s</td><td align="right">14m 18s</td>
  <td align="right"><b>$0.035</b></td><td align="right">$1.11</td><td align="right">$4.35</td>
</tr>
<tr>
  <td align="left"><b>Realistic 3D Earth</b><br><sub>WebGL globe, day/night</sub></td>
  <td align="right"><b>6m 37s</b></td><td align="right">5m 54s</td><td align="right">25m+ <sub>capped</sub></td>
  <td align="right"><b>$0.035</b></td><td align="right">$1.34</td><td align="right">~$7.23<sup>*</sup></td>
</tr>
<tr>
  <td align="left"><b>E-commerce landing page</b><br><sub>single-file storefront</sub></td>
  <td align="right"><b>2m 16s</b></td><td align="right">11m 24s</td><td align="right">3m 59s</td>
  <td align="right"><b>$0.015</b></td><td align="right">$2.41</td><td align="right">$0.93</td>
</tr>
<tr>
  <td align="left"><b>LeetCode classics</b><br><sub>7 problems · 48 hidden tests · all three scored 100%</sub></td>
  <td align="right"><b>20s</b></td><td align="right">1m 08s</td><td align="right">38s</td>
  <td align="right"><b>$0.003</b></td><td align="right">$0.214</td><td align="right">$0.187</td>
</tr>
<tr>
  <td align="left"><b>Spreadsheet formula engine</b><br><sub>parser · error propagation · circular refs · 71 hidden cases · all three scored 100%</sub></td>
  <td align="right">—<sup>†</sup></td><td align="right">11m 56s</td><td align="right">6m 39s</td>
  <td align="right"><b>$0.048</b></td><td align="right">$2.23</td><td align="right">$1.40</td>
</tr>
<tr>
  <th align="left">All five</th>
  <th align="right">—</th><th align="right">37m 45s</th><th align="right">50m 34s</th>
  <th align="right">$0.135</th><th align="right">$7.30<br><sub>54×</sub></th><th align="right">~$14.10<br><sub>104×</sub></th>
</tr>
</tbody>
</table>

```
Total cost, all five tasks (USD)

Whalex      ▏$0.14
Codex       ███████████████▏$7.30     54× more
Claude Code █████████████████████████████▏$14.10  104× more
```

Two tasks carry an objective score, and **all three agents scored 100% on both** — including the
spreadsheet engine, which wants a real parser, error propagation, circular-reference detection and
dependency-ordered recalculation across 71 hidden cases. That is the honest headline: on a
well-specified task these agents all produce correct work, so the table reports time and cost
rather than a column of identical 100%s. The visual tasks are judged by rendering them (below).

DeepSeek's per-token price is what opens the gap: **$0.435/$0.87** per 1M in/out against
**$5/$25** (Opus 5) and **$5/$30** (GPT-5.6 Sol).

### Same prompt, three results

<sub>"Create a single-file HTML/CSS/JS animation of a steam locomotive moving through a night scene —
spinning wheels with connecting rods, steam puffing from the chimney, glowing furnace light, sparks
flying from the track, seamless loop."</sub>

| 🐋 Whalex · **$0.035** | Codex · $1.11 | Claude Code · $4.35 |
|---|---|---|
| <img src="docs/bench/gif/whalex-train.gif" alt="Whalex steam locomotive"> | <img src="docs/bench/gif/codex-train.gif" alt="Codex steam locomotive"> | <img src="docs/bench/gif/claude-train.gif" alt="Claude Code steam locomotive"> |

<sub>"Create a realistic 3D HTML animation of the Earth."</sub>

| 🐋 Whalex · **$0.035** | Codex · $1.34 | Claude Code |
|---|---|---|
| <img src="docs/bench/gif/whalex-earth.gif" alt="Whalex 3D Earth"> | <img src="docs/bench/gif/codex-earth.gif" alt="Codex 3D Earth"> | <img src="docs/bench/gif/claude-earth.gif" alt="Claude Code 3D Earth"> |

<sub>"Build a modern landing page for an online shopping mall as a single self-contained file."</sub>

| 🐋 Whalex · **$0.015** | Codex · $2.41 | Claude Code · $0.93 |
|---|---|---|
| <img src="docs/bench/shots/whalex-shop.jpg" alt="Whalex storefront"> | <img src="docs/bench/shots/codex-shop.jpg" alt="Codex storefront"> | <img src="docs/bench/shots/claude-shop.jpg" alt="Claude Code storefront"> |

<sub>**Honest notes.** Whalex's *first* locomotive attempt failed outright — the night scene drew,
the train never appeared. That failure is exactly why `verify_page` exists: the agent now renders
its own page in a browser engine, sees "only 0.1% of the frame changes", and fixes it. The run in
the table is the one that used it.
**†** The Whalex spreadsheet figure comes from a completed run on a second machine; the attempt on
this one was still self-testing when it hit a 25-minute cap, so its wall-clock time is not
comparable and is left out.
**\*** Claude Code's Earth run was still refining when it hit a 25-minute cap, so its cost is an
estimate — tokens from the session transcript, scaled by the Opus/Haiku mix ratio measured on the
locomotive task; its artifact was finished and scores 100%. Codex's Windows sandbox helper failed
every write on this machine, so it ran with the OS sandbox off — the same full-auto condition as
the others. Four tasks, one run each: enough to show order-of-magnitude cost differences, not
enough to rank model intelligence. Rates verified 16 Aug 2026, with a DeepSeek promotional
discount in effect. Full write-up: [docs/bench/report.html](docs/bench/report.html).</sub>

## 🐳 SuperCode — many agents on one problem

Some jobs are too wide for a single context window: auditing a whole codebase,
weighing five designs against each other, migrating a hundred call sites. **SuperCode**
is Whalex's answer — the agent writes a short orchestration script, and Whalex runs it,
spawning a fleet of sub-agents and streaming their progress back as a live tree.

The point is the split of duties: **the script decides control flow, the agents decide
content.** Loops, fan-out and merging are ordinary code, so they are deterministic and
inspectable; the judgement calls stay with the model.

```js
// The agent writes this; Whalex executes it.
phase('Review')
const DIMENSIONS = ['correctness', 'security', 'performance', 'tests']

const findings = await pipeline(
  DIMENSIONS,
  d => agent(`Review this repo for ${d} issues.`, { label: d, schema: FINDINGS }),
  review => parallel(review.findings.map(f => () =>
    agent(`Try to REFUTE this finding: ${f.title}`, { schema: VERDICT })
      .then(v => ({ ...f, real: !v.refuted }))
  ))
)
return findings.flat().filter(f => f.real)
```

**What the script gets**

| Hook | What it does |
|---|---|
| `agent(prompt, opts)` | Runs a sub-agent. `schema` forces structured JSON back, `label`/`phase` place it in the progress tree. |
| `parallel(thunks)` | Runs tasks concurrently and waits for all of them — a barrier. |
| `pipeline(items, ...stages)` | Runs each item through every stage independently, no barrier between stages, so a fast item finishes while a slow one is still on stage one. |
| `phase(title)` | Starts a new group in the progress tree. |
| `log(msg)` | Writes a line to the run narration. |

**How it runs safely**

- The script executes as an async function with **only those five hooks in scope** — no
  `require`, no `process`, no filesystem, no network. It cannot do anything except ask
  for agents.
- Sub-agent tool calls still pass the **same permission engine** as the main session;
  approvals bubble up to the same cards.
- Hard caps on **agent count and concurrency**, plus a token budget. Whalex shows an
  estimate before starting — *"~12 agents, about $0.15"* — and the running cost ticks up
  in the panel.
- **Explicit opt-in only**: type `supercode` in your prompt, flip the composer switch, or
  run `/supercode on`. It never triggers itself, because a fan-out costs real money.

**Why it is practical here.** A twelve-agent adversarial review on Opus-class pricing is a
decision you think about; on DeepSeek rates the same fan-out lands in the range of a
coffee. Cheap tokens are what make "just run twenty agents at it" a reasonable default
rather than an indulgence.

<img src="docs/screenshots/supercode.png" alt="SuperCode progress tree with phases and per-agent status" width="720">

## 🧩 Extend it

- **MCP servers** — Settings → MCP has one-click presets (filesystem, memory, sequential-thinking, fetch, GitHub, Playwright, …). Or paste any `mcpServers` JSON.
- **Skills** — drop a `SKILL.md` under `~/.whalex/skills/<name>/` (Claude Code-compatible).
- **Plugins** — install from a git URL or a local folder (skills + MCP + commands).
- **Hooks** — run shell commands on `PreToolUse` / `PostToolUse` / `UserPromptSubmit` / `Stop`; a `PreToolUse` hook can block a tool.
- **Feature toggles** — turn sub-agents, SuperCode, browser use, web fetch on/off in Settings.

## 🌐 Languages

UI ships in **English** (default), **한국어**, **中文**, **日本語**, and **Français** — switch in Settings → Language (or **System** to follow your OS).

## 🧪 Development

```bash
pnpm build          # build core packages
pnpm test           # core unit tests (vitest)
pnpm dev            # run the desktop app (from repo root)
pnpm --filter @whalex/desktop dist   # build an installer into apps/desktop/release/
```

CLI harness (drive the core without Electron):

```bash
DEEPSEEK_API_KEY=sk-... pnpm --filter @whalex/cli start "C:\path\to\project"
```

## 📦 Editions

Built with a `WHALEX_EDITION` flag: **`oss`** (default, BYOK + GitHub auto-update) and **`cloud`** (login + hosted API proxy). See [releasing &amp; signing notes](#-releasing--code-signing).

## 🔏 Releasing &amp; code signing

Push a `v*` tag → GitHub Actions builds Windows / macOS / Linux and publishes a **draft** release. Code signing is applied automatically when secrets are present:

- **Windows** — `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`, or Azure Trusted Signing (~$10/mo, removes SmartScreen warnings). Free option for OSS: [SignPath.io](https://signpath.io).
- **macOS** — `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` + `CSC_LINK` (Apple Developer, $99/yr).

## ⚠️ Honest notes

- DeepSeek's API is **text-only** — image understanding and computer-use route through an optional vision model you connect yourself.
- Builds aren't code-signed yet, so you'll see an OS warning on first launch.
- This is an independent open-source project, **not** affiliated with Anthropic, OpenAI, or DeepSeek. Claude Code and Codex are trademarks of their respective owners.

## 📄 License

MIT — see [LICENSE](LICENSE).

---

<a name="-한국어-요약"></a>

## 🇰🇷 한국어 요약

**Whalex** — DeepSeek로 구동되는 오픈소스 **로컬 코딩 에이전트 데스크톱 앱**입니다. Claude Code · Codex처럼 내 폴더에서 코드를 읽고·고치고·실행하고, 만든 걸 앱 안 미리보기로 바로 확인합니다. 내 DeepSeek 키만 연결하면 됩니다(BYOK).

- **로컬 제어** · **아티팩트 미리보기** · **자가 검증(verify_page)** · **브라우저 유즈** · **서브에이전트** · **목표 모드** · **MCP/Skills/플러그인** · **체크포인트/되돌리기** · **Hooks** · **비전 브리지** · **자동 업데이트**
- **슈퍼코드(SuperCode)** — 한 컨텍스트에 안 담기는 큰 일(코드베이스 전수 감사, 설계안 비교, 대량 마이그레이션)에 에이전트 여러 개를 한꺼번에 투입합니다. 에이전트가 짧은 오케스트레이션 스크립트를 쓰면 Whalex가 그걸 실행해 서브에이전트를 팬아웃하고 진행 상황을 트리로 보여줍니다. **제어 흐름(반복·분기·병합)은 코드가, 판단은 모델이** 맡는 구조라 결과가 결정적이고 들여다보기 쉽습니다. 스크립트는 주입된 5개 훅(`agent` `parallel` `pipeline` `phase` `log`)만 쓸 수 있고 파일·네트워크 접근이 없으며, 서브에이전트의 도구 호출도 같은 권한 시스템을 거칩니다. 에이전트 수·동시성·토큰 예산에 상한이 있고 시작 전 예상 비용을 보여줍니다. **명시적으로 켤 때만 동작**합니다(프롬프트에 `supercode`, 컴포저 스위치, `/supercode on`)
- 권한 모드(확인/편집자동/플랜/자동)는 **Shift+Tab**으로 전환
- UI 5개 언어: **English · 한국어 · 中文 · 日本語 · Français**
- 설치: [Releases](https://github.com/DataHanyang/whalex/releases)에서 OS별 설치본 다운로드 → 앱 실행 → DeepSeek 키 입력 → 폴더 선택
- 소스 빌드: `pnpm install && pnpm dev` (저장소 루트에서)

> 참고: DeepSeek API는 텍스트 전용이라 이미지/컴퓨터 유즈는 별도 비전 모델 연결 시 동작합니다. 설치본은 아직 미서명이라 첫 실행 시 OS 경고가 뜹니다.
