# Skill: make-tweakable

**트리거**: 결과물에 실시간 조정 패널(색·폰트·간격·변형 토글)을 달아 사용자가 대화 없이 직접 만지게 하려 할 때. HTML 결과물에 기본으로 1–2개 추가 권장.

**목적**: 디자인 결정을 사용자 손에 넘겨 반복 수정 속도를 높인다.

## 절차

### 1단계 — 트윅 후보
- 조정 가치가 높은 축을 고른다: 프라이머리 색, 폰트 크기, 다크 모드, 레이아웃 변형, 대비 강조.
- 과하게 만들지 않는다 — 하단 우측 플로팅 패널 수준으로 작게.

### 2단계 — 프로토콜 (순서 중요)
1. **먼저** `window`에 `message` 리스너 등록:
   - `{type:'__activate_edit_mode'}` → 패널 표시
   - `{type:'__deactivate_edit_mode'}` → 패널 숨김
2. **그 다음에만** `window.parent.postMessage({type:'__edit_mode_available'}, '*')` 호출 (툴바 토글 활성화). 순서를 뒤집으면 토글이 조용히 동작하지 않는다.
3. 값 변경 시 즉시 적용 + `window.parent.postMessage({type:'__edit_mode_set_keys', edits:{...}}, '*')`로 영속화.

### 3단계 — 기본값 영속화
- 기본값을 주석 마커로 감싼 JSON 블록으로 저장 (호스트가 디스크에 다시 쓸 수 있게):
```js
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "primaryColor": "#D97757",
  "fontSize": 16,
  "dark": false
}/*EDITMODE-END*/;
```
- 마커 사이는 **반드시 유효한 JSON** (이중 인용). 루트 HTML의 인라인 `<script>`에 정확히 1개만.

### 4단계 — 패널 UI
- 패널 제목은 **"Tweaks"** 로 고정 (툴바 토글과 명칭 일치).
- 트윅 꺼짐 상태에서는 컨트롤을 완전히 숨기고, 결과물은 완성본처럼 보여야 한다.

## 규칙
- 추측만으로 많은 트윅을 넣지 않는다. 기본 2개 내외 + 흥미로운 가능성 1–2개.
