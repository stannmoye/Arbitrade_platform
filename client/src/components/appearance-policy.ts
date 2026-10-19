export const ARBITRADE_THEMES = [
  "original",
  "midnight-premium",
  "clean-light",
  "emerald-finance",
  "aurora-modern",
] as const;

export type ArbitradeTheme = (typeof ARBITRADE_THEMES)[number];

/**
 * Normalize untrusted/persisted theme lists into canonical product order.
 * Unknown entries and duplicates are ignored, and an empty result always
 * falls back to one known theme so the policy remains usable.
 */
export function normalizeEnabledThemes(
  enabledThemes: readonly unknown[],
  fallback: ArbitradeTheme = "original",
): ArbitradeTheme[] {
  const normalized = ARBITRADE_THEMES.filter(theme => enabledThemes.includes(theme));
  return normalized.length ? normalized : [fallback];
}

/**
 * Toggle one customer-available theme while preserving the policy invariant
 * that at least one known theme remains enabled. The list is normalized to
 * the canonical product order so admin previews and customer choices agree.
 */
export function toggleEnabledTheme(
  enabledThemes: readonly unknown[],
  candidate: ArbitradeTheme,
): ArbitradeTheme[] {
  const current = normalizeEnabledThemes(enabledThemes);

  if (current.includes(candidate)) {
    if (current.length <= 1) return current;
    return current.filter(theme => theme !== candidate);
  }

  return ARBITRADE_THEMES.filter(theme => theme === candidate || current.includes(theme));
}
