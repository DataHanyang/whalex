---
name: xlsx
description: "WhaleX Design: create, edit, or analyze Excel (.xlsx) workbooks — clean data sheets, formulas, formatted reports. Use whenever a spreadsheet file is the input or the deliverable, in any language."
---

# WhaleX Design — Excel workbooks

## Tooling: `exceljs`

```powershell
mkdir xlsx-build -ea 0; cd xlsx-build; npm init -y | Out-Null; npm install exceljs --no-fund --no-audit
```

Read AND write .xlsx from Node. For quick reads of an existing file, dump
sheet names + used ranges first, then read only what the task needs.

## Rules for workbooks that read as professional

- **One table per sheet**, headers in row 1, frozen (`views: [{ state:
  "frozen", ySplit: 1 }]`), styled once (bold, fill, border-bottom) — not
  per-cell one-offs.
- **Real number formats, never text**: money `#,##0` (or `#,##0.00`),
  percents `0.0%`, dates `yyyy-mm-dd`. Right-align numbers (automatic when
  the value is numeric — never write numbers as strings).
- **Column widths fitted to content** (`column.width` ≈ longest entry + 2;
  Korean text counts ~1.8× per char). No truncated headers.
- **Formulas over baked values** where the sheet is meant to live on:
  `{ formula: "SUM(B2:B13)" }` — totals, averages, and derived columns
  recalculate when the user edits.
- Summary blocks (KPIs, totals) above or beside the table, visually
  distinct via number size/bold — not via loud fills.
- Conditional formatting sparingly: one rule that means something (e.g.
  negatives in red) beats rainbow scales.
- Multiple sheets: name them by content (`매출`, `Raw`, `Summary`), order
  summary-first, and keep identical column layouts for identical data.

## QA (required)

1. Reopen the written file with exceljs: sheet count, row counts, spot-check
   3 cells including one formula result.
2. If Microsoft Excel is installed, prove it opens cleanly:

```powershell
$x = New-Object -ComObject Excel.Application
$wb = $x.Workbooks.Open("C:\full\path\book.xlsx", 0, $true)
Write-Host ("sheets: " + $wb.Sheets.Count)
$wb.Close($false); $x.Quit()
```

3. Show the result in-app: `present_file` with `kind: "spreadsheet"` renders
   the workbook in the artifact panel — the user sees it without opening Excel.
