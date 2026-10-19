import { describe, expect, it } from "vitest";
import {
  ADMIN_THEME_PREVIEW_STORAGE_KEY,
  CUSTOMER_THEME_STORAGE_KEY,
  isThemeStorageEventForRole,
  themeStorageKeyForRole,
} from "./theme-storage";

describe("theme preference storage isolation", () => {
  it("uses separate storage keys for administrator previews and customer preferences", () => {
    expect(themeStorageKeyForRole(true, 7)).toBe(`${ADMIN_THEME_PREVIEW_STORAGE_KEY}:user:7`);
    expect(themeStorageKeyForRole(false, 7)).toBe(`${CUSTOMER_THEME_STORAGE_KEY}:user:7`);
    expect(themeStorageKeyForRole(true, 7)).not.toBe(themeStorageKeyForRole(false, 7));
  });

  it("isolates customer preferences between accounts on the same browser", () => {
    expect(themeStorageKeyForRole(false, 7)).not.toBe(themeStorageKeyForRole(false, 8));
    expect(themeStorageKeyForRole(false, 7)).toBe(themeStorageKeyForRole(false, "7"));
  });

  it("keeps guest preference storage separate from account-scoped preferences", () => {
    expect(themeStorageKeyForRole(false)).toBe(CUSTOMER_THEME_STORAGE_KEY);
    expect(themeStorageKeyForRole(false, null)).toBe(CUSTOMER_THEME_STORAGE_KEY);
    expect(themeStorageKeyForRole(false, 7)).not.toBe(CUSTOMER_THEME_STORAGE_KEY);
  });

  it("does not treat administrator previews as customer preferences or vice versa", () => {
    expect(isThemeStorageEventForRole(themeStorageKeyForRole(true, 7), false, 7)).toBe(false);
    expect(isThemeStorageEventForRole(themeStorageKeyForRole(false, 7), true, 7)).toBe(false);
  });

  it("filters events by both role and user, while accepting full-clear events", () => {
    expect(isThemeStorageEventForRole(themeStorageKeyForRole(true, 7), true, 7)).toBe(true);
    expect(isThemeStorageEventForRole(themeStorageKeyForRole(false, 7), false, 7)).toBe(true);
    expect(isThemeStorageEventForRole(themeStorageKeyForRole(false, 8), false, 7)).toBe(false);
    expect(isThemeStorageEventForRole(null, true, 7)).toBe(true);
    expect(isThemeStorageEventForRole(null, false, 7)).toBe(true);
  });
});
