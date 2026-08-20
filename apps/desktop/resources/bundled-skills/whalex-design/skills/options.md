# Skill: options

**트리거**: 디자인 옵션·변형을 여러 개 나란히 보여줄 때 (generate-variations의 표면화 단계 포함).

**목적**: 옵션을 턴 단위 스택으로 쌓아, 사용자가 채팅에서 "1b"처럼 안정된 id로 참조하며 반복할 수 있게 한다.

## 캔버스 모드

문서 `<head>`에 아래 메타를 넣으면 WhaleX 아티팩트 뷰어가 **팬/줌 캔버스**로 렌더한다
(드래그 팬, Ctrl+휠 줌, 더블클릭 화면맞춤). 뷰포트보다 넓은 옵션 행도 자유롭게 둘 수 있다.

```html
<meta name="design_doc_mode" content="canvas">
```

직접 팬/줌을 구현하지 않는다 — 뷰어가 제공한다.

## 마크업 규칙

- **턴 스택**: 옵션 라운드 하나가 `<section id="t1">` 하나. 새 라운드가 오면 **기존 위에** 새 섹션을 삽입한다 (최신이 맨 위). 이전 턴은 절대 수정·재정렬·삭제하지 않는다.
- **안정 id**: 옵션마다 `{턴}{글자}` id (`1a`, `1b`, `2a`…)를 옵션의 **최상위 래퍼**에 단다 (`#1b`로 옵션 전체가 스크롤되도록). id는 영원히 고정 — 재사용·재번호 금지.
- **보이는 배지**: 각 옵션에 id 배지를 표시하고, 파일 안에서 id를 언급할 때는 항상 `<a href="#1b">1b</a>` 링크로 쓴다. 채팅에서는 그냥 `1b`라고 쓴다.
- **행 배치**: 한 턴의 옵션들은 가로로 나란히, 넘치면 줄바꿈 (`display:flex; flex-wrap:wrap; gap`). 카드는 내용 크기에 맞춘다 (`height:100%` 금지).
- **다음 제안**: 턴 끝에 한 줄로 이어갈 만한 지시 2–3개를 적는다. 예: "1a처럼 가되 2b의 세리프로" · "2a를 풀블리드로" · "새 방향 더".

## 골격 예시

```html
<meta name="design_doc_mode" content="canvas">
<style>
  body{margin:0;background:#f2f1ec;font-family:system-ui,sans-serif}
  .turn{padding:40px 44px;border-bottom:1px solid rgba(0,0,0,.08)}
  .opts{display:flex;flex-wrap:wrap;gap:28px;align-items:flex-start}
  .opt{display:flex;flex-direction:column;gap:8px}
  .oid{font:600 10.5px monospace;padding:3px 7px;background:rgba(0,0,0,.08);border-radius:5px;text-decoration:none;color:inherit}
  .opt:target .oid{background:#2a78d6;color:#fff}
  .card{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:8px;overflow:hidden}
</style>
<section class="turn" id="t2">
  <h2>2 — <a class="oid" href="#1b">1b</a> 리믹스</h2>
  <div class="opts">
    <div class="opt" id="2a"><span><a class="oid" href="#2a">2a</a> 간격 압축</span><div class="card" style="width:360px">…</div></div>
    <div class="opt" id="2b">…</div>
  </div>
  <p>다음: "<a class="oid" href="#2a">2a</a>에 1c 세리프" · "<a class="oid" href="#2b">2b</a> 풀블리드"</p>
</section>
<section class="turn" id="t1">…1턴 그대로…</section>
```

## 규칙
- 옵션 수는 턴당 3–5개 (generate-variations의 축 규칙을 따른다).
- 브랜드 토큰이 있으면 모든 옵션이 그 안에서 움직인다.
- 각 옵션에는 한 줄 라벨(무엇을 탐색한 변형인지)을 붙인다.
