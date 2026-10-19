import { describe, expect, it } from "vitest";
import {
  ADMIN_THEME_PREVIEW_STORAGE_KEY,
  CUSTOMER_THEME_STORAGE_KEY,
  isThemeStorageEventForRole,
  themeStorageKeyForRole,
} from "./theme-storage";

describe("theme preference storage isolation", () => {
  it("uses separate storage keys for administrator previews and customer preferences", () => {
    expect(themeStorageKeyForRole(true)).toBe(ADMIN_THEME_PREVIEW_STORAGE_KEY);
    expect(themeStorageKeyForRole(false)).toBe(CUSTOMER_THEME_STORAGE_KEY);
    expect(ADMIN_THEME_PREVIEW_STORAGE_KEY).not.toBe(CUSTOMER_THEME_STORAGE_KEY);
  });

  it("does not treat an administrator preview as a customer preference", () => {
    expect(isThemeStorageEventForRole(ADMIN_THEME_PREVIEW_STORAGE_KEY, false)).toBe(false);
    expect(isThemeStorageEventForRole(CUSTOMER_THEME_STORAGE_KEY, true)).toBe(false);
  });

  it("accepts only the active role's key and full-clear events", () => {
    expect(isThemeStorageEventForRole(ADMIN_THEME_PREVIEW_STORAGE_KEY, true)).toBe(true);
    expect(isThemeStorageEventForRole(CUSTOMER_THEME_STORAGE_KEY, false)).toBe(true);
    expect(isThemeStorageEventForRole(null, true)).toBe(true);
    expect(isThemeStorageEventForRole(null, false)).toBe(true);
  });
});
