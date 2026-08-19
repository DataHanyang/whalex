---
name: whalex-design
description: "WhaleX Design: create or edit PowerPoint (.pptx) decks with real visual design and strict consistency. Use whenever the user asks — in any language — for a presentation, slides, pitch deck, or PPT, or wants an existing deck/template restyled or extended. Load this BEFORE writing any code."
---

# WhaleX Design — Decks

Two paths. Pick ONE before doing anything:

| Situation | Path |
|---|---|
| New deck from scratch | **CREATE** — write a Node script with `pptxgenjs` |
| User gave an existing .pptx / template / "match this deck" | **MATCH** — extract its theme, follow it exactly; extend by editing XML or by rebuilding with its tokens |

## Step 0 — the brief

If the request leaves these unclear, ask (ask_user, one short round): audience,
slide count, content density, brand colors / reference deck, language.
A good deck brief = topic + audience + tone + slide count + (optional) reference.
Never ask about things the request already answers.

## Step 1 — THEME contract (consistency is the product)

Every deck gets ONE theme object at the top of the generator, and **no slide
may use a literal color/size/font that isn't in it**:

```js
const THEME = {
  color: { bg: "0F1B2D", surface: "1A2A42", ink: "F4F7FB", muted: "8FA3BC", accent: "F2A93B" },
  font:  { display: "Cambria", body: "Calibri", ea: "Malgun Gothic" }, // ea = Korean/CJK
  size:  { kicker: 13, title: 40, section: 22, body: 15, caption: 11, stat: 64 },
  gapIn: 0.4, marginIn: 0.6,
  motif: (slide) => { /* the ONE repeating element, drawn on every slide */ },
};
```

- **Palette**: 1 dominant (60–70% of visual weight), 1–2 supporting, 1 accent —
  chosen for THIS topic. If your palette would fit any other deck, it's wrong.
- **Dark/light sandwich**: dark title + closing slides, light content slides —
  or commit to all-dark. Never mix arbitrarily.
- **Type scale is law**: same title size on every content slide, same body
  size everywhere. Inconsistent sizes across slides is the #1 amateur tell.
- **Fonts**: metric-safe only — Arial, Calibri, Cambria, Times New Roman,
  Courier New. Korean text: `Malgun Gothic` (Windows ships it; set as the
  `fontFace` for any Hangul run). Never Aptos, never Inter/Roboto.

### Named styles (pick one, or let the topic pick)

- **Midnight Editorial** — near-black navy bg `0F1B2D`, serif display, amber accent `F2A93B`, thin star/ring line-work motif. Investor decks, space/fintech.
- **Swiss Report** — paper `F7F8FA`, graphite ink `1D2126`, one red accent `D6402D`, hard grid, big numerals. Data reports, consulting.
- **Warm Craft** — cream-free! white bg, espresso ink `2B1D16`, copper `B4652A`, rounded image frames. F&B, lifestyle brands.
- **Lab Clean** — white `FAFBFC`, graphite, electric teal `0FA3A3`, hairline table rules, mono for numbers. Tech/dev products.
- **Forest Ledger** — pine `1E4034` darks, mist `DFE8E3` lights, clementine `E8622C` accent. Sustainability, agriculture.
- **Bento Grid** — light bg, 2×3 rounded cards with one tinted feature cell per slide. Product overviews.

## Step 2A — CREATE path (pptxgenjs)

```powershell
mkdir deck-build -ea 0; cd deck-build; npm init -y | Out-Null; npm install pptxgenjs jszip --no-fund --no-audit
```

Hard rules (violations corrupt the file or wreck layout):

- `pres.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 }); pres.layout = "WIDE";`
  before any slide. Coordinates are inches; off-canvas shapes are written silently.
- Hex colors: 6 digits, **no `#`**, never 8-digit alpha. Translucency =
  `transparency: 0-100` on the option.
- Never reuse an options/shadow object across two `add*` calls (it's mutated in
  place). Shadow `offset` must be ≥ 0.
- Lists: `bullet: true` per item + `breakLine: true` on all but the last;
  space with `paraSpaceAfter`; never a literal `•`.
- `margin: 0` on text boxes that must align with shapes; `slide.addNotes()`
  for speaker notes.
- Charts: native `addChart()` for standard types with `chartColors` from THEME,
  axis label colors set, `showValue: true`, `showLegend: false` for one series;
  stacked-bar labels only `ctr`/`inEnd`/`inBase`. Sankey/network/etc. go in as
  images. Compute trendlines yourself rather than leaving charts bare.
