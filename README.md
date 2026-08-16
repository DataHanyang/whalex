<div align="center">

<img src="docs/logo.png" alt="WhaleX" width="380">

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

<img src="docs/screenshots/hero.png" alt="Live satellite constellation over a NASA-textured Earth, built by WhaleX from one prompt" width="900">

<sub><em>Built by WhaleX from a single prompt and self-verified with its own <code>verify_page</code> tool: a NASA-textured Earth with a live 8-satellite constellation, orbit tracks, altitude HUD and ground stations. About four cents of DeepSeek tokens.</em></sub>

</div>

---

## 🐳 What is WhaleX?

WhaleX is an open-source **coding-agent desktop app in the mould of Claude Code and Codex,
running on your own DeepSeek API key**. You point it at a folder and talk to it; it reads,
writes and runs code there, opens what it built in a live preview, and asks before doing
anything risky.

Three ideas drive it:

1. **Local-first.** Everything happens on your machine — your files, your shell, your key
   (stored with OS-level encryption). No account, no telemetry, no middleman.
2. **Verify, don't hope.** The agent renders its own HTML in a real browser engine, reads
   consoles and DOMs, and measures whether an animation actually moves before calling a job
   done.
3. **Cheap enough to be bold.** DeepSeek tokens cost 1–2% of frontier rates, so agent fleets
   (SuperCode), goal loops and heavy iteration are everyday tools rather than splurges —
   the [benchmark below](#-measured-against-codex-and-claude-code) puts numbers on it.

## ✨ What it does

| | | |
|---|---|---|
| 🛠 **Local control** | Read, write and edit files; run PowerShell or bash; `glob`, `grep`, `web_fetch` — all scoped to your project folder. | |
| 🎨 **Artifact preview** | HTML, SVG, Mermaid and Markdown the agent creates render in a split panel, hot-reloading as it edits. | `present_file` |
| ✅ **Self-verification** | `verify_page` opens a page it built in a real browser engine and measures whether it actually draws and animates — so a blank canvas gets caught and fixed, not shipped. | `verify_page` |
| 🌐 **Browser use** | Reads pages through the DOM and the accessibility tree, so it can build and test web apps even though DeepSeek is text-only. | `browser_*` |
| 🤖 **Sub-agents** | Delegates a scoped job to a child agent with its own context — or fans out a fleet of them in parallel. | `agent`, SuperCode |
| 🎯 **Goal mode** | Give it a goal instead of a task; it iterates and self-assesses until the goal is met. | Codex-style loop |
| ⏪ **Checkpoints** | `/rewind` restores your files *and* the conversation to any earlier turn. | `/rewind` |
| 🔌 **Extensible** | One-click MCP presets, `SKILL.md` skills, git or local plugins, and shell Hooks on tool events. | MCP · Skills · Plugins |
| 🖼 **Vision bridge** | Paste an image and a vision model you connect describes it into context — DeepSeek never has to see pixels. | optional |
| ⚡ **Fast &amp; current** | Read-only tools run in parallel, rate limits retry themselves, and the app updates itself in place. | auto-update |

## 📸 In action

| Browser use — searches Google, reads the results back | Excel artifact — a workbook rendered with sheet tabs |
|---|---|
| <img src="docs/screenshots/browser-use.png" alt="Agent searches Google for DeepSeek V4 benchmark and lists the result titles"> | <img src="docs/screenshots/excel.png" alt="A 12-month P&L workbook rendered as a spreadsheet artifact"> |
| **Thinking effort — click the level, drag the slider** | **Home — pick an example or just type** |
| <img src="docs/screenshots/effort.png" alt="Thinking-effort slider from Off to Extra"> | <img src="docs/screenshots/home.png" alt="English home screen with example prompts"> |

## 🚀 Quick start

### Install

Grab your OS installer from **[Releases](https://github.com/DataHanyang/whalex/releases)** —
step-by-step instructions per OS are [at the bottom of this page](#-installing-per-os).
Then launch it: **paste your [DeepSeek API key](https://platform.deepseek.com/api_keys) →
pick a folder → go.**

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

<p align="center">
  <img src="docs/graphs/bench-total.svg" alt="Total cost: WhaleX $0.135 vs Codex $7.30 (54x) vs Claude Code ~$14.10 (104x). Total time: 32m 49s vs 37m 45s vs 50m 34s." width="920">
</p>

<p align="center">
  <img src="docs/graphs/bench-tasks.svg" alt="Per-task time and cost for all five benchmark tasks across WhaleX, Codex and Claude Code." width="920">
</p>

<details>
<summary>Raw numbers (table)</summary>

<table>
<thead>
<tr>
  <th rowspan="2" align="left">Task</th>
  <th colspan="3">⏱ Time</th>
  <th colspan="3">💵 Cost</th>
</tr>
<tr>
  <th>🐋 WhaleX</th><th>Codex</th><th>Claude&nbsp;Code</th>
  <th>🐋 WhaleX</th><th>Codex</th><th>Claude&nbsp;Code</th>
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
  <td align="right"><b>8m 34s</b><sup>†</sup></td><td align="right">11m 56s</td><td align="right">6m 39s</td>
  <td align="right"><b>$0.048</b></td><td align="right">$2.23</td><td align="right">$1.40</td>
</tr>
<tr>
  <th align="left">All five</th>
  <th align="right">32m 49s</th><th align="right">37m 45s</th><th align="right">50m 34s</th>
  <th align="right">$0.135</th><th align="right">$7.30<br><sub>54×</sub></th><th align="right">~$14.10<br><sub>104×</sub></th>
</tr>
</tbody>
</table>

</details>

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

| 🐋 WhaleX · **$0.035** | Codex · $1.11 | Claude Code · $4.35 |
|---|---|---|
| <img src="docs/bench/gif/whalex-train.gif" alt="WhaleX steam locomotive"> | <img src="docs/bench/gif/codex-train.gif" alt="Codex steam locomotive"> | <img src="docs/bench/gif/claude-train.gif" alt="Claude Code steam locomotive"> |

<sub>"Create a realistic 3D HTML animation of the Earth."</sub>

| 🐋 WhaleX · **$0.035** | Codex · $1.34 | Claude Code |
|---|---|---|
| <img src="docs/bench/gif/whalex-earth.gif" alt="WhaleX 3D Earth"> | <img src="docs/bench/gif/codex-earth.gif" alt="Codex 3D Earth"> | <img src="docs/bench/gif/claude-earth.gif" alt="Claude Code 3D Earth"> |

<sub>"Build a modern landing page for an online shopping mall as a single self-contained file."</sub>

| 🐋 WhaleX · **$0.015** | Codex · $2.41 | Claude Code · $0.93 |
|---|---|---|
| <img src="docs/bench/shots/whalex-shop.jpg" alt="WhaleX storefront"> | <img src="docs/bench/shots/codex-shop.jpg" alt="Codex storefront"> | <img src="docs/bench/shots/claude-shop.jpg" alt="Claude Code storefront"> |

<sub>**Method.** All three CLIs ran full-auto with identical prompts on the same machine; every
visual artifact was rendered in a real browser engine and checked with `verify_page` before
scoring. Token counts come from each tool's own usage report.
**†** Completed run measured on a second machine. **\*** Estimated from the session transcript
(the run passed a 25-minute cap; its artifact scores 100%). One run per task — enough to show
order-of-magnitude cost differences, not to rank model intelligence. Rates verified 16 Aug 2026.
Full write-up: [docs/bench/report.html](docs/bench/report.html).</sub>

## 🐳 SuperCode — many agents on one problem

Some jobs are too wide for a single context window: auditing a whole codebase,
weighing five designs against each other, migrating a hundred call sites. **SuperCode**
is WhaleX's answer — the agent writes a short orchestration script, and WhaleX runs it,
spawning a fleet of sub-agents and streaming their progress back as a live tree.
It is deliberately a scale-first mode: a serious task decomposes into many small,
sharply-scoped agents — dozens routinely, hundreds for big jobs (up to 400 by
default) — with judge panels, adversarial verification and loop-until-dry rounds
composing them into one high-confidence result. DeepSeek's pricing is what makes
that practical: a 100-agent fleet costs cents, not dollars.

The point is the split of duties: **the script decides control flow, the agents decide
content.** Loops, fan-out and merging are ordinary code, so they are deterministic and
inspectable; the judgement calls stay with the model.

```js
// The agent writes this; WhaleX executes it.
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
- Hard caps on **agent count and concurrency**, plus a token budget. WhaleX shows an
  estimate before starting — *"~12 agents, about $0.15"* — and the running cost ticks up
  in the panel.
- **Explicit opt-in only**: type `supercode` in your prompt, flip the composer switch, or
  run `/supercode on`. It never triggers itself, because a fan-out costs real money.

**Why it is practical here.** A twelve-agent adversarial review on Opus-class pricing is a
decision you think about; on DeepSeek rates the same fan-out lands in the range of a
coffee. Cheap tokens are what make "just run twenty agents at it" a reasonable default
rather than an indulgence.

<img src="docs/screenshots/supercode.png" alt="A SuperCode run: three agents review tetris.html in parallel, the progress card shows 4/4 done with phases and token count, and the reply merges a ranked top-3" width="900">

## 🧩 Extend it

- **MCP servers** — Settings → MCP has one-click presets (filesystem, memory, sequential-thinking, fetch, GitHub, Playwright, Excel, PowerPoint, Gmail, …). Or paste any `mcpServers` JSON.
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

## 📝 Notes

- DeepSeek's API is **text-only** — image understanding and computer-use route through an optional vision model you connect yourself.
- Builds aren't code-signed yet, so you'll see an OS warning on first launch.
- This is an independent open-source project, **not** affiliated with Anthropic, OpenAI, or DeepSeek. Claude Code and Codex are trademarks of their respective owners.

## 💾 Installing, per OS

### Windows
1. Download **`WhaleX-Setup-0.1.0.exe`** from [Releases](https://github.com/DataHanyang/whalex/releases).
2. Run it. SmartScreen will warn because the build is unsigned — click **More info → Run anyway**.
3. The app installs per-user (no admin rights needed) and creates Start-menu and desktop shortcuts.
4. First launch: paste your DeepSeek API key, pick a working folder, choose a permission mode.
5. Updates arrive in-app — a toast appears, one click restarts into the new version.

### macOS (Apple Silicon)
1. Download **`WhaleX-0.1.0-arm64-mac.zip`** and unzip it.
2. Drag **WhaleX.app** into **Applications**.
3. The app is unsigned/un-notarised, so plain double-click is blocked: **right-click → Open → Open**
   (needed only once). On newer macOS you may instead need **System Settings → Privacy & Security →
   "Open Anyway"**.
4. First launch: key → folder → go, same as Windows.

### Linux
1. Download **`WhaleX-0.1.0.AppImage`**.
2. Make it executable and run:
   ```bash
   chmod +x WhaleX-0.1.0.AppImage
   ./WhaleX-0.1.0.AppImage
   ```
3. If your distro lacks FUSE 2 (`libfuse.so.2` error): install `libfuse2`, or run with
   `--appimage-extract-and-run`.
4. Optional: use [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) for a menu
   entry and desktop integration.

### From source (all platforms)
```bash
git clone https://github.com/DataHanyang/whalex && cd whalex
pnpm install
pnpm dev                              # run the app in dev mode
pnpm --filter @whalex/desktop dist    # or build an installer
```
Requirements: **Node ≥ 20**, **pnpm 9**, a **DeepSeek API key**.

## 📄 License

MIT — see [LICENSE](LICENSE).

---

<a name="-한국어-요약"></a>

## 🇰🇷 한국어 요약

**WhaleX** — DeepSeek로 구동되는 오픈소스 **로컬 코딩 에이전트 데스크톱 앱**입니다. Claude Code · Codex처럼 내 폴더에서 코드를 읽고·고치고·실행하고, 만든 걸 앱 안 미리보기로 바로 확인합니다. 내 DeepSeek 키만 연결하면 됩니다(BYOK).

- **로컬 제어** · **아티팩트 미리보기** · **자가 검증(verify_page)** · **브라우저 유즈** · **서브에이전트** · **목표 모드** · **MCP/Skills/플러그인** · **체크포인트/되돌리기** · **Hooks** · **비전 브리지** · **자동 업데이트**
- **슈퍼코드(SuperCode)** — 한 컨텍스트에 안 담기는 큰 일(코드베이스 전수 감사, 설계안 비교, 대량 마이그레이션)에 에이전트 여러 개를 한꺼번에 투입합니다. 에이전트가 짧은 오케스트레이션 스크립트를 쓰면 Whalex가 그걸 실행해 서브에이전트를 팬아웃하고 진행 상황을 트리로 보여줍니다. **제어 흐름(반복·분기·병합)은 코드가, 판단은 모델이** 맡는 구조라 결과가 결정적이고 들여다보기 쉽습니다. 스크립트는 주입된 5개 훅(`agent` `parallel` `pipeline` `phase` `log`)만 쓸 수 있고 파일·네트워크 접근이 없으며, 서브에이전트의 도구 호출도 같은 권한 시스템을 거칩니다. 에이전트 수·동시성·토큰 예산에 상한이 있고 시작 전 예상 비용을 보여줍니다. **명시적으로 켤 때만 동작**합니다(프롬프트에 `supercode`, 컴포저 스위치, `/supercode on`)
- 권한 모드(확인/편집자동/플랜/자동)는 **Shift+Tab**으로 전환
- UI 5개 언어: **English · 한국어 · 中文 · 日本語 · Français**
- 설치: [Releases](https://github.com/DataHanyang/whalex/releases)에서 OS별 설치본 다운로드 → 앱 실행 → DeepSeek 키 입력 → 폴더 선택
- 소스 빌드: `pnpm install && pnpm dev` (저장소 루트에서)

> 참고: DeepSeek API는 텍스트 전용이라 이미지/컴퓨터 유즈는 별도 비전 모델 연결 시 동작합니다. 설치본은 아직 미서명이라 첫 실행 시 OS 경고가 뜹니다.
