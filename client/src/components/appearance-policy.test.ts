import { describe, expect, it } from "vitest";
import { ARBITRADE_THEMES, toggleEnabledTheme } from "./appearance-policy";

describe("administrator enabled-theme policy transitions", () => {
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
});
