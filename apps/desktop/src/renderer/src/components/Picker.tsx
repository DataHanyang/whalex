import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface PickerOption<T extends string> {
  value: T;
  label: string;
  /** Second line in the menu — what choosing this actually does. */
  hint?: string;
  icon?: ReactNode;
  /** Tints the trigger while this option is selected (e.g. a risky mode). */
  tone?: "default" | "accent" | "warn" | "danger";
}

interface PickerProps<T extends string> {
  value: T;
  options: PickerOption<T>[];
  onChange: (value: T) => void;
  icon?: ReactNode;
  title?: string;
  /** Shown instead of the option label — for a shorter trigger. */
  triggerLabel?: string;
  align?: "left" | "right";
  /** Display-only: the value is managed automatically (e.g. by SuperCode). */
  locked?: boolean;
}

const TONE_TRIGGER = {
  default: "border-border text-muted hover:bg-surface-2",
  accent: "border-accent bg-accent-soft text-accent",
  warn: "border-warn bg-warn-soft text-warn",
  danger: "border-danger bg-danger-soft text-danger",
} as const;

/**
 * A compact dropdown for the composer's controls. A native <select> cannot show
 * an icon, a description line or a check mark, and on Windows it renders with
 * the OS chrome, which looks out of place next to the rest of the composer.
 */
export function Picker<T extends string>({
  value,
  options,
  onChange,
  icon,
  title,
  triggerLabel,
  align = "left",
  locked = false,
}: PickerProps<T>) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const tone = selected?.tone ?? "default";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation(); // don't let Esc also abort the running turn
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
        onClick={() => !locked && setOpen((v) => !v)}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] transition-colors ${TONE_TRIGGER[tone]} ${locked ? "cursor-default opacity-90" : ""}`}
      >
        {icon ?? selected?.icon}
        <span className="max-w-[150px] truncate">
          {triggerLabel ?? selected?.label ?? value}
        </span>
        <ChevronDown size={11} className="opacity-60" />
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute bottom-full z-50 mb-1.5 min-w-[210px] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left hover:bg-surface-2"
              >
                <span className="mt-[3px] w-3 shrink-0 text-accent">
                  {active && <Check size={12} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[12.5px]">
                    {o.icon}
                    <span className="truncate">{o.label}</span>
                  </span>
                  {o.hint && (
                    <span className="mt-0.5 block text-[11px] leading-snug text-faint">
                      {o.hint}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
