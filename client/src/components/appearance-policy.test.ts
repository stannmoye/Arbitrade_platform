import { describe, expect, it } from "vitest";
import { ARBITRADE_THEMES, normalizeEnabledThemes, toggleEnabledTheme } from "./appearance-policy";

describe("administrator enabled-theme policy transitions", () => {
  it("normalizes duplicate and unknown persisted entries in canonical order", () => {
    expect(normalizeEnabledThemes(["aurora-modern", "unknown", "original", "aurora-modern"]))
      .toEqual(["original", "aurora-modern"]);
  });

  it("falls back to the requested known default when no enabled theme is valid", () => {
    expect(normalizeEnabledThemes(["unknown", null, 5], "emerald-finance")).toEqual(["emerald-finance"]);
  });

  it.each([null, undefined, 5, "original", { enabledThemes: ["clean-light"] }])(
    "recovers safely from malformed list input: %j",
    input => {
      expect(normalizeEnabledThemes(input, "midnight-premium")).toEqual(["midnight-premium"]);
      expect(toggleEnabledTheme(input, "clean-light")).toEqual(["midnight-premium", "clean-light"]);
    },
  );

  it("allows adding a theme when only one theme is currently enabled", () => {
    expect(toggleEnabledTheme(["original"], "clean-light")).toEqual(["original", "clean-light"]);
  });

  it("prevents removing the final enabled theme", () => {
    expect(toggleEnabledTheme(["emerald-finance"], "emerald-finance")).toEqual(["emerald-finance"]);
  });

  it("removes a selected theme while preserving the remaining canonical order", () => {
    expect(toggleEnabledTheme(["aurora-modern", "original", "clean-light"], "original"))
      .toEqual(["clean-light", "aurora-modern"]);
  });

  it("removes a selected theme and adds a disabled theme in canonical order", () => {
    expect(toggleEnabledTheme(["aurora-modern", "original"], "aurora-modern"))
      .toEqual(["original"]);
    expect(toggleEnabledTheme(["aurora-modern", "original"], "clean-light"))
      .toEqual(ARBITRADE_THEMES.filter(theme => ["aurora-modern", "original", "clean-light"].includes(theme)));
  });

  it("normalizes duplicate enabled entries before applying the final-theme guard", () => {
    expect(toggleEnabledTheme(["original", "original"], "original")).toEqual(["original"]);
    expect(toggleEnabledTheme(["original", "original"], "clean-light")).toEqual(["original", "clean-light"]);
  });

  it("preserves the non-empty, unique, canonical-order invariant across every subset and toggle", () => {
    for (let mask = 0; mask < (1 << ARBITRADE_THEMES.length); mask += 1) {
      const subset = ARBITRADE_THEMES.filter((_, index) => (mask & (1 << index)) !== 0);
      const normalized = normalizeEnabledThemes(subset);
      expect(normalized.length, `mask=${mask}`).toBeGreaterThan(0);
      expect(new Set(normalized).size).toBe(normalized.length);
      expect(normalized).toEqual(ARBITRADE_THEMES.filter(theme => normalized.includes(theme)));

      for (const candidate of ARBITRADE_THEMES) {
        const next = toggleEnabledTheme(subset, candidate);
        expect(next.length, `mask=${mask}, candidate=${candidate}`).toBeGreaterThan(0);
        expect(new Set(next).size).toBe(next.length);
        expect(next).toEqual(ARBITRADE_THEMES.filter(theme => next.includes(theme)));
        expect(next).toContain(candidate === normalized[0] && normalized.length === 1 ? normalized[0] : next.includes(candidate) ? candidate : normalized[0]);
      }
    }
  });
});
