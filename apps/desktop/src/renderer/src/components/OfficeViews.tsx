import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { init as initPptxPreviewer } from "pptx-preview";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Excel workbook viewer: sheet tabs over a scrollable table. */
export function SpreadsheetView({ base64 }: { base64: string }) {
  const { t } = useTranslation();
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

  // sheet_to_json over a big sheet is expensive; recompute only when the
  // workbook or the selected sheet actually changes.
  const rows: unknown[][] = useMemo(() => {
    if (!wb) return [];
    const name = wb.SheetNames[sheet] ?? wb.SheetNames[0] ?? "";
    const ws = wb.Sheets[name];
    return ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][]) : [];
  }, [wb, sheet]);

  if (error) return <div className="p-4 text-[13px] text-warn">{t("office.workbook.error", { error })}</div>;
  if (!wb) return <div className="p-4 text-[13px] text-faint">{t("office.workbook.opening")}</div>;

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
            {t("office.rowsTruncated", { shown: 500, total: rows.length })}
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

/**
 * PowerPoint viewer. First choice is a real visual render (pptx-preview draws
 * backgrounds, shapes, images and positioned text); if that fails on a given
 * file it falls back to the text-outline pager below.
 */
export function SlidesView({ base64 }: { base64: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Remember which payload failed, so a new deck retries the visual path
  // while the same broken deck doesn't retry-loop.
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const failed = failedFor === base64;

  useEffect(() => {
    if (failed) return;
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = "";
    let cancelled = false;
    // Wait a frame so the container has a measured width.
    const raf = requestAnimationFrame(() => {
      try {
        const width = Math.max(320, Math.min(host.clientWidth || 720, 1100));
        const previewer = initPptxPreviewer(host, {
          width,
          height: Math.round((width * 9) / 16),
        });
        const bytes = b64ToBytes(base64);
        void Promise.resolve(previewer.preview(bytes.buffer as ArrayBuffer))
          .then(() => {
            // pptx-preview can resolve yet draw nothing on decks it cannot
            // parse (seen with some pptxgenjs feature combos) — treat an
            // empty render as failure so the outline fallback kicks in.
            setTimeout(() => {
              if (cancelled) return;
              const drewSomething =
                host.querySelector(".pptx-preview-slide-wrapper") &&
                (host.textContent?.trim() || host.querySelector("svg, img, canvas"));
              if (!drewSomething) setFailedFor(base64);
            }, 400);
          })
          .catch(() => {
            if (!cancelled) setFailedFor(base64);
          });
      } catch {
        if (!cancelled) setFailedFor(base64);
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      host.innerHTML = "";
    };
  }, [base64]);

  if (failed) return <SlidesOutlineView base64={base64} />;
  return (
    <div className="h-full overflow-auto bg-surface p-4">
      <div ref={hostRef} className="mx-auto" />
    </div>
  );
}

/** Fallback: slide-by-slide text panels with prev/next. */
function SlidesOutlineView({ base64 }: { base64: string }) {
  const { t } = useTranslation();
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

  if (error) return <div className="p-4 text-[13px] text-warn">{t("office.deck.error", { error })}</div>;
  if (!slides) return <div className="p-4 text-[13px] text-faint">{t("office.deck.opening")}</div>;
  if (slides.length === 0) return <div className="p-4 text-[13px] text-faint">{t("office.deck.empty")}</div>;

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
