import { describe, expect, it } from "vitest";
import { normalizeAppearanceSettings } from "./appearance-settings";

const themes = [
  "original",
  "midnight-premium",
  "clean-light",
  "emerald-finance",
  "aurora-modern",
  "gold-luxe",
] as const;

describe("appearance settings normalization", () => {
  it("returns the six-theme default policy when no saved settings exist", () => {
    expect(normalizeAppearanceSettings(undefined)).toEqual({
      defaultTheme: "original",
      enabledThemes: [...themes],
      customerCanSelect: true,
    });
  });

  it("keeps customer theme choice enabled even when a legacy policy saved it as disabled", () => {
    const normalized = normalizeAppearanceSettings(JSON.stringify({
      defaultTheme: "clean-light",
      enabledThemes: ["clean-light", "aurora-modern"],
      customerCanSelect: false,
    }));
    expect(normalized.customerCanSelect).toBe(true);
    expect(normalized.enabledThemes).toEqual(["clean-light", "aurora-modern"]);
  });

  it("preserves a valid default and normalizes enabled themes to canonical order", () => {
    expect(normalizeAppearanceSettings(JSON.stringify({
      defaultTheme: "emerald-finance",
      enabledThemes: ["emerald-finance", "clean-light"],
      customerCanSelect: true,
    }))).toEqual({
      defaultTheme: "emerald-finance",
      enabledThemes: ["clean-light", "emerald-finance"],
      customerCanSelect: true,
    });
  });

  it("selects the first canonical enabled theme when saved settings conflict", () => {
    expect(normalizeAppearanceSettings(JSON.stringify({
      defaultTheme: "original",
      enabledThemes: ["aurora-modern", "clean-light"],
      customerCanSelect: true,
    }))).toEqual({
      defaultTheme: "clean-light",
      enabledThemes: ["clean-light", "aurora-modern"],
      customerCanSelect: true,
    });
  });

  it("filters unknown themes, removes duplicates, and falls back safely for an empty list", () => {
    expect(normalizeAppearanceSettings(JSON.stringify({
      defaultTheme: "midnight-premium",
      enabledThemes: ["clean-light", "clean-light", "not-a-theme"],
      customerCanSelect: "true",
    }))).toEqual({
      defaultTheme: "clean-light",
      enabledThemes: ["clean-light"],
      customerCanSelect: true,
    });

    expect(normalizeAppearanceSettings(JSON.stringify({
      defaultTheme: "emerald-finance",
      enabledThemes: ["unknown"],
      customerCanSelect: true,
    }))).toEqual({
      defaultTheme: "emerald-finance",
      enabledThemes: ["emerald-finance"],
      customerCanSelect: true,
    });
  });

  it("uses safe defaults when stored JSON is malformed or has the wrong shape", () => {
    expect(normalizeAppearanceSettings("{broken")).toEqual(normalizeAppearanceSettings(undefined));
    expect(normalizeAppearanceSettings("[]")).toEqual(normalizeAppearanceSettings(undefined));
    expect(normalizeAppearanceSettings('{"defaultTheme":"not-a-theme"}')).toEqual(
      normalizeAppearanceSettings(undefined),
    );
  });

  it("always returns a valid enabled default for adversarial persisted payloads", () => {
    const payloads = [
      "null",
      "false",
      "0",
      '"text"',
      '{"defaultTheme":null,"enabledThemes":null,"customerCanSelect":1}',
      '{"defaultTheme":"unknown","enabledThemes":[],"customerCanSelect":true}',
      '{"defaultTheme":"clean-light","enabledThemes":["unknown",null,4,"clean-light","clean-light"]}',
      '{"defaultTheme":"aurora-modern","enabledThemes":["midnight-premium"],"customerCanSelect":false}',
    ];

    for (const payload of payloads) {
      const normalized = normalizeAppearanceSettings(payload);
      expect(normalized.enabledThemes.length, payload).toBeGreaterThan(0);
      expect(normalized.enabledThemes).toContain(normalized.defaultTheme);
      expect(new Set(normalized.enabledThemes).size, payload).toBe(normalized.enabledThemes.length);
      expect(normalized.enabledThemes.every(theme => themes.includes(theme))).toBe(true);
      expect(normalized.enabledThemes).toEqual(themes.filter(theme => normalized.enabledThemes.includes(theme)));
    }
  });

  it("preserves the enabled-default invariant for every theme subset and requested default", () => {
    // Exhaustively cover all 64 allow-list masks against every possible default.
    for (let mask = 0; mask < (1 << themes.length); mask += 1) {
      const subset = themes.filter((_, index) => (mask & (1 << index)) !== 0);

      for (const requestedDefault of themes) {
        const raw = JSON.stringify({
          defaultTheme: requestedDefault,
          enabledThemes: subset.length ? [...subset].reverse().concat([...subset], ["unknown"]) : ["unknown"],
          customerCanSelect: true,
        });
        const normalized = normalizeAppearanceSettings(raw);

        expect(normalized.enabledThemes, `mask=${mask}, default=${requestedDefault}`).toContain(normalized.defaultTheme);
        expect(new Set(normalized.enabledThemes).size).toBe(normalized.enabledThemes.length);
        expect(normalized.enabledThemes.every(theme => themes.includes(theme))).toBe(true);
        expect(normalized.enabledThemes).toEqual(themes.filter(theme => normalized.enabledThemes.includes(theme)));
        expect(normalized.customerCanSelect).toBe(true);
      }
    }
  });
});
