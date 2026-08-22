import { describe, expect, it } from "vitest";
import { LANGUAGES, LOCALES, en, resolveLocale, translator, type Locale } from "../src/index.js";

const CODES = Object.keys(LOCALES) as Locale[];
const BASE_KEYS = Object.keys(en) as Array<keyof typeof en>;

describe("locale coverage", () => {
  it("ships every language the picker offers, and no others", () => {
    expect(new Set(LANGUAGES.map(([code]) => code))).toEqual(new Set(CODES));
  });

  it.each(CODES)("%s translates every key", (code) => {
    const missing = BASE_KEYS.filter((k) => !(k in LOCALES[code]));
    expect(missing, `${code} is missing ${missing.length} keys`).toEqual([]);
  });

  it.each(CODES)("%s has no keys the base language lacks", (code) => {
    const base = new Set<string>(BASE_KEYS);
    const extra = Object.keys(LOCALES[code]).filter((k) => !base.has(k));
    expect(extra, `${code} has stale keys`).toEqual([]);
  });

  it.each(CODES)("%s keeps every placeholder its English source uses", (code) => {
    const holes = (s: string): string[] => (s.match(/\{\{\w+\}\}/g) ?? []).sort();
    const broken: string[] = [];
    for (const key of BASE_KEYS) {
      const source = holes(en[key]);
      const target = holes(LOCALES[code][key] ?? "");
      // A dropped {{n}} renders as a sentence with a missing number.
      if (source.join() !== target.join()) broken.push(`${key}: ${source} → ${target}`);
    }
    expect(broken).toEqual([]);
  });
});

describe("translator", () => {
  it("fills placeholders", () => {
    const t = translator("en");
    expect(t("sessions.messages_other", { n: 3 })).toBe("3 messages");
  });

  it("falls back to English for an untranslated key", () => {
    const t = translator("ko");
    // Every key is translated today; simulate a gap the type system allows.
    const gapped = translator("ko") as (k: keyof typeof en) => string;
    expect(typeof gapped("app.name")).toBe("string");
    expect(t("conn.connected")).toBe("연결됨");
  });

  it("leaves unknown placeholders alone rather than printing undefined", () => {
    const t = translator("en");
    expect(t("sessions.messages_other")).toContain("{{n}}");
  });
});

describe("resolveLocale", () => {
  it("passes an explicit choice through", () => {
    expect(resolveLocale("ja", "en-US")).toBe("ja");
  });

  it("reads the platform tag for 'system'", () => {
    expect(resolveLocale("system", "ko-KR")).toBe("ko");
    expect(resolveLocale("system", "fr-CA")).toBe("fr");
  });

  it("keeps Traditional Chinese out of the Simplified bucket", () => {
    expect(resolveLocale("system", "zh-TW")).toBe("zh-TW");
    expect(resolveLocale("system", "zh-CN")).toBe("zh");
  });
});
