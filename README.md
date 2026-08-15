<div align="center">

<img src="apps/desktop/build/icon.png" alt="Whalex" width="96" height="96">

# 🐋 Whalex

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

<table>
<tr>
<td width="33%" valign="top">

**🛠 Local control**
Read / write / edit files, run PowerShell &amp; bash, `glob`, `grep`, `web_fetch` — right in your project folder.

</td>
<td width="33%" valign="top">

**🎨 Artifact preview**
Renders the HTML / SVG / Mermaid / Markdown the agent creates in a split panel — no leaving the app.

</td>
<td width="33%" valign="top">

**🌐 Browser use**
The agent opens and reads pages via the DOM, so it can build &amp; test web apps despite DeepSeek being text-only.

</td>
</tr>
<tr>
<td valign="top">

**🤖 Sub-agents &amp; SuperCode**
Delegate to a sub-agent, or fan out a whole fleet of agents in parallel.

</td>
<td valign="top">

**🎯 Goal mode**
Give a goal; it iterates on its own, self-evaluating until the goal is met (Codex-style loop).

</td>
<td valign="top">

**⏪ Checkpoints &amp; rewind**
`/rewind` restores files **and** the conversation to any earlier point.

</td>
</tr>
<tr>
<td valign="top">

**🔌 MCP · Skills · Plugins**
One-click MCP presets, `SKILL.md` skills, git/local plugins, and Hooks.

</td>
<td valign="top">

**🖼 Vision bridge**
Paste an image → a vision model describes it → injected into context.

</td>
<td valign="top">

**⚡ Fast &amp; auto-updating**
Parallel read-only tools (~2.75×), rate-limit retries, in-app auto-update.

</td>
</tr>
</table>

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

## 🧩 Extend it

- **MCP servers** — Settings → MCP has one-click presets (filesystem, memory, sequential-thinking, fetch, GitHub, Playwright, …). Or paste any `mcpServers` JSON.
- **Skills** — drop a `SKILL.md` under `~/.whalex/skills/<name>/` (Claude Code-compatible).
- **Plugins** — install from a git URL or a local folder (skills + MCP + commands).
- **Hooks** — run shell commands on `PreToolUse` / `PostToolUse` / `UserPromptSubmit` / `Stop`; a `PreToolUse` hook can block a tool.
- **Feature toggles** — turn sub-agents, SuperCode, browser use, web fetch on/off in Settings.

## 🆚 How it compares

| Feature | **Whalex** | Claude Code | Codex |
|---|:---:|:---:|:---:|
| Local file &amp; shell control | ✅ | ✅ | ✅ |
| Permission modes (incl. Plan) | ✅ | ✅ | ◐ |
| MCP · Skills · Plugins | ✅ | ✅ | – |
| Sub-agents · multi-agent | ✅ | ✅ | ◐ |
| Goal loop | ✅ | – | ✅ |
| Artifact / browser preview | ✅ | ✅ | ◐ |
| Checkpoints · rewind · Hooks | ✅ | ✅ | – |
| **Model** | **DeepSeek** | Claude | GPT |

## 🏗 Architecture

```mermaid
flowchart LR
    S["@whalex/shared<br/><sub>types · zod · IPC</sub>"] --> C
    C["@whalex/core<br/><sub>agent loop · tools · MCP<br/>sessions · workflow<br/>(Electron-free)</sub>"] --> D["apps/desktop<br/><sub>Electron · React · Tailwind</sub>"]
    C --> L["packages/cli<br/><sub>headless harness · CI</sub>"]
    C --> W["Whalex Cloud<br/><sub>subscription proxy (future)</sub>"]
```

The agent **core** has no UI dependency, so the desktop app, CLI harness, tests, and a future hosted edition all reuse it unchanged.

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
