---
name: deck-design
description: Create polished PowerPoint (.pptx) decks with real visual design. Use whenever the user asks for a presentation, slides, pitch deck, 발표자료, PPT, or any .pptx output — load this BEFORE writing any code.
---

# Deck Design — building .pptx that doesn't look AI-generated

Build decks by writing a Node script with `pptxgenjs`, then QA the result. Never
hand-write raw OOXML for a new deck.

## Step 0 — setup

Work in a `deck-build/` subfolder of the working directory:

```powershell
mkdir deck-build -ea 0; cd deck-build; npm init -y | Out-Null; npm install pptxgenjs --no-fund --no-audit
```

## Step 1 — design plan BEFORE code

Write (in your head or a short comment block) a plan with:

1. **Palette chosen for THIS topic** — 1 dominant color (~60-70% of visual
   weight), 1-2 supporting tones, 1 sharp accent. Never give every color equal
   weight, never default to generic blue. Starting points (pick/adapt to topic):
   - Deep space navy `141B3C` / star silver `C9D4E8` / signal amber `F2A93B`
   - Espresso `2B1D16` / crema `E8D8C3` / copper `B4652A`
   - Lab white `FAFBFC` / graphite `23272E` / electric teal `0FA3A3`
   - Vineyard `4A1E2B` / blush `E8C5C9` / gold leaf `C9A227`
   - Pine `1E4034` / mist `DFE8E3` / clementine `E8622C`
   - Slate `2F3B47` / paper `F4F6F8` / vermilion `D6402D`
2. **Type scale** — titles 36-44pt bold, section headers 20-24pt, body 14-16pt,
   captions 10-12pt. Safe fonts that render everywhere: Arial, Calibri, Cambria,
   Times New Roman, Courier New. A serif headline (Cambria) over a sans body
   (Calibri) gives contrast at zero risk. Never Aptos.
3. **One repeating motif** — e.g. icons in filled circles, numbered chapter
   marks, a corner glyph. Repeat it on every slide. A colored bar or stripe is
   NOT a motif (see the ban list).
4. **Slide map** — for each slide: which layout pattern (below) and which
   visual element it carries. Vary layouts; never the same pattern twice in a row.

## Step 2 — write the generator script

`pptxgenjs` essentials (violating these corrupts the file or breaks layout):

- `pres.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 }); pres.layout = "WIDE";`
  FIRST, before any slide. Coordinates are inches; nothing warns when a shape
  is placed off-canvas.
- Colors are 6-digit hex **without `#`** (`"F2A93B"`). Use `transparency: 0-100`
  for translucent fills — never bake alpha into the hex.
- Lists: `bullet: true` per item plus `breakLine: true` on all but the last;
  never type a literal `•`. Space paragraphs with `paraSpaceAfter`.
- Text boxes have built-in padding — set `margin: 0` when text must align
  with a shape edge.
- Speaker notes: `slide.addNotes("...")`, never a text box.
- Charts: use `addChart()` with your palette in `chartColors`, axis label
  colors set, `showValue: true`, and `showLegend: false` for single series.
  On stacked bars, data labels must be `ctr`/`inEnd`/`inBase` (not `outEnd`).
- One `new pptxgen()` per file; don't reuse option objects across calls.

### Layout patterns to rotate through

- **Title/section slides**: dark background, huge left-aligned title low on the
  slide, small kicker above it.
- **Two-column**: text one side, big visual (chart/shape composition) the other.
- **Stat callouts**: 2-4 giant numbers (60-72pt) with small muted labels under.
- **Icon rows / grid cards**: subtle background-tint cards (no border stripes)
  with a header and 1-2 lines each.
- **Timeline / steps**: numbered markers with connecting line, alternating text.
- **Comparison**: two columns with clear headers, contrasting tints.

### Ban list — these instantly read as AI slop

- NO accent line/underline below titles. Use whitespace or a background change.
- NO decorative bars or stripes: no full-width header/footer bars, no vertical
  edge stripes, no single-side borders on cards.
- NO text-only slides — every slide carries a chart, stat, shape composition,
  icon row, or diagram.
- NO centered body text (titles may center; body and lists are left-aligned).
- NO cream/beige default backgrounds — default is white or a palette color.
- NO identical layout repeated across the deck.
- NO text overflowing its box — count characters: at 16pt Calibri, roughly
  95 chars fit per 10" line; size boxes with ~10% slack, shorten copy to fit.
- Body text under ~30 words per slide; the deck is visual, details go in
  speaker notes.

## Step 3 — run and validate

```powershell
node make-deck.mjs   # writes ../<name>.pptx (save OUTSIDE deck-build)
```

Then reopen the package and check it structurally (`npm i jszip` in
deck-build): every `ppt/slides/slideN.xml` you expect exists, each slide's
`<a:t>` runs stay inside your line-length budget, and referenced media is
present. Fix problems in the generator and rebuild — never edit the zip.

## Step 4 — visual QA (do not skip)

If Microsoft PowerPoint is installed, export slides to PNG and LOOK at them:

```powershell
$pp = New-Object -ComObject PowerPoint.Application
$pres = $pp.Presentations.Open("C:\full\path\deck.pptx", $true, $false, $false)
$pres.Export("C:\full\path\deck-png", "PNG", 1280, 720)
$pres.Close(); $pp.Quit()
```

Check each image for: overflowing/cut text (most common defect), overlapping
elements, gaps under 0.3", margins under 0.5", low-contrast text, two slides
sharing the same layout back-to-back. Fix in the generator and re-export.
If PowerPoint isn't installed, re-check the script against the ban list and
line-length budgets instead.

## Step 5 — show the user

Call `present_file` with `kind: "slides"` and the .pptx path so the deck opens
in the preview panel. Mention the speaker notes if you wrote them.
