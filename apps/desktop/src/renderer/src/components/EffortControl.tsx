import { useTranslation } from "react-i18next";
import { Brain } from "lucide-react";

export const EFFORT_LEVELS = ["none", "low", "medium", "high"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

interface Props {
  value: EffortLevel;
  onChange: (v: EffortLevel) => void;
}

/**
 * Thinking effort as a segmented control rather than a menu: the levels are an
 * ordered scale, and you nearly always want the one next to where you are — so
 * showing all four and letting a single click land on any of them beats opening
 * a dropdown to move one step.
 */
export function EffortControl({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center gap-0.5 rounded-md border border-border px-1 py-[3px]"
      title={t("composer.effortTip")}
    >
      <Brain size={12} className="mr-0.5 shrink-0 text-faint" />
      {EFFORT_LEVELS.map((lvl) => {
        const active = lvl === value;
        return (
          <button
            key={lvl}
            type="button"
            onClick={() => onChange(lvl)}
            aria-pressed={active}
            title={t(`effort.hint.${lvl}`)}
            className={`rounded px-1.5 py-[1px] text-[11px] leading-4 transition-colors ${
              active
                ? "bg-accent-soft font-medium text-accent"
                : "text-faint hover:bg-surface-2 hover:text-muted"
            }`}
          >
            {t(`effort.short.${lvl}`)}
          </button>
        );
      })}
    </div>
  );
}
