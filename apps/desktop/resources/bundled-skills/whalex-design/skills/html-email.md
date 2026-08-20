# Skill: html-email

**트리거**: 이메일(뉴스레터·공지·마케팅 메일) HTML 제작 요청.

**목적**: Gmail·Outlook·Apple Mail 실제 클라이언트에서 살아남는 단일 .html 파일을 만든다. 이메일 렌더링은 브라우저 렌더링이 아니다 — 아래 규칙이 웹 상식과 충돌하면 **아래 규칙이 이긴다**.

## 레이아웃·스타일

- 구조는 중첩 `<table role="presentation" cellpadding="0" cellspacing="0" border="0">`. flex·grid·float·position 금지.
- 중앙 래퍼 테이블 1개, **max-width 600px, 단일 컬럼** 흐름 (좌우 분할보다 세로 스택).
- **모든 스타일을 요소에 인라인**한다. `<head>`의 `<style>`은 인라인 불가능한 것(미디어쿼리·다크모드 보정)만 — 통째로 버리는 클라이언트가 있으므로 인라인만으로 읽혀야 한다.
- JavaScript 금지(전 클라이언트가 제거), 외부 스타일시트 금지, 웹폰트 금지 — Arial, Helvetica, Georgia, Verdana, Tahoma, 'Courier New' + generic 폴백만.
- 비주얼은 **색 채운 셀·보더·스페이서 셀·타이포**로 만든다. 이미지를 호스팅할 곳이 없으므로 로컬 파일 참조는 수신자에게 깨진다 — 이미지가 꼭 필요하면 alt 텍스트를 단 플레이스홀더 셀을 두고, 발송 전 https URL로 교체하라고 사용자에게 알린다.
- 버튼은 bulletproof 방식: bgcolor + 인라인 border-radius를 준 `<td>` 안에 `display:block`으로 채운 `<a>`. 이미지 버튼·`<button>` 금지.

## 클라이언트 특성

- **Outlook** (Word 엔진): 모든 테이블/셀에 명시적 width. line-height는 `mso-line-height-rule:exactly`. Outlook 전용 보정은 `<!--[if mso]> … <![endif]-->`.
- **Gmail**: HTML ~100KB 초과 시 잘림 — 여유 있게 밑돌 것.
- 다크모드: `<meta name="color-scheme" content="light dark">` + 반전에도 살아남는 색 (순수 #000/#fff 배경 회피, 중간톤 위 텍스트 확인).

## 도달성·접근성

- `<body>` 첫 요소: 숨긴 프리헤더 스팬 (~85자) — 제목 옆 미리보기로 뜬다.
- 이미지 alt, `<html lang>`, 죽은 `#` 앵커 없는 실제 링크.
- 마케팅 성격이면 푸터에 수신거부 라인과 주소를 넣는다.

## 마무리

- 600px 폭으로 표면화해 보여주고, "이메일 툴에 그대로 붙여 보낼 수 있는 HTML"임을 답장에 명시한다.
