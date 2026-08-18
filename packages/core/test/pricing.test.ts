import { describe, expect, it } from "vitest";
import { effectivePricing, KNOWN_MODELS } from "@whalex/shared";

const flash = KNOWN_MODELS["deepseek-v4-flash"]!.pricing!;

describe("effectivePricing", () => {
  it("uses peak (base) rates inside DeepSeek's peak windows", () => {
    // 02:30 and 07:00 UTC are both peak.
    for (const h of [2, 7]) {
      const p = effectivePricing(flash, new Date(Date.UTC(2026, 7, 19, h, 30)));
      expect(p.input).toBe(flash.input);
      expect(p.output).toBe(flash.output);
    }
  });

  it("uses off-peak rates (half price) outside the windows", () => {
    // 00:30, 05:00, 12:00, 23:00 UTC are off-peak.
    for (const h of [0, 5, 12, 23]) {
      const p = effectivePricing(flash, new Date(Date.UTC(2026, 7, 19, h, 0)));
      expect(p.input).toBe(flash.offPeak!.input);
      expect(p.input).toBeCloseTo(flash.input / 2, 10);
    }
  });

  it("window edges: 04:00 and 10:00 are already off-peak, 01:00 and 06:00 are peak", () => {
    expect(effectivePricing(flash, new Date(Date.UTC(2026, 7, 19, 4, 0))).input).toBe(
      flash.offPeak!.input,
    );
    expect(effectivePricing(flash, new Date(Date.UTC(2026, 7, 19, 10, 0))).input).toBe(
      flash.offPeak!.input,
    );
    expect(effectivePricing(flash, new Date(Date.UTC(2026, 7, 19, 1, 0))).input).toBe(flash.input);
    expect(effectivePricing(flash, new Date(Date.UTC(2026, 7, 19, 6, 0))).input).toBe(flash.input);
  });

  it("passes through models without an offPeak table", () => {
    const legacy = KNOWN_MODELS["deepseek-chat"]!.pricing!;
    expect(effectivePricing(legacy, new Date(Date.UTC(2026, 7, 19, 12, 0)))).toBe(legacy);
  });
});
