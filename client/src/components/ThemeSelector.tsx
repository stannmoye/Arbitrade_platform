import { ARBITRADE_THEME_LABELS, ARBITRADE_THEMES, useTheme } from "@/contexts/ThemeContext";

type ThemeSelectorProps = {
  compact?: boolean;
  readOnly?: boolean;
};

export function ThemeSelector({ compact = false, readOnly = false }: ThemeSelectorProps) {
  const { theme, setTheme, switchable } = useTheme();
  const selectedTheme = ARBITRADE_THEMES.includes(theme as (typeof ARBITRADE_THEMES)[number])
    ? theme as (typeof ARBITRADE_THEMES)[number]
    : "original";

  if (!switchable) return null;

  return (
    <section className={`arb-theme-selector${compact ? " arb-theme-selector-compact" : ""}`} aria-label="Appearance settings">
      <label htmlFor={readOnly ? undefined : compact ? "arb-theme-select-compact" : "arb-theme-select"}>
        <span className="arb-theme-selector-title">{readOnly ? "Workspace appearance" : "Appearance"}</span>
        {!compact && <span className="arb-theme-selector-description">{readOnly ? "Theme selected by workspace settings" : "Choose your workspace theme"}</span>}
      </label>
      {readOnly ? (
        <span className="arb-theme-selector-current" aria-label={`Current theme: ${ARBITRADE_THEME_LABELS[selectedTheme]}`}>
          {ARBITRADE_THEME_LABELS[selectedTheme]}
        </span>
      ) : (
        <select
          id={compact ? "arb-theme-select-compact" : "arb-theme-select"}
          value={selectedTheme}
          onChange={(event) => setTheme(event.target.value as (typeof ARBITRADE_THEMES)[number])}
          aria-label="Workspace theme"
        >
          {ARBITRADE_THEMES.map((option) => (
            <option key={option} value={option}>{ARBITRADE_THEME_LABELS[option]}</option>
          ))}
        </select>
      )}
    </section>
  );
}
