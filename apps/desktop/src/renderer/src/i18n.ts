import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { AppLanguage } from "@whalex/shared";
import { LOCALES, LANGUAGES, resolveLocale } from "@whalex/i18n";

/**
 * i18next wiring only. The strings themselves live in @whalex/i18n, shared
 * with the mobile app — a permission prompt says the same thing on both, and
 * a fix to one locale lands on both at once.
 */

export { LANGUAGES };

// English-first: unless the user explicitly picks a locale, default to English.
function resolve(language: AppLanguage): string {
  return resolveLocale(language, navigator.language);
}

/** i18next wants each locale under a `translation` namespace. */
const resources = Object.fromEntries(
  Object.entries(LOCALES).map(([code, dict]) => [code, { translation: dict }]),
);

export function initI18n(language: AppLanguage): void {
  void i18n.use(initReactI18next).init({
    resources,
    lng: resolve(language),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
}

export function switchLanguage(language: AppLanguage): void {
  void i18n.changeLanguage(resolve(language));
}
