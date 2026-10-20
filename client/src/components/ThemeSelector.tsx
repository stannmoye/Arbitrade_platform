import { useId } from "react";
import { Palette } from "lucide-react";
import { ARBITRADE_THEME_LABELS, ARBITRADE_THEMES, type ArbitradeTheme, useTheme } from "@/contexts/ThemeContext";

type ThemeSelectorProps = {
  compact?: boolean;
  readOnly?: boolean;
  placement?: "default" | "header" | "sidebar";
};

export function ThemeSelector({ compact = false, readOnly = false, placement = "default" }: ThemeSelectorProps) {
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
    <section className={`arb-theme-selector arb-page${compact ? " arb-theme-selector-compact" : ""}${placement !== "default" ? ` arb-theme-selector-${placement}` : ""}`} aria-label="Appearance settings" aria-busy={!policyReady}>
      {placement !== "default" && <Palette className="arb-theme-selector-icon" size={16} aria-hidden="true" />}
      <div className="arb-theme-selector-copy">
        {canChoose ? (
          <label className="arb-theme-selector-title" htmlFor={selectId}>{placement === "header" ? "Theme" : "Appearance"}</label>
        ) : (
          <span className="arb-theme-selector-title">Workspace appearance</span>
        )}
        {!compact && (
          <span id={`arb-theme-description-${selectorId}`} className="arb-theme-selector-description">
            {!policyReady || policyFailed ? "Workspace appearance settings" : canChoose ? "Choose your workspace theme" : "Theme selected by workspace settings"}
          </span>
        )}
      </div>
      {(!policyReady || policyFailed) && (
        <span className="arb-theme-selector-status" role={policyFailed ? "alert" : "status"} aria-live={policyFailed ? "assertive" : "polite"}>
          {policyFailed ? "Appearance settings could not be loaded; using the default theme." : "Loading workspace appearance…"}
        </span>
      )}
      {canChoose ? (
        <select
          id={selectId}
          value={selectedTheme}
          onChange={(event) => setTheme(event.target.value as ArbitradeTheme)}
          aria-describedby={!compact ? `arb-theme-description-${selectorId}` : undefined}
          aria-label={placement === "header" ? "Change customer theme" : placement === "sidebar" ? "Change appearance theme" : undefined}
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
