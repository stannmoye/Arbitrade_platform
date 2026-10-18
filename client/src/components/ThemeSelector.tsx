import { ARBITRADE_THEME_LABELS, ARBITRADE_THEMES, type ArbitradeTheme, useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";

type ThemeSelectorProps = {
  compact?: boolean;
  readOnly?: boolean;
};

export function ThemeSelector({ compact = false, readOnly = false }: ThemeSelectorProps) {
  const { theme, setTheme, switchable } = useTheme();
  const appearance = trpc.appearanceConfig.useQuery(undefined, { staleTime: 30_000 });
  const auth = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const isAdmin = auth.data?.role === "admin";
  const policy = appearance.data;
  const enabledThemes: ArbitradeTheme[] = policy?.enabledThemes
    ? policy.enabledThemes.filter((option: string): option is ArbitradeTheme =>
        ARBITRADE_THEMES.includes(option as ArbitradeTheme))
    : [];
  const defaultTheme: ArbitradeTheme = policy && ARBITRADE_THEMES.includes(policy.defaultTheme as ArbitradeTheme)
    ? policy.defaultTheme as ArbitradeTheme
    : "original";
  const customerCanSelect = policy?.customerCanSelect === true;
  const canChoose = isAdmin || (!readOnly && customerCanSelect);
  // A malformed or temporarily empty published allow-list must never produce an
  // empty select. Fall back to the published default until the policy is corrected.
  const customerThemes = enabledThemes.length > 0 ? enabledThemes : [defaultTheme];
  const availableThemes: ArbitradeTheme[] = isAdmin
    ? [...ARBITRADE_THEMES]
    : customerCanSelect
      ? customerThemes
      : [defaultTheme];
  const selectedTheme = availableThemes.includes(theme as ArbitradeTheme)
    ? theme as ArbitradeTheme
    : availableThemes[0] ?? defaultTheme;

  if (!switchable) return null;

  return (
    <section className={`arb-theme-selector${compact ? " arb-theme-selector-compact" : ""}`} aria-label="Appearance settings">
      <label htmlFor={canChoose ? compact ? "arb-theme-select-compact" : "arb-theme-select" : undefined}>
        <span className="arb-theme-selector-title">{canChoose ? "Appearance" : "Workspace appearance"}</span>
        {!compact && <span className="arb-theme-selector-description">{canChoose ? "Choose your workspace theme" : "Theme selected by workspace settings"}</span>}
      </label>
      {canChoose ? (
        <select
          id={compact ? "arb-theme-select-compact" : "arb-theme-select"}
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
