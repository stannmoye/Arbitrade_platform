export const APPEARANCE_THEMES = ["original", "midnight-premium", "clean-light", "emerald-finance", "aurora-modern"] as const;
export type AppearanceTheme = (typeof APPEARANCE_THEMES)[number];

export interface AppearanceSettings {
  defaultTheme: AppearanceTheme;
  enabledThemes: AppearanceTheme[];
  customerCanSelect: boolean;
}

/**
 * Normalize persisted appearance settings at the API boundary. This is
 * deliberately tolerant of malformed or legacy settings, but never returns
 * a published default that is unavailable in the enabled-theme list.
 * Theme choices are always returned in canonical product order.
 */
export function normalizeAppearanceSettings(raw: string | null | undefined): AppearanceSettings {
  let saved: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      saved = parsed as Record<string, unknown>;
    }
  } catch {
    // Invalid legacy settings fall back to the original theme and safe defaults.
  }

  const requestedDefault = typeof saved.defaultTheme === "string" &&
    APPEARANCE_THEMES.includes(saved.defaultTheme as AppearanceTheme)
    ? saved.defaultTheme as AppearanceTheme
    : "original";
  const requestedEnabled = Array.isArray(saved.enabledThemes)
    ? saved.enabledThemes.filter((theme: unknown): theme is AppearanceTheme =>
        typeof theme === "string" && APPEARANCE_THEMES.includes(theme as AppearanceTheme))
    : [...APPEARANCE_THEMES];
  const enabledThemes = APPEARANCE_THEMES.filter(theme => requestedEnabled.includes(theme));
  const nonEmptyEnabled = enabledThemes.length ? enabledThemes : [requestedDefault];
  const defaultTheme = nonEmptyEnabled.includes(requestedDefault)
    ? requestedDefault
    : nonEmptyEnabled[0];

  return {
    defaultTheme,
    enabledThemes: nonEmptyEnabled,
    // Customer theme selection is now a supported customer capability. Administrators
    // retain control over the allow-list and published default, not per-customer access.
    customerCanSelect: true,
  };
}
