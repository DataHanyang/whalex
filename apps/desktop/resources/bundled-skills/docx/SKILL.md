---
name: docx
description: "WhaleX Design: create or edit Word (.docx) documents — reports, letters, proposals — with real typographic structure. Use whenever a .docx file is the input or the deliverable, in any language."
---

# WhaleX Design — Word documents

## Create: the `docx` npm library

```powershell
mkdir doc-build -ea 0; cd doc-build; npm init -y | Out-Null; npm install docx --no-fund --no-audit
```

Write a Node script with the `docx` package (Document/Packer/Paragraph/TextRun/
Table). Rules that make it read as designed:

- **Define styles once, use everywhere**: create named paragraph styles
  (Title, Heading1/2, Body, Caption) with explicit font, size (half-points:
  `size: 24` = 12pt), color, and `spacing: { before, after }` — never inline
  one-off formatting per paragraph.
- Type scale: Title 20-24pt bold, H1 16pt, H2 13pt bold, body 10.5-11pt,
  captions 9pt muted. Line spacing 1.15-1.3 (`spacing: { line: 276 }` = 1.15).
- Fonts: Calibri or Cambria for Latin; for Korean set `font: { ascii:
  "Calibri", eastAsia: "Malgun Gothic" }` on every style that carries Hangul.
- Real structure: cover block, headings that nest correctly, tables with a
  styled header row (`shading`) and consistent column widths, page numbers in
  the footer (`PageNumber.CURRENT`), generous margins (≥ 2cm).
- Tables of numbers: right-align the cells, format the numbers, never let a
  table exceed the text width.
- No AI tells: no decorative full-width color bars, no centered body text,
  no bold-everything.

## Edit an existing .docx

A .docx is a zip; text lives in `word/document.xml` inside `<w:t>` runs.
For text swaps: unzip, replace inside `<w:t>` only (never restructure
elements or touch namespaces), rezip from inside the folder. For anything
structural, rebuild with the `docx` library instead and copy the source
text out first (extract with a quick script reading `<w:t>` runs).

## QA (required)

1. Reopen the zip: confirm `word/document.xml` parses and your expected
   strings are present; grep the extracted text for `lorem|TODO|\[insert`.
2. If Microsoft Word is installed, prove it opens and export a visual:

```powershell
$w = New-Object -ComObject Word.Application
$doc = $w.Documents.Open("C:\full\path\report.docx", $false, $true)
$doc.ExportAsFixedFormat("C:\full\path\report.pdf", 17)  # 17 = PDF
$doc.Close($false); $w.Quit()
```

3. If `view_image` is available, screenshot/convert a page and check:
   heading hierarchy visible, no orphan headings at page bottoms, tables not
   clipped, consistent spacing.
4. Deliver with `present_file` (kind "markdown" summary) and tell the user
   where the .docx is; mention the PDF proof if you made one.
