import { describe, expect, it } from "vitest";
import { normalizeAppearanceSettings } from "./appearance-settings";

describe("appearance settings normalization", () => {
  it("returns the five-theme default policy when no saved settings exist", () => {
    expect(normalizeAppearanceSettings(undefined)).toEqual({
      defaultTheme: "original",
      enabledThemes: ["original", "midnight-premium", "clean-light", "emerald-finance", "aurora-modern"],
      customerCanSelect: false,
    });
  });

  it("preserves a valid default and enabled-theme policy", () => {
    expect(normalizeAppearanceSettings(JSON.stringify({
      defaultTheme: "emerald-finance",
      enabledThemes: ["emerald-finance", "clean-light"],
      customerCanSelect: true,
    }))).toEqual({
      defaultTheme: "emerald-finance",
      enabledThemes: ["emerald-finance", "clean-light"],
      customerCanSelect: true,
    });
  });

  it("moves the published default to the first enabled theme if saved settings conflict", () => {
    expect(normalizeAppearanceSettings(JSON.stringify({
      defaultTheme: "original",
      enabledThemes: ["aurora-modern", "clean-light"],
      customerCanSelect: true,
    }))).toEqual({
      defaultTheme: "aurora-modern",
      enabledThemes: ["aurora-modern", "clean-light"],
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
      customerCanSelect: false,
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
});
