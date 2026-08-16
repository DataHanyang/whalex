# Promo copy for WhaleX

Ready-to-paste blurbs for different channels. Swap the download/link line once a
release is published.

---

## One-liner

**WhaleX — an open-source, local coding agent desktop app powered by DeepSeek.** Like Claude Code / Codex, but bring your own DeepSeek key.

---

## Hacker News / Reddit (English)

**Show HN: WhaleX – a local coding-agent desktop app powered by DeepSeek**

I wanted Claude Code's workflow but running on DeepSeek, so I built WhaleX — an Electron desktop app where a DeepSeek agent reads, edits, and runs code in a folder on your machine, and shows you what it built in a live preview.

What it does:

- Local tools: read / write / edit files, run PowerShell/bash, glob, grep, web fetch
- Permission modes (Ask / Auto-edit / Plan / Auto), inline approval cards
- Artifact preview panel — renders HTML/SVG/Mermaid/Markdown the agent creates
- Browser use — the agent opens and reads pages via the DOM (works around DeepSeek being text-only)
- Sub-agents + "SuperCode" multi-agent fan-out
- Goal mode (Codex-style loop that self-evaluates until the goal is met)
- MCP servers (one-click presets), Skills, plugins, Hooks
- Checkpoints + `/rewind` to restore files and conversation
- Vision bridge: paste an image → a vision model describes it → injected into context
- Auto-update, English/Korean UI

It's BYOK (your own DeepSeek API key), MIT-licensed, and runs on Windows/macOS/Linux.

Repo: https://github.com/DataHanyang/whalex

Honest notes: DeepSeek's API is text-only, so image/computer-use go through an optional vision model you connect separately. The Windows installer isn't code-signed yet, so SmartScreen will warn on first run.

---

## GeekNews / 커뮤니티 (한국어)

**WhaleX — DeepSeek로 구동되는 오픈소스 로컬 코딩 에이전트**

Claude Code · Codex의 워크플로를 DeepSeek로 쓰고 싶어서 만든 Electron 데스크톱 앱입니다. DeepSeek 에이전트가 내 폴더에서 코드를 읽고·고치고·실행하고, 만든 걸 앱 안 미리보기로 바로 보여줍니다.

주요 기능:

- 로컬 도구: 파일 읽기/쓰기/편집, PowerShell·bash 실행, glob/grep, 웹 가져오기
- 권한 모드(확인/편집 자동/플랜/자동) + 인라인 승인 카드
- 아티팩트 미리보기 — 만든 HTML·SVG·Mermaid·마크다운을 앱에서 렌더
- 브라우저 유즈 — DOM 기반으로 페이지를 열고 읽음(텍스트 전용 모델의 한계 우회)
- 서브에이전트 + 슈퍼코드(멀티 에이전트 팬아웃)
- 목표 모드 — 목표를 주면 완료까지 자율 반복(코덱스 스타일)
- MCP 서버(원클릭 프리셋) · Skills · 플러그인 · Hooks
- 체크포인트 + `/rewind`로 파일·대화 복원
- 비전 브리지: 이미지 붙여넣기 → 비전 모델 설명 → 컨텍스트 주입
- 자동 업데이트, 영어/한국어 UI

BYOK(내 DeepSeek 키 연결), MIT 라이선스, Windows/macOS/Linux 지원.

저장소: https://github.com/DataHanyang/whalex

솔직한 참고: DeepSeek API는 텍스트 전용이라 이미지/컴퓨터 유즈는 별도 비전 모델을 연결해야 동작합니다. Windows 설치본은 아직 코드 서명 전이라 첫 실행 시 SmartScreen 경고가 뜹니다.

---

## X / Twitter (English)

🐋 WhaleX — a local coding agent for your desktop, powered by DeepSeek.

Reads, edits & runs code in your folder. Live preview of what it builds. Browser use, sub-agents, goal mode, MCP, checkpoints/rewind.

BYOK · MIT · Win/mac/Linux
→ github.com/DataHanyang/whalex

---

## Tags

`deepseek` `coding-agent` `electron` `desktop-app` `ai-agent` `mcp` `open-source` `byok` `llm`
