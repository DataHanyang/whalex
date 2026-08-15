# 🐋 Whalex

> **DeepSeek로 구동되는 로컬 코딩 에이전트 데스크톱 앱.** Claude Code / Codex처럼 내 컴퓨터에서 파일을 읽고·고치고·명령을 실행하고, 만든 걸 바로 미리보기로 확인합니다. BYOK — 내 DeepSeek API 키를 직접 연결해서 씁니다.

<p align="center">
  <img src="docs/screenshots/pomodoro-preview.png" alt="Whalex가 뽀모도로 타이머를 만들고 미리보기 패널에 띄운 화면" width="800">
</p>

<p align="center">
  <em>"뽀모도로 타이머 만들고 미리보기로 띄워줘" → 파일 생성 · 브라우저로 자가 검증 · 미리보기 표출까지 한 번에</em>
</p>

## ✨ 무엇을 하나

- 🛠 **로컬 제어** — 파일 읽기/쓰기/편집, PowerShell 실행, glob/grep(ripgrep), 웹 가져오기
- 🔒 **권한 시스템** — 확인 / 편집 자동 / 플랜 / 전체 자동 모드(Shift+Tab 순환), allow·deny 규칙, 인라인 승인 카드
- 🎨 **아티팩트 미리보기** — 만든 HTML/SVG/Mermaid/마크다운을 앱 안 패널에서 바로 렌더
- 🌐 **브라우저 유즈** — DOM 기반으로 웹앱을 열고·읽고·조작 (DeepSeek 텍스트 전용 제약을 우회)
- 🤖 **서브에이전트 & 슈퍼코드** — 하위 에이전트 위임 + 대규모 멀티 에이전트 오케스트레이션
- 🎯 **목표 모드(Goal Loop)** — 목표를 주면 완료까지 자율 반복 (Codex 스타일)
- 🔌 **MCP · Skills · 플러그인** — 추천 MCP 서버 원클릭, SKILL.md, git/로컬 플러그인
- ⏪ **체크포인트/되돌리기** — 파일·대화를 이전 지점으로 복원 (`/rewind`)
- 🪝 **Hooks** — PreToolUse/PostToolUse 등 이벤트에 셸 커맨드 연결
- 🖼 **비전 브리지** — 이미지 붙여넣기 → 비전 모델로 설명 → 컨텍스트 주입
- ⚡ **성능** — 읽기 전용 도구 병렬 실행(≈2.75x), rate-limit 자동 재시도
- 🔄 **자동 업데이트** — 재설치 없이 알림 → 클릭 → 재시작으로 갱신

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/supercode.png" alt="슈퍼코드 멀티 에이전트 진행 트리"><br><sub><b>슈퍼코드</b> — 여러 에이전트가 병렬로 팬아웃, 진행 트리와 토큰·비용 실시간 표시</sub></td>
    <td width="50%"><img src="docs/screenshots/browser-use.png" alt="브라우저 유즈로 계산기 페이지를 읽는 화면"><br><sub><b>브라우저 유즈</b> — 만든 웹앱을 열어 DOM을 읽고 직접 검증</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/rewind.png" alt="되돌리기 다이얼로그"><br><sub><b>되돌리기</b> — 체크포인트에서 파일·대화를 이전 상태로 복원</sub></td>
    <td width="50%"><img src="docs/screenshots/home.png" alt="Whalex 홈 화면"><br><sub><b>홈</b> — 클릭 가능한 예시로 바로 시작, 다크/라이트·한영 지원</sub></td>
  </tr>
</table>

## 기본 도구 7종 + 확장

내장: `read_file` · `write_file` · `edit_file` · `execute`(PowerShell) · `glob` · `grep`(ripgrep) · `todo_write`
확장: `web_fetch` · `present_file`(아티팩트) · `browser_*` · `computer_*`(실험) · `agent`(서브에이전트) · `workflow`(슈퍼코드) · MCP 도구 · Skills
- **자동 업데이트 기반**: electron-updater + blockmap (GitHub Releases 연결 시 활성화)

로드맵(M2 권한·MCP·아티팩트 패널, M3 Skills·플러그인·서브에이전트, M4 슈퍼코드 멀티에이전트, M5 브라우저 유즈·비전 브리지)은 `~/.claude/plans/`의 설계 문서를 참고.

## 구조 (pnpm 모노레포)

```
packages/shared   타입 + zod 계약 (IPC, 이벤트, 설정, 권한)
packages/core     에이전트 코어 (Electron 의존성 없음 — 재사용 가능)
packages/cli      헤드리스 하네스 (코어 테스트/CI)
apps/desktop      Electron 앱 (electron-vite + React 19 + Tailwind v4)
```

## 전체 기능 (M1~M5)

- **M1** 에이전트 루프·도구 7종·권한·세션·온보딩
- **M2** MCP 서버, 아티팩트/프리뷰 패널, 슬래시 커맨드, @-파일 멘션, 설정 모달, 컴팩션, 자동 업데이트
- **M3** 서브에이전트(`agent`), Skills, 플러그인
- **M4** 슈퍼코드 — 멀티 에이전트 워크플로 오케스트레이션
- **M5** 브라우저 유즈(DOM 기반), 비전 브리지(이미지→텍스트 사이드카), 컴퓨터 유즈(실험적)
- 성능: 읽기 전용 도구 병렬 실행, rate-limit 자동 재시도

## 개발

```bash
pnpm install
pnpm build          # 코어 패키지 빌드
pnpm dev            # 데스크톱 앱 개발 실행 (반드시 repo 루트에서)
pnpm test           # 코어 단위 테스트 (vitest)
pnpm --filter @whalex/desktop dist   # 설치본 생성 (apps/desktop/release/)
```

### CLI로 코어 테스트

```bash
DEEPSEEK_API_KEY=sk-... pnpm --filter @whalex/cli start "C:\내\프로젝트"
```

## 에디션

빌드 시 `WHALEX_EDITION` 환경변수로 두 버전을 만듭니다:
- `oss` (기본) — BYOK, GitHub Releases 자동 업데이트
- `cloud` — 로그인 + 호스팅 API 프록시, 자체 업데이트 피드

## 설치 시 주의 (미서명 빌드)

현재 Windows 설치본은 코드 서명이 없어, 처음 실행 시 SmartScreen "Windows가 PC를 보호했습니다" 경고가 뜰 수 있습니다. **추가 정보 → 실행**을 눌러 실행하세요. 1.0 전 Azure Trusted Signing 도입 시 이 경고가 사라집니다.

## 배포 / 코드 서명

`.github/workflows/release.yml` — 태그(`v*`) 푸시 시 3개 OS 설치본을 빌드해 **draft** 릴리스로 발행합니다. 코드 서명은 시크릿이 있으면 자동 적용:
- **Windows**: `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` (또는 electron-builder.yml의 Azure Trusted Signing 설정). 미서명 시 SmartScreen 경고 발생 → 1.0/구독 버전 전 Azure Trusted Signing(~$10/월) 도입 권장
- **macOS**: `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` + `CSC_LINK` (Apple Developer $99/yr)

## 요구 사항

- Node.js ≥ 20, pnpm 9
- DeepSeek API 키 ([platform.deepseek.com](https://platform.deepseek.com/api_keys))
- (선택) 비전 모델 — 이미지/컴퓨터 유즈용. 로컬 Ollama LLaVA 무료

## 라이선스

MIT
