# WhaleX 홍보 킷 (v0.2.0)

바로 붙여넣기용 초안. 채널별 톤 맞춤. 게시는 계정 주인이 직접.

---

## 1) Hacker News — Show HN

**Title:**
Show HN: WhaleX – Claude Code-style agent on your own DeepSeek key (1/50th cost)

**Body:**
I built an open-source coding-agent desktop app that works like Claude Code or Codex, but runs on your own DeepSeek API key.

Why: DeepSeek V4 costs $0.435/$0.87 per 1M tokens vs $5/$25+ for frontier models. I wanted to know whether the agent-harness patterns (plan mode, permission gates, MCP, skills, sub-agent fleets) survive the model swap. They mostly do.

Numbers from a five-task head-to-head on one machine (same prompts, full-auto, artifacts verified in a real browser engine): WhaleX $0.135 total vs Codex $7.30 vs Claude Code ~$14.10. All three scored 100% on the two objectively-scored tasks — on well-specified work the gap is cost and time, not correctness. Full method + raw numbers in the repo.

The fun part is SuperCode: an Ultracode-style orchestration mode. Toggle it and the session auto-switches to the strongest model at max reasoning, runs a 3-explorer+1-critic recon fleet, interviews you (including how much budget to spend), presents a plan, then executes with parallel agent fleets — judge panels, adversarial verification. The README hero image is a real-time tracker of 10,961 satellites it built end-to-end from one prompt. Same brief to a solo agent took 45% longer; both cost single-digit dollars where the same token volume at frontier rates would be $120–290.

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

## 3) X / Twitter 스레드 (EN)

1/ Claude Code costs add up. DeepSeek tokens cost 1/50th. So I built WhaleX — an open-source coding-agent desktop app that runs the same workflows on your own DeepSeek key. 🐋

2/ Five-task benchmark, same prompts, same machine, full-auto:
WhaleX $0.135 · Codex $7.30 · Claude Code ~$14.10
Both scored tasks: all three hit 100%. The gap on specified work is cost, not correctness.

3/ The flagship mode is SuperCode — Ultracode-class orchestration. Recon fleet → budget interview → plan → parallel agent fleets with judge panels + adversarial verification. This tracker of 10,961 live satellites came from ONE prompt: [히어로 이미지 첨부]

4/ Same prompt, solo agent: excellent result too — 45% slower. Fleet ~57M tokens ≤$26 list (real bill far lower with caching). Same volume at frontier rates: ~$290. That's the whole thesis: cheap tokens make fleets a default, not a splurge.

5/ Win/mac/Linux. BYOK, zero telemetry, secrets masked before anything leaves your machine. MIT.
https://github.com/leejoong/whalex

---

## 4) X / Twitter 스레드 (KR)

1/ 클로드 코드 토큰비가 부담돼서 만들었습니다. WhaleX — 내 DeepSeek 키로 도는 오픈소스 코딩 에이전트 데스크톱 앱. 같은 워크플로를 1/50 가격으로. 🐋

2/ 동일 프롬프트 5개 과제 실측: WhaleX $0.135 vs Codex $7.30 vs Claude Code ~$14.10. 채점 가능한 과제는 셋 다 100점 — 명세가 정확하면 차이는 정확도가 아니라 비용과 시간입니다.

3/ 간판 기능은 슈퍼코드(SuperCode): 정찰 함대(탐색3+비평1) → 예산 인터뷰 → 계획 승인 → 병렬 함대 실행(심사 패널·적대적 검증). 프롬프트 한 줄로 나온 실시간 인공위성 10,961개 트래커: [히어로 이미지]

4/ 같은 프롬프트를 단일 에이전트에게 주면? 품질은 훌륭한데 45% 느립니다. 함대 ~5,700만 토큰이 정가 상한 $26 — 같은 볼륨을 프론티어 단가로 돌리면 ~$290. 싼 토큰이 함대를 '기본값'으로 만듭니다.

5/ 윈도우/맥/리눅스. BYOK, 텔레메트리 없음, 키·토큰은 요청 전 마스킹. MIT 라이선스.
https://github.com/leejoong/whalex

---

## 5) GeekNews (news.hada.io) 제출

**제목:** WhaleX — 내 DeepSeek 키로 돌리는 오픈소스 Claude Code 대안 (5과제 실측 1/50 비용)

**요약(본문):**
Claude Code/Codex 스타일의 코딩 에이전트 데스크톱 앱입니다. BYOK(자기 API 키), Electron, MIT.

- 플랜 모드(수락/수정/거절), 권한 시스템, MCP, Claude Code 호환 스킬, 체크포인트/되돌리기, 내장 멀티탭 브라우저, 자동 업데이트
- 슈퍼코드: 울트라코드급 멀티에이전트 오케스트레이션 — 정찰 함대, 예산 인터뷰, 심사 패널, 적대적 검증. 프롬프트 하나로 실시간 위성 10,961개 트래커를 끝까지 만들어낸 게 README 대표 이미지입니다
- 5과제 동일 프롬프트 실측: $0.135 vs Codex $7.30 vs Claude Code ~$14.10 (채점 과제는 셋 다 100%)
- 프라이버시: 텔레메트리 없음, 시크릿(키·토큰) 요청 전 자동 마스킹, Ollama 등 로컬 엔드포인트 지원

https://github.com/leejoong/whalex

---

## 게시 팁
- Show HN은 화·수 오전(미국 동부) 게시가 노출에 유리
- 첫 1시간 댓글 응대가 랭킹에 결정적 — 게시 직후 대기
- X 스레드 3번 트윗에 hero.png 첨부 (저장소 docs/screenshots/hero.png)
- 스크린샷·데이터 질문 대비: docs/bench/report.html 링크 준비
