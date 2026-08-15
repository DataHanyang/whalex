# 🐋 Whalex

DeepSeek 모델로 구동되는 로컬 코딩 에이전트 데스크톱 앱. Claude Code / Codex처럼 내 컴퓨터에서 파일을 읽고·고치고·명령을 실행하지만, DeepSeek API를 사용합니다. BYOK(Bring Your Own Key) — 사용자가 자신의 DeepSeek API 키를 직접 연결해서 씁니다.

## 주요 기능 (M1)

- **에이전트 루프**: DeepSeek OpenAI 호환 API에 대한 스트리밍 + 도구 호출 루프
- **내장 도구 7종**: `read_file`, `write_file`, `edit_file`, `execute`(PowerShell), `glob`, `grep`(ripgrep), `todo_write`
- **권한 시스템**: `default` / `acceptEdits` / `bypassPermissions` / `plan` 모드, allow/deny 규칙, 인라인 승인 카드
- **세션**: 프로젝트별 JSONL 저장 + 재개
- **UI/UX**: 스트리밍 마크다운(shiki 하이라이트), 도구 카드, Diff 뷰어, 온보딩 위저드, 다크/라이트 테마, 한/영 i18n
- **모델 선택**: `GET /models` 동적 조회 (deepseek-v4-flash / deepseek-v4-pro)
- **자동 업데이트 기반**: electron-updater + blockmap (GitHub Releases 연결 시 활성화)

로드맵(M2 권한·MCP·아티팩트 패널, M3 Skills·플러그인·서브에이전트, M4 슈퍼코드 멀티에이전트, M5 브라우저 유즈·비전 브리지)은 `~/.claude/plans/`의 설계 문서를 참고.

## 구조 (pnpm 모노레포)

```
packages/shared   타입 + zod 계약 (IPC, 이벤트, 설정, 권한)
packages/core     에이전트 코어 (Electron 의존성 없음 — 재사용 가능)
packages/cli      헤드리스 하네스 (코어 테스트/CI)
apps/desktop      Electron 앱 (electron-vite + React 19 + Tailwind v4)
```

## 개발

```bash
pnpm install
pnpm build          # 코어 패키지 빌드
pnpm dev            # 데스크톱 앱 개발 실행
pnpm --filter @whalex/desktop dist   # NSIS 설치본 생성 (release/)
```

### CLI로 코어 테스트

```bash
DEEPSEEK_API_KEY=sk-... pnpm --filter @whalex/cli start "C:\내\프로젝트"
```

## 요구 사항

- Node.js ≥ 20, pnpm 9
- DeepSeek API 키 ([platform.deepseek.com](https://platform.deepseek.com/api_keys))

## 라이선스

MIT
