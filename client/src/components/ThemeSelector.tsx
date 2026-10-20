import { useId } from "react";
import { ChevronDown, Palette } from "lucide-react";
import { ARBITRADE_THEME_LABELS, ARBITRADE_THEMES, type ArbitradeTheme, useTheme } from "@/contexts/ThemeContext";

type ThemeSelectorProps = {
  compact?: boolean;
  readOnly?: boolean;
};

export function ThemeSelector({ compact = false, readOnly = false }: ThemeSelectorProps) {
  const {
    theme,
    setTheme,
    switchable,
    isAdmin,
    policyDefault,
    enabledThemes,
    customerCanSelect,
    policyReady,
    policyFailed,
  } = useTheme();
  const selectorId = useId();
  const selectId = `arb-theme-select-${compact ? "compact-" : ""}${selectorId}`;
  const canChoose = policyReady && !policyFailed && !readOnly && (isAdmin || customerCanSelect);
  const availableThemes: ArbitradeTheme[] = policyFailed
    ? [policyDefault]
    : isAdmin
      ? [...ARBITRADE_THEMES]
      : customerCanSelect
        ? enabledThemes
        : [policyDefault];
  const selectedTheme = availableThemes.includes(theme as ArbitradeTheme)
    ? theme as ArbitradeTheme
    : availableThemes[0] ?? policyDefault;

  if (!switchable) return null;

  return (
    <section
      className={`arb-theme-selector${compact ? " arb-theme-selector-compact" : ""}${canChoose ? " is-selectable" : " is-readonly"}`}
      aria-label="Appearance settings"
      aria-busy={!policyReady}
    >
      {!compact && (
        <div className="arb-theme-selector-copy">
          {canChoose ? (
            <label className="arb-theme-selector-title" htmlFor={selectId}>Appearance</label>
          ) : (
            <span className="arb-theme-selector-title">Workspace appearance</span>
          )}
          <span id={`arb-theme-description-${selectorId}`} className="arb-theme-selector-description">
            {!policyReady || policyFailed ? "Workspace appearance settings" : canChoose ? "Choose your workspace theme" : "Theme selected by workspace settings"}
          </span>
        </div>
      )}
      {(!policyReady || policyFailed) && !compact && (
        <span className="arb-theme-selector-status" role={policyFailed ? "alert" : "status"} aria-live={policyFailed ? "assertive" : "polite"}>
          {policyFailed ? "Appearance settings could not be loaded; using the default theme." : "Loading workspace appearance…"}
        </span>
      )}
      <div className="arb-theme-selector-control">
        <span className="arb-theme-selector-trigger" aria-hidden="true">
          <Palette size={compact ? 16 : 18} strokeWidth={1.9} />
          <span className="arb-theme-selector-trigger-label">{compact ? "Theme" : ARBITRADE_THEME_LABELS[selectedTheme]}</span>
          {canChoose && <ChevronDown className="arb-theme-selector-chevron" size={14} />}
        </span>
        {canChoose ? (
          <select
            id={selectId}
            value={selectedTheme}
            onChange={(event) => setTheme(event.target.value as ArbitradeTheme)}
            aria-label="Choose workspace theme"
            aria-describedby={!compact ? `arb-theme-description-${selectorId}` : undefined}
            title={`Current theme: ${ARBITRADE_THEME_LABELS[selectedTheme]}. Choose another theme.`}
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
      </div>
    </section>
  );
}
