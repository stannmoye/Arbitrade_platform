export const ARBITRADE_THEMES = [
  "original",
  "midnight-premium",
  "clean-light",
  "emerald-finance",
  "aurora-modern",
] as const;

export type ArbitradeTheme = (typeof ARBITRADE_THEMES)[number];


/**
 * Toggle one customer-available theme while preserving the policy invariant
 * that at least one known theme remains enabled. The list is normalized to
 * the canonical product order so admin previews and customer choices agree.
 */
export function toggleEnabledTheme(
  enabledThemes: readonly ArbitradeTheme[],
  candidate: ArbitradeTheme,
): ArbitradeTheme[] {
  if (enabledThemes.includes(candidate)) {
    if (enabledThemes.length <= 1) return [...enabledThemes];
    return ARBITRADE_THEMES.filter(theme => enabledThemes.includes(theme) && theme !== candidate);
  }

  return ARBITRADE_THEMES.filter(theme => theme === candidate || enabledThemes.includes(theme));
}
