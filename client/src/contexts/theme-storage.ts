export const CUSTOMER_THEME_STORAGE_KEY = "arbitrade-theme";
export const ADMIN_THEME_PREVIEW_STORAGE_KEY = "arbitrade-admin-theme-preview";

/** Keep administrator-only previews isolated from customer preferences in shared browsers. */
export function themeStorageKeyForRole(isAdmin: boolean): string {
  return isAdmin ? ADMIN_THEME_PREVIEW_STORAGE_KEY : CUSTOMER_THEME_STORAGE_KEY;
}

/** A storage event should only update the active role's theme state. */
export function isThemeStorageEventForRole(key: string | null, isAdmin: boolean): boolean {
  return key === null || key === themeStorageKeyForRole(isAdmin);
}
