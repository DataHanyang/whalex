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

<img src="docs/screenshots/pomodoro-preview.png" alt="Whalex builds a Pomodoro timer and opens it in the live preview panel" width="820">

<sub><em>"Build a Pomodoro timer and open it in the preview" → writes the file, verifies it in a browser, and shows it — in one request.</em></sub>

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

Same prompts, same Windows machine, all three CLIs running full-auto. Tokens come from each
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
  <th align="left">All four</th>
  <th align="right">16m 00s</th><th align="right">25m 49s</th><th align="right">43m 55s</th>
  <th align="right">$0.087</th><th align="right">$5.07<br><sub>58×</sub></th><th align="right">~$12.70<br><sub>145×</sub></th>
</tr>
</tbody>
</table>

```
Total cost, all four tasks (USD)

Whalex      ▏$0.09
Codex       ███████████▏$5.07     58× more
Claude Code ████████████████████████████▏$12.70  145× more
```

Only the LeetCode task has an objective score — all three got every hidden test right, which is
why the table reports time and cost instead of a meaningless row of 100%s. The three visual tasks
are judged by rendering them (below), not by a number.

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
**\*** Claude Code's Earth run was still refining when it hit a 25-minute cap, so its cost is an
estimate — tokens from the session transcript, scaled by the Opus/Haiku mix ratio measured on the
locomotive task; its artifact was finished and scores 100%. Codex's Windows sandbox helper failed
every write on this machine, so it ran with the OS sandbox off — the same full-auto condition as
the others. Four tasks, one run each: enough to show order-of-magnitude cost differences, not
enough to rank model intelligence. Rates verified 16 Aug 2026, with a DeepSeek promotional
discount in effect. Full write-up: [docs/bench/report.html](docs/bench/report.html).</sub>

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

- **로컬 제어** · **아티팩트 미리보기** · **브라우저 유즈** · **서브에이전트/슈퍼코드** · **목표 모드** · **MCP/Skills/플러그인** · **체크포인트/되돌리기** · **Hooks** · **비전 브리지** · **자동 업데이트**
- 권한 모드(확인/편집자동/플랜/자동)는 **Shift+Tab**으로 전환
- UI 5개 언어: **English · 한국어 · 中文 · 日本語 · Français**
- 설치: [Releases](https://github.com/DataHanyang/whalex/releases)에서 OS별 설치본 다운로드 → 앱 실행 → DeepSeek 키 입력 → 폴더 선택
- 소스 빌드: `pnpm install && pnpm dev` (저장소 루트에서)

> 참고: DeepSeek API는 텍스트 전용이라 이미지/컴퓨터 유즈는 별도 비전 모델 연결 시 동작합니다. 설치본은 아직 미서명이라 첫 실행 시 OS 경고가 뜹니다.
