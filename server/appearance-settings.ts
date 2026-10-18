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
  const uniqueEnabled = [...new Set(requestedEnabled)];
  const enabledThemes: AppearanceTheme[] = uniqueEnabled.length ? uniqueEnabled : [requestedDefault];
  const defaultTheme = enabledThemes.includes(requestedDefault)
    ? requestedDefault
    : (enabledThemes[0] ?? requestedDefault);

  return {
    defaultTheme,
    enabledThemes,
    customerCanSelect: saved.customerCanSelect === true,
  };
}
