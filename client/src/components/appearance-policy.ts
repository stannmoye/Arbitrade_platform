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
 * Unknown entries and duplicates are ignored, and an empty or malformed input
 * always falls back to one known theme so the policy remains usable.
 */
export function normalizeEnabledThemes(
  enabledThemes: unknown,
  fallback: ArbitradeTheme = "original",
): ArbitradeTheme[] {
  const candidates: readonly unknown[] = Array.isArray(enabledThemes) ? enabledThemes : [];
  const normalized = ARBITRADE_THEMES.filter(theme => candidates.includes(theme));
  if (normalized.length) return normalized;

  // The TypeScript type protects ordinary callers, but persisted or JavaScript
  // callers can still cross the boundary with an invalid fallback at runtime.
  const safeFallback = (ARBITRADE_THEMES as readonly unknown[]).includes(fallback)
    ? fallback
    : "original";
  return [safeFallback];
}

/**
 * Toggle one customer-available theme while preserving the policy invariant
 * that at least one known theme remains enabled. The list is normalized to
 * the canonical product order so admin previews and customer choices agree.
 */
export function toggleEnabledTheme(
  enabledThemes: unknown,
  candidate: ArbitradeTheme,
): ArbitradeTheme[] {
  const current = normalizeEnabledThemes(enabledThemes);

  if (current.includes(candidate)) {
    if (current.length <= 1) return current;
    return current.filter(theme => theme !== candidate);
  }

  return ARBITRADE_THEMES.filter(theme => theme === candidate || current.includes(theme));
}
