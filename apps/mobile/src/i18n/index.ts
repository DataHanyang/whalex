import { useEffect, useState } from "react";
import { getLocales } from "expo-localization";
import type { AppLanguage } from "@whalex/shared";
import { LANGUAGES, resolveLocale, translator, type Dict } from "@whalex/i18n";

/**
 * The phone's view of the shared dictionary. Strings live in @whalex/i18n
 * alongside the desktop's, so both apps say the same thing in all eleven
 * languages; this module only decides which locale is active and re-renders
 * when it changes.
 */

export { LANGUAGES };
export type { Dict };

function deviceTag(): string {
  return getLocales()[0]?.languageTag ?? "en";
}

let active: AppLanguage = "system";
let lookup = translator(resolveLocale(active, deviceTag()));
const listeners = new Set<() => void>();

export function setLanguage(language: AppLanguage): void {
  active = language;
  lookup = translator(resolveLocale(language, deviceTag()));
  for (const l of listeners) l();
}

export function currentLanguage(): AppLanguage {
  return active;
}

export function t(key: keyof Dict, vars?: Record<string, string | number>): string {
  return lookup(key, vars);
}

/** Picks the singular or plural key by count, then interpolates `n`. */
export function plural(
  one: keyof Dict,
  many: keyof Dict,
  n: number,
  vars?: Record<string, string | number>,
): string {
  return t(n === 1 ? one : many, { n, ...vars });
}

/** Subscribes a component to language changes. */
export function useLanguage(): AppLanguage {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = (): void => bump((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return active;
}
