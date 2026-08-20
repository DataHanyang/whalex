# WhaleX Design — 디자인 시스템 프롬프트 & QA 툴킷

> WhaleX 툴체인으로 실제 결과물을 만들며 쌓인 기준을 정리한 디자인 팩.

## 구조

```
whalex-design/
├── DESIGN.md              # 24챕터 디자인 시스템 프롬프트 — 모든 작업의 기본 지침
├── skills/                # 18개 프로시저 스킬 (마크다운, 이름=트리거)
│   ├── hi-fi-design.md               # 하이파이 디자인 전 과정 (모든 디자인 요청의 진입점)
│   ├── discovery-questions.md        # 시작 전 질문 프로토콜
│   ├── frontend-aesthetic-direction.md # 브랜드 없을 때 룩 확정 (4방향)
│   ├── wireframe.md                   # 저해상도 3+ 변형
│   ├── make-a-deck.md                 # 슬라이드 덱 (PPTX/HTML)
│   ├── make-a-prototype.md            # 클릭 가능 프로토타입
│   ├── make-tweakable.md              # 실시간 조정 패널 (Tweaks)
│   ├── generate-variations.md         # 축별 3+ 고해상도 변형
│   ├── options.md                     # 옵션 스택 (턴 스택 + 안정 id + 팬/줌 캔버스)
│   ├── flier.md                       # 인쇄용 단면 전단/포스터
│   ├── html-email.md                  # 메일 클라이언트에서 살아남는 HTML 이메일
│   ├── design-system-extract.md       # 소스에서 토큰 추출
│   ├── component-extract.md           # 재사용 컴포넌트 인벤토리
│   ├── accessibility-audit.md         # WCAG·명암비·키보드·모션
│   ├── ai-slop-check.md               # AI 관용구 탐지 (9규칙)
│   ├── hierarchy-rhythm-review.md     # 계층·리듬·밀도
│   ├── interaction-states-pass.md     # hover/active/disabled/focus/loading
│   └── polish-pass.md                 # 최종 게이트 (총괄)
└── qa/
    ├── audit-pptx.mjs                 # PPTX 감사 스크립트 (실행 코드)
    └── reports/                       # 감사 산출물 (md + json)
```

## 사용법

### 1. 디자인 작업 시작 시
1. `DESIGN.md`를 읽는다 (기본 시스템 프롬프트).
2. 작업 유형에 맞는 스킬을 장착한다 (예: 덱 → `make-a-deck`).
3. 스킬 체이닝: `discovery-questions → (design-system-extract) → make-a-deck → polish-pass`

### 2. 기존 PPTX 감사
```
node whalex-design/qa/audit-pptx.mjs <input.pptx> [output-dir]
# 예: node whalex-design/qa/audit-pptx.mjs deck.pptx
```
산출물: `<deck>-audit.md` (읽기용) + `<deck>-audit.json` (기계 처리용).

### 3. 감사 항목
- **테마 추출**: clrScheme 색·major/minor 폰트·슬라이드 크기 (design-system-extract)
- **AI 슬롭**: 진짜 이모지 / 기능 심볼(✓✕→)/ 그라디언트 / 관용구 폰트(Inter·Roboto·Arial·Calibri) (ai-slop-check)
- **접근성**: 텍스트별 명암비 (본문 4.5:1, 대형 3:1) — z-순서 컴포지팅으로 도형·사진 위 텍스트 배경 해석, 이미지 배경은 수동 확인으로 분류 (accessibility-audit)
- **계층/리듬**: 슬라이드당 구분 텍스트 크기 수, 4단계 초과 여부 (hierarchy-rhythm-review)

## 검증 기준 (부록 A 요약)

| 항목 | 기준 |
|---|---|
| 명암비 | 본문 4.5:1 · 대형(18pt+) 3:1 · 캡션 4.6:1 권장 |
| 이모지 | 진짜 이모지 0건 / 기능 심볼은 수동 확인 |
| 계층 | 슬라이드당 구분 크기 4단계 이하 |
| 폰트 | 관용구 폰트 금지 (브랜드 지정 폰트 사용) |

## 알려진 한계
- schemeClr(테마 상속 색) 텍스트는 명암비 계산에서 제외 (테마 매핑은 추후 강화).
- 표(tbl) 내부 셀 텍스트는 z-순서 해석 대상이 아니라 배경 폴백 사용.
- 그룹 내 중첩 오프셋 좌표는 절대 좌표 가정 (pptxgenjs 출력 기준 검증됨).