- One `new pptxgen()` per file.

### Layout rotation (no two consecutive slides share a pattern)

dark section-title / two-column (text + visual) / giant-stat callouts (3-4 stats
at `size.stat`) / bento cards / timeline with numbered markers / comparison
columns / half-bleed visual with overlay. **Every slide carries a visual**
(chart, stat, shape composition, diagram) and ≤ ~30 words of body text —
details go in speaker notes.

### Ban list — instant AI tells

- accent line/underline under titles ・ decorative bars or edge stripes
  ・ text-only slides ・ centered body text ・ cream/beige default background
  ・ same layout twice in a row ・ mixed gap sizes (pick `gapIn`, use it
  everywhere) ・ default blue theme ・ overflowing text.

**Text-fit budget**: at 15pt Calibri ≈ 9.5 chars/inch; CJK (Malgun Gothic
etc.) ≈ 5.5 chars/inch. Size every box from its actual string with ~10%
slack — shorten copy rather than shrink fonts.

**Line breaking (all languages)**: never let display text auto-wrap at an
arbitrary point. Titles, kickers, and stat labels get MANUAL breaks — split
the string yourself at phrase boundaries and emit one run per line with
`breakLine: true`. PowerPoint wraps Korean mid-word by default, and wraps
English wherever the box edge falls; the fix is the same in every language:
you choose the break point, not the renderer. Body bullets: write each
bullet to fit its line budget (count characters against the box width);
a bullet that would wrap gets shortened or split into two bullets. Never
separate a number from its unit or a currency sign from its amount across
lines — keep them in the same run.

## Step 2B — MATCH path (existing deck / template)

1. **Extract the theme** (script bundled with this skill — run from anywhere):
   `node <skill-dir>/scripts/extract-theme.mjs source.pptx`
   → slide size, theme colors, major/minor fonts, per-slide font sizes and
   used colors. Build THEME from the output — **the source's tokens ARE the
   contract now**; do not "improve" its palette or fonts.
2. **See it** when possible: export slides to PNG (PowerShell below) and, if
   `view_image` is available, look at 2-3 representative slides to learn its
   layout language before writing anything.
3. **Small edits** (retitle, swap text, add a matching slide): unzip, edit
   `ppt/slides/slideN.xml` as text, rezip. Keep namespaces byte-identical —
   edit text runs (`<a:t>`) and attribute values only, never restructure
   elements. `xml:space="preserve"` on runs with edge spaces. To add a slide,
   copy the closest existing `slideN.xml` + its `.rels`, register it in
   `[Content_Types].xml` and `ppt/presentation.xml` `<p:sldIdLst>` (new unique
   id), then rezip from INSIDE the folder.
4. **Many new slides in a template's style**: rebuild with pptxgenjs using the
   extracted THEME — same colors, same fonts, same title size the source uses,
   matching its layout patterns.

## Step 3 — validate

`node validate.mjs` in deck-build: reopen with jszip, confirm every expected
`ppt/slides/slideN.xml` exists, no `<a:t>` run exceeds its box budget, charts
and media referenced by rels actually exist. Also grep the extracted text for
`lorem|TODO|\[insert|xxx` leftovers. Fix in the generator, never in the zip.

## Step 4 — visual QA (required, loop until clean)

If Microsoft PowerPoint is installed:

```powershell
$pp = New-Object -ComObject PowerPoint.Application
$pres = $pp.Presentations.Open("C:\full\path\deck.pptx", $true, $false, $false)
$pres.Export("C:\full\path\deck-png", "PNG", 1280, 720)
$pres.Close(); $pp.Quit()
```

Then — if the `view_image` tool is available — inspect EVERY exported slide:
ask it specifically about text overflow/cutoff (the #1 defect), overlaps,
< 0.3" gaps, margins < 0.5", low contrast, and whether consecutive slides
repeat a layout. Pace the calls: free-tier vision endpoints rate-limit around
10 requests/min, so ask ONE comprehensive question per slide (not several),
and on a 429/503 wait ~30s before retrying — don't burn retries back-to-back. Fix in the generator, re-export, re-check. Two clean passes
= done. Without `view_image`, re-verify the script against the ban list and
text-fit budgets line by line, and say in your summary that visual QA needs
a vision model connected (설정 → 비전).

## Step 5 — deliver

`present_file` with `kind: "slides"` and the .pptx path. Summarize the theme
(palette, fonts, motif) in one sentence so the user can ask for consistent
follow-up edits.
