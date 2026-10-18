import { useId } from "react";
import { ARBITRADE_THEME_LABELS, ARBITRADE_THEMES, type ArbitradeTheme, useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";

type ThemeSelectorProps = {
  compact?: boolean;
  readOnly?: boolean;
};

export function ThemeSelector({ compact = false, readOnly = false }: ThemeSelectorProps) {
  const { theme, setTheme, switchable } = useTheme();
  const selectorId = useId();
  const selectId = `arb-theme-select-${compact ? "compact-" : ""}${selectorId}`;
  const appearance = trpc.appearanceConfig.useQuery(undefined, { staleTime: 30_000 });
  const auth = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const isAdmin = auth.data?.role === "admin";
  const policy = appearance.data;
  const configuredThemes: ArbitradeTheme[] = policy?.enabledThemes
    ? policy.enabledThemes.filter((option: string): option is ArbitradeTheme =>
        ARBITRADE_THEMES.includes(option as ArbitradeTheme))
    : [];
  const requestedDefault: ArbitradeTheme = policy && ARBITRADE_THEMES.includes(policy.defaultTheme as ArbitradeTheme)
    ? policy.defaultTheme as ArbitradeTheme
    : "original";
  // Keep selector fallback behavior identical to ThemeProvider: if the published
  // default is not allowed, use the first enabled theme instead.
  const customerThemes = configuredThemes.length > 0 ? configuredThemes : [requestedDefault];
  const effectiveDefault = customerThemes.includes(requestedDefault) ? requestedDefault : customerThemes[0];
  const customerCanSelect = policy?.customerCanSelect === true;
  const policyReady = !auth.isLoading && !appearance.isLoading;
  const canChoose = policyReady && !readOnly && (isAdmin || customerCanSelect);
  const availableThemes: ArbitradeTheme[] = isAdmin
    ? [...ARBITRADE_THEMES]
    : customerCanSelect
      ? customerThemes
      : [effectiveDefault];
  const selectedTheme = availableThemes.includes(theme as ArbitradeTheme)
    ? theme as ArbitradeTheme
    : availableThemes[0] ?? effectiveDefault;

  if (!switchable) return null;

  return (
    <section className={`arb-theme-selector${compact ? " arb-theme-selector-compact" : ""}`} aria-label="Appearance settings" aria-busy={!policyReady}>
      <label htmlFor={canChoose ? selectId : undefined}>
        <span className="arb-theme-selector-title">{canChoose ? "Appearance" : "Workspace appearance"}</span>
        {!compact && <span className="arb-theme-selector-description" role={!policyReady ? "status" : undefined} aria-live={!policyReady ? "polite" : undefined}>{!policyReady ? "Loading workspace appearance…" : canChoose ? "Choose your workspace theme" : "Theme selected by workspace settings"}</span>}
      </label>
      {canChoose ? (
        <select
          id={selectId}
          value={selectedTheme}
          onChange={(event) => setTheme(event.target.value as ArbitradeTheme)}
          aria-label="Workspace theme"
        >
          {availableThemes.map((option) => (
            <option key={option} value={option}>{ARBITRADE_THEME_LABELS[option]}</option>
          ))}
        </select>
      ) : (
        <span className="arb-theme-selector-current" aria-label={`Current theme: ${ARBITRADE_THEME_LABELS[selectedTheme]}`}>
          {ARBITRADE_THEME_LABELS[selectedTheme]}
        </span>
      )}
    </section>
  );
}
