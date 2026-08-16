import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Brain } from "lucide-react";

export const EFFORT_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

interface Props {
  value: EffortLevel;
  onChange: (v: EffortLevel) => void;
}

/**
 * Thinking effort: the composer shows only the level you are on, and clicking
 * it opens a slider you drag across the scale. Five buttons sitting in the
 * composer at all times was too much furniture for a control you touch rarely,
 * and the levels are ordered, so a track reads better than a row of choices.
 */
export function EffortControl({ value, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const index = Math.max(0, EFFORT_LEVELS.indexOf(value));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation(); // Esc closes the slider, not the running turn
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("composer.effortTip")}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] transition-colors ${
          open ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2"
        }`}
      >
        <Brain size={12} />
        {t(`effort.short.${value}`)}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("composer.effortTip")}
          className="absolute bottom-full left-0 z-50 mb-1.5 w-[264px] rounded-xl border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-0.5 flex items-baseline justify-between">
            <span className="text-[12.5px] font-medium">{t(`effort.${value}`)}</span>
            <span className="text-[11px] text-faint">{t("composer.effortTip")}</span>
          </div>
          <p className="mb-2.5 text-[11px] leading-snug text-faint">{t(`effort.hint.${value}`)}</p>

          <input
            type="range"
            min={0}
            max={EFFORT_LEVELS.length - 1}
            step={1}
            value={index}
            onChange={(e) => onChange(EFFORT_LEVELS[Number(e.target.value)] ?? "medium")}
            aria-valuetext={t(`effort.${value}`)}
            className="effort-range w-full"
          />

          <div className="mt-1 flex justify-between">
            {EFFORT_LEVELS.map((lvl, i) => (
              <button
                key={lvl}
                type="button"
                onClick={() => onChange(lvl)}
                className={`-mx-1 px-1 text-[10.5px] transition-colors ${
                  i === index ? "font-medium text-accent" : "text-faint hover:text-muted"
                }`}
              >
                {t(`effort.short.${lvl}`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
