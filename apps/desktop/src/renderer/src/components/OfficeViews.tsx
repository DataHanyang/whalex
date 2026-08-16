import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Excel workbook viewer: sheet tabs over a scrollable table. */
export function SpreadsheetView({ base64 }: { base64: string }) {
  const [wb, setWb] = useState<XLSX.WorkBook | null>(null);
  const [sheet, setSheet] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setWb(XLSX.read(b64ToBytes(base64), { type: "array" }));
      setSheet(0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [base64]);

  if (error) return <div className="p-4 text-[13px] text-warn">Could not open workbook: {error}</div>;
  if (!wb) return <div className="p-4 text-[13px] text-faint">Opening workbook…</div>;

  const name = wb.SheetNames[sheet] ?? wb.SheetNames[0] ?? "";
  const ws = wb.Sheets[name];
  const rows: unknown[][] = ws
    ? (XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][])
    : [];
  const shown = rows.slice(0, 500); // a preview, not a grid editor

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
        {wb.SheetNames.map((n, i) => (
          <button
            key={n}
            onClick={() => setSheet(i)}
            className={`rounded px-2 py-0.5 text-[11.5px] whitespace-nowrap ${
              i === sheet ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 w-10 border border-border bg-surface-2 px-1.5 text-[10.5px] font-normal text-faint" />
              {(shown[0] ?? []).map((_, c) => (
                <th
                  key={c}
                  className="sticky top-0 z-10 border border-border bg-surface-2 px-2 py-1 text-center text-[10.5px] font-normal tracking-wide text-faint"
                >
                  {XLSX.utils.encode_col(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, r) => (
              <tr key={r} className={r === 0 ? "bg-accent-soft font-semibold" : r % 2 ? "bg-surface-2/40" : ""}>
                <td className="sticky left-0 border border-border bg-surface-2 px-1.5 text-right text-[10.5px] tabular-nums text-faint">
                  {r + 1}
                </td>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={`whitespace-nowrap border border-border px-2.5 py-1 ${
                      typeof cell === "number" ? "text-right tabular-nums" : ""
                    }`}
                  >
                    {typeof cell === "number" ? cell.toLocaleString() : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 500 && (
          <div className="p-2 text-center text-[11px] text-faint">
            Showing first 500 of {rows.length} rows
          </div>
        )}
      </div>
    </div>
  );
}

interface Slide {
  index: number;
  texts: string[];
}

/** PowerPoint viewer: slide-by-slide text panels with prev/next. */
export function SlidesView({ base64 }: { base64: string }) {
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [cur, setCur] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const zip = await JSZip.loadAsync(b64ToBytes(base64));
        const entries = Object.keys(zip.files)
          .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
          .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
        const out: Slide[] = [];
        for (const [i, f] of entries.entries()) {
          const xml = await zip.file(f)!.async("string");
          // <a:t> holds every text run in a pptx slide.
          const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
            .map((m) => m[1]!)
            .filter((t) => t.trim());
          out.push({ index: i + 1, texts });
        }
        if (!cancelled) {
          setSlides(out);
          setCur(0);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base64]);

  if (error) return <div className="p-4 text-[13px] text-warn">Could not open deck: {error}</div>;
  if (!slides) return <div className="p-4 text-[13px] text-faint">Opening deck…</div>;
  if (slides.length === 0) return <div className="p-4 text-[13px] text-faint">Deck has no slides.</div>;

  const slide = slides[Math.min(cur, slides.length - 1)]!;
  const [title, ...body] = slide.texts;

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        {/* 16:9 canvas so it reads as a slide, not a text dump */}
        <div className="flex aspect-video w-full max-w-[640px] flex-col rounded-lg border border-border bg-surface-2 p-8 shadow-sm">
          <div className="text-[20px] font-semibold leading-tight">{title ?? `Slide ${slide.index}`}</div>
          <div className="mt-4 space-y-1.5 overflow-auto text-[13px] leading-relaxed text-muted">
            {body.map((t, i) => (
              <div key={i}>• {t}</div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-center gap-3 border-t border-border py-2">
        <button
          onClick={() => setCur((c) => Math.max(0, c - 1))}
          disabled={cur === 0}
          className="rounded px-2 py-0.5 text-[12px] text-muted hover:bg-surface-2 disabled:opacity-40"
        >
          ←
        </button>
        <span className="text-[11.5px] tabular-nums text-faint">
          {slide.index} / {slides.length}
        </span>
        <button
          onClick={() => setCur((c) => Math.min(slides.length - 1, c + 1))}
          disabled={cur >= slides.length - 1}
          className="rounded px-2 py-0.5 text-[12px] text-muted hover:bg-surface-2 disabled:opacity-40"
        >
          →
        </button>
      </div>
    </div>
  );
}
