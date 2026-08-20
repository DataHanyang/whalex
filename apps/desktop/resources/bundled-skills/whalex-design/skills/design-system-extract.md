# Skill: design-system-extract

**트리거**: 기존 결과물(PPTX·DOCX·PDF·웹사이트·Figma)에서 색·폰트·간격 토큰을 추출해 디자인 시스템을 재구축해야 할 때.

**목적**: 실측값 기반으로 토큰을 뽑아 코드(theme.js)와 문서(DESIGN.md)에 기록한다. 추측 금지.

## 절차

### 1단계 — 소스 확보
- PPTX/DOCX: jszip으로 압축 해제 → `ppt/theme/theme1.xml`, `ppt/slides/slideN.xml`, `word/styles.xml` 파싱.
- 웹: CSS 파일에서 실측 헥스·폰트 스택 수집. (예: 브랜드 사이트 CSS에서 반복 횟수가 가장 많은 헥스를 accent로 확정)
- 이미지: 시각적 확인으로 색 팔레트 후보를 모은 뒤, 가능하면 코드/파일에서 헥스로 교차 검증.

### 2단계 — 색 토큰화
다음 역할로 매핑한다 (없으면 생략, 1색 다용도 금지):
```
bg / surface / surface2 / ink / inkSoft / muted / line / accent / accentDark / onAccent
```
- 각 토큰에 사용처와 명암비를 기록: "accent — 라이트 배경 2.9:1 → 대형 전용 / 어두운 변형 8.0:1 → 소형·링크".

### 3단계 — 폰트·크기·간격 토큰화
- 폰트 페어링(한글/라틴), 크기 스케일(kicker/title/body/small/caption/stat/pageNum), 간격(margin/gap).
- 실제 사용 빈도가 높은 값을 기준으로 한다 — 파일에 한 번 나온 변이는 토큰에서 제외.

### 4단계 — 모티프 추출
- 반복되는 시각 패턴(상단 밴드, 사선 액센트, 카드 스타일, 그림자)을 1문단으로 정리해 모티프로 기록한다. 이게 브랜드의 재사용 단위다.

### 5단계 — 산출
- `theme.js` (코드, source of truth) + DESIGN.md의 색/타이포/간격 섹션 업데이트.

## 규칙
- 헥스는 6자리, `#` 없이, 알파 없음 (pptxgenjs 규약).
- "미확인"은 실측값으로 대체하고 출처를 주석으로 남긴다.
