---
name: pdf
description: "WhaleX Design: create designed PDFs (reports, one-pagers, invoices) or manipulate existing ones (merge, split, fill forms, extract text). Use whenever a .pdf is the input or the deliverable, in any language."
---

# WhaleX Design — PDF

Two very different jobs — pick the right path:

## A · Designed PDF from scratch → HTML first, then print

The best-looking PDFs come from the browser's print engine, and Windows
ships one (Edge):

1. Build the document as a single HTML file, following the frontend-design
   skill's rules (THEME tokens, type scale, line-breaking per language).
   Add print CSS: `@page { size: A4; margin: 18mm }`, `break-inside: avoid`
   on cards/tables, real page-break points between sections
   (`break-before: page`), and print-safe colors
   (`print-color-adjust: exact` for filled headers).
2. Verify the HTML with `verify_page` first.
3. Print it:

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless `
  --disable-gpu --print-to-pdf="C:\full\path\out.pdf" --no-pdf-header-footer `
  "file:///C:/full/path/doc.html"
```

(If that path is missing, try `C:\Program Files\Microsoft\Edge\...`.)

## B · Manipulate an existing PDF → `pdf-lib`

```powershell
mkdir pdf-build -ea 0; cd pdf-build; npm init -y | Out-Null; npm install pdf-lib --no-fund --no-audit
```

- Merge/split/reorder: `PDFDocument.load` + `copyPages`.
- Fill forms: `doc.getForm().getTextField(...)`, then `form.flatten()` if
  the result should be uneditable.
- Stamp text/page numbers: `page.drawText` (embed a font with `fontkit`
  for Korean — standard fonts cannot draw Hangul).
- Text extraction: `pdf-parse` (npm). For scanned PDFs say honestly that
  OCR isn't available rather than returning empty text as if it were.

## QA (required)

1. Reload the output with pdf-lib: page count matches, no load error.
2. If `view_image` is available, rasterize a page to check layout —
   quickest on Windows without extra tools: reprint the SOURCE html at the
   same size as PNG via the browser (`--screenshot`), or open the PDF and
   screenshot it. Look for: clipped content at page edges, tables split
   mid-row, headers orphaned at page bottoms, Hangul rendered as boxes
   (font not embedded).
3. Tell the user the file path and page count; mention any page-break
   decisions you made.
