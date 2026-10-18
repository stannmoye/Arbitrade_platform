import { ARBITRADE_THEME_LABELS, ARBITRADE_THEMES, useTheme } from "@/contexts/ThemeContext";

type ThemeSelectorProps = {
  compact?: boolean;
};

export function ThemeSelector({ compact = false }: ThemeSelectorProps) {
  const { theme, setTheme, switchable } = useTheme();

  if (!switchable) return null;

  return (
    <section className={`arb-theme-selector${compact ? " arb-theme-selector-compact" : ""}`} aria-label="Appearance settings">
      <label htmlFor={compact ? "arb-theme-select-compact" : "arb-theme-select"}>
        <span className="arb-theme-selector-title">Appearance</span>
        {!compact && <span className="arb-theme-selector-description">Choose your workspace theme</span>}
      </label>
      <select
        id={compact ? "arb-theme-select-compact" : "arb-theme-select"}
        value={ARBITRADE_THEMES.includes(theme as (typeof ARBITRADE_THEMES)[number]) ? theme : "original"}
        onChange={(event) => setTheme(event.target.value as (typeof ARBITRADE_THEMES)[number])}
        aria-label="Workspace theme"
      >
        {ARBITRADE_THEMES.map((option) => (
          <option key={option} value={option}>{ARBITRADE_THEME_LABELS[option]}</option>
        ))}
      </select>
    </section>
  );
}
