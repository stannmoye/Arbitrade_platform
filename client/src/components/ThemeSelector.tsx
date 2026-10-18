import { ARBITRADE_THEME_LABELS, ARBITRADE_THEMES, type ArbitradeTheme, useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";

type ThemeSelectorProps = {
  compact?: boolean;
  readOnly?: boolean;
};

export function ThemeSelector({ compact = false, readOnly = false }: ThemeSelectorProps) {
  const { theme, setTheme, switchable } = useTheme();
  const appearance = trpc.appearanceConfig.useQuery(undefined, { staleTime: 30_000 });
  const availableThemes: ArbitradeTheme[] = readOnly && appearance.data
    ? (appearance.data.enabledThemes as string[]).filter((option: string): option is ArbitradeTheme =>
        ARBITRADE_THEMES.includes(option as ArbitradeTheme))
    : [...ARBITRADE_THEMES];
  const canChoose = !readOnly || appearance.data?.customerCanSelect === true;
  const selectedTheme = availableThemes.includes(theme as ArbitradeTheme)
    ? theme as ArbitradeTheme
    : (appearance.data?.defaultTheme as ArbitradeTheme) || "original";

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
