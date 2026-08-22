import { resolveSystemLanguage, type AppLanguage } from "@whalex/shared";
import { en } from "./locales/en.js";
import { ko } from "./locales/ko.js";
import { zh } from "./locales/zh.js";
import { zhTW } from "./locales/zh-TW.js";
import { ja } from "./locales/ja.js";
import { fr } from "./locales/fr.js";
import { de } from "./locales/de.js";
import { ru } from "./locales/ru.js";
import { vi } from "./locales/vi.js";
import { th } from "./locales/th.js";
import { id } from "./locales/id.js";

/**
 * Every WhaleX string, in every shipped language, owned in one place.
 *
 * The desktop and the phone render different screens but say the same things
 * about the same product — a permission prompt is a permission prompt. Keeping
 * one dictionary means a fix to the Korean wording lands on both, and neither
 * app can quietly drift into its own vocabulary.
 */

/**
 * The key set is fixed by the English base; the values are plain strings.
 * (`typeof en` alone would pin every value to its own literal type and reject
 * the translations.)
 */
export type Dict = { [K in keyof typeof en]: string };
export type Locale = Exclude<AppLanguage, "system">;

export const LOCALES: Record<Locale, Partial<Dict>> = {
  en,
  ko,
  zh,
  "zh-TW": zhTW,
  ja,
  fr,
  de,
  ru,
  vi,
  th,
  id,
};

/** Display names for a language picker, in the order they should be listed. */
export const LANGUAGES: Array<[Locale, string]> = [
  ["en", "English"],
  ["ko", "한국어"],
  ["zh", "简体中文"],
  ["zh-TW", "繁體中文"],
  ["ja", "日本語"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["ru", "Русский"],
  ["vi", "Tiếng Việt"],
  ["th", "ไทย"],
  ["id", "Bahasa Indonesia"],
];

/** Resolves "system" against a platform locale tag; passes other codes through. */
export function resolveLocale(language: AppLanguage, systemTag: string): Locale {
  return language === "system" ? resolveSystemLanguage(systemTag) : language;
}

/**
 * A tiny lookup for hosts that don't want i18next — the phone, scripts, tests.
 * Falls back to English per key so a partial translation stays readable, and
 * fills `{{name}}` placeholders from `vars`.
 */
export function translator(locale: Locale): (key: keyof Dict, vars?: Record<string, string | number>) => string {
  const dict = LOCALES[locale] ?? en;
  return (key, vars) => {
    const text = dict[key] ?? en[key] ?? String(key);
    if (!vars) return text;
    return text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
      name in vars ? String(vars[name]) : whole,
    );
  };
}

export { en };
