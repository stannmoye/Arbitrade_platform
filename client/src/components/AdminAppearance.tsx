import { useEffect, useState } from "react";
import { ARBITRADE_THEME_LABELS, ARBITRADE_THEMES, type ArbitradeTheme, useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";

const DEFAULT_ENABLED = [...ARBITRADE_THEMES];

export function AdminAppearance() {
  const settings = trpc.adminOperations.settings.useQuery();
  const save = trpc.adminOperations.updateSettings.useMutation();
  const utils = trpc.useUtils();
  const { theme, setTheme } = useTheme();
  const [defaultTheme, setDefaultTheme] = useState<ArbitradeTheme>("original");
  const [enabledThemes, setEnabledThemes] = useState<ArbitradeTheme[]>(DEFAULT_ENABLED);
  const [customerCanSelect, setCustomerCanSelect] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const appearance = settings.data?.appearance;
    if (!appearance) return;
    const validEnabled = appearance.enabledThemes.filter((value: string): value is ArbitradeTheme =>
      ARBITRADE_THEMES.includes(value as ArbitradeTheme)
    );
    setEnabledThemes(validEnabled.length ? validEnabled : ["original"]);
    setDefaultTheme(ARBITRADE_THEMES.includes(appearance.defaultTheme as ArbitradeTheme)
      ? appearance.defaultTheme as ArbitradeTheme : "original");
    setCustomerCanSelect(Boolean(appearance.customerCanSelect));
  }, [settings.data]);

  const toggleEnabled = (candidate: ArbitradeTheme) => {
    setEnabledThemes(current => {
      if (current.includes(candidate)) {
        if (current.length === 1) return current;
        const next = current.filter(value => value !== candidate);
        if (candidate === defaultTheme) setDefaultTheme(next[0]);
        return next;
      }
      return ARBITRADE_THEMES.filter(value => value === candidate || current.includes(value));
    });
  };

  const persist = async () => {
    setNotice("");
    try {
      await save.mutateAsync({ appearance: { defaultTheme, enabledThemes, customerCanSelect } });
      await Promise.all([settings.refetch(), utils.appearanceConfig.invalidate()]);
      setNotice("Appearance policy saved. Customer workspaces will use the published default and selection policy.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save appearance settings.");
    }
  };

  return (
    <div className="portal-page arb-page arb-stack arb-appearance-admin">
      <div className="portal-page-top">
        <div>
          <div className="eyebrow">Platform configuration · Appearance</div>
          <h1>Theme management</h1>
          <p>Preview themes, publish the customer default, and control which themes customers may select.</p>
        </div>
        <span className="admin-live-chip"><span className="pulse" /> Administrator controls</span>
      </div>

      {settings.isLoading && <div className="settings-card" role="status">Loading saved appearance policy…</div>}
      {settings.isError && <div className="settings-card" role="alert">Appearance settings could not be loaded. Retry before publishing a change.</div>}

      <section className="settings-card">
        <div className="eyebrow">Preview</div>
        <h2>Try a theme before publishing</h2>
        <p>Preview changes apply to this administrator session. Saving the default is a separate action.</p>
        <div className="arb-theme-preview-grid">
          {ARBITRADE_THEMES.map(option => (
            <button type="button" key={option} className={`arb-theme-preview-option${theme === option ? " is-active" : ""}`}
              onClick={() => setTheme(option)} aria-pressed={theme === option}>
              <span className={`arb-theme-swatch arb-theme-swatch-${option}`} aria-hidden="true"><i /><i /><i /></span>
              <strong>{ARBITRADE_THEME_LABELS[option]}</strong>
              <span>{theme === option ? "Currently previewing" : "Preview theme"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <div className="eyebrow">Customer defaults</div>
        <h2>Published customer theme</h2>
        <label className="arb-appearance-field">
          <span>Default theme</span>
          <select value={defaultTheme} onChange={event => setDefaultTheme(event.target.value as ArbitradeTheme)}>
            {ARBITRADE_THEMES.filter(option => enabledThemes.includes(option)).map(option =>
              <option key={option} value={option}>{ARBITRADE_THEME_LABELS[option]}</option>
            )}
          </select>
        </label>
        <h3>Available customer themes</h3>
        <div className="arb-theme-enabled-list">
          {ARBITRADE_THEMES.map(option => (
            <label key={option}>
              <input type="checkbox" checked={enabledThemes.includes(option)} disabled={enabledThemes.length === 1}
                onChange={() => toggleEnabled(option)} />
              <span><strong>{ARBITRADE_THEME_LABELS[option]}</strong><small>{option === defaultTheme ? "Current published default" : "Can be enabled for customer choice"}</small></span>
            </label>
          ))}
        </div>
        <label className="arb-appearance-policy-toggle">
          <input type="checkbox" checked={customerCanSelect} onChange={event => setCustomerCanSelect(event.target.checked)} />
          <span><strong>Allow customers to choose their own theme</strong><small>When disabled, customers see the published default. When enabled, they may choose from the enabled themes.</small></span>
        </label>
        <div className="arb-appearance-actions">
          <button type="button" className="primary-button" disabled={save.isPending || settings.isLoading || settings.isError || !enabledThemes.length}
            onClick={() => void persist()}>{save.isPending ? "Saving…" : "Save appearance policy"}</button>
          {notice && <p role={save.isError ? "alert" : "status"}>{notice}</p>}
        </div>
      </section>
    </div>
  );
}
