export const CUSTOMER_THEME_STORAGE_KEY = "arbitrade-theme";
export const ADMIN_THEME_PREVIEW_STORAGE_KEY = "arbitrade-admin-theme-preview";

/**
 * Scope saved themes to the signed-in user when an account ID is available.
 * Guest preferences retain a separate browser-local key.
 */
export function themeStorageKeyForRole(
  isAdmin: boolean,
  userId?: number | string | null,
): string {
  const prefix = isAdmin ? ADMIN_THEME_PREVIEW_STORAGE_KEY : CUSTOMER_THEME_STORAGE_KEY;
  return userId === undefined || userId === null || userId === ""
    ? prefix
    : `${prefix}:user:${String(userId)}`;
}

/** Only the active role and account's key may update its theme state. */
export function isThemeStorageEventForRole(
  key: string | null,
  isAdmin: boolean,
  userId?: number | string | null,
): boolean {
  return key === null || key === themeStorageKeyForRole(isAdmin, userId);
}
