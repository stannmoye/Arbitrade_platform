import React, { createContext, useContext, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

// Legacy values remain in the context type for compatibility with the component
// showcase and any existing light/dark-only consumers.
export type Theme = "light" | "dark";

export const ARBITRADE_THEMES = [
  "original",
  "midnight-premium",
  "clean-light",
  "emerald-finance",
  "aurora-modern",
] as const;

export type ArbitradeTheme = (typeof ARBITRADE_THEMES)[number];

export const ARBITRADE_THEME_LABELS: Record<ArbitradeTheme, string> = {
  original: "Original Arbitrade",
  "midnight-premium": "Midnight Premium",
  "clean-light": "Clean Light",
  "emerald-finance": "Emerald Finance",
  "aurora-modern": "Aurora Modern",
};

interface ThemeContextType {
  theme: Theme | ArbitradeTheme;
  setTheme: (theme: ArbitradeTheme) => void;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const THEME_STORAGE_KEY = "arbitrade-theme";

function isTheme(value: unknown): value is ArbitradeTheme {
  return typeof value === "string" && ARBITRADE_THEMES.some(theme => theme === value);
}

function readStoredTheme(defaultTheme: ArbitradeTheme): ArbitradeTheme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : defaultTheme;
  } catch {
    return defaultTheme;
  }
}

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ArbitradeTheme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "original",
  switchable = true,
}: ThemeProviderProps) {
  const appearance = trpc.appearanceConfig.useQuery(undefined, { staleTime: 30_000 });
  const auth = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const isAdmin = auth.data?.role === "admin";
  const policy = appearance.data;
  const policyDefault = isTheme(policy?.defaultTheme) ? policy.defaultTheme : defaultTheme;
  // Match the selector's safe fallback: an absent, malformed, or empty published
  // allow-list permits only the policy default for customers, never every theme.
  const configuredThemes = policy?.enabledThemes?.filter(isTheme) ?? [];
  const enabledThemes = configuredThemes.length > 0 ? configuredThemes : [policyDefault];
  const customerCanSelect = policy?.customerCanSelect === true;
  // Start from the published-safe default. Customer preferences are read only after policy loads,
  // preventing a previously stored but now-disabled theme from flashing during initial render.
  const [theme, setThemeState] = useState<ArbitradeTheme>(defaultTheme);

  useEffect(() => {
    if (auth.isLoading || !isAdmin) return;
    // Administrators may keep a local preview independent of the published customer policy.
    setThemeState(readStoredTheme(defaultTheme));
  }, [auth.isLoading, isAdmin, defaultTheme]);

  useEffect(() => {
    if (auth.isLoading || isAdmin || !policy) return;
    let selected: ArbitradeTheme = policyDefault;
    if (customerCanSelect) {
      try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (isTheme(stored) && enabledThemes.includes(stored)) selected = stored;
      } catch {
        // Continue with the administrator-published default when storage is unavailable.
      }
    }
    setThemeState(selected);
  }, [auth.isLoading, isAdmin, policy, policyDefault, customerCanSelect, enabledThemes.join("|")]);

  const setTheme = (nextTheme: ArbitradeTheme) => {
    if (!isTheme(nextTheme)) return;
    if (isAdmin) {
      setThemeState(nextTheme);
      return;
    }
    // Do not accept customer theme changes until the server policy has loaded.
    // This prevents a disabled theme from being applied during the initial query window.
    if (!policy) return;
    if (customerCanSelect && enabledThemes.includes(nextTheme)) setThemeState(nextTheme);
  };

  useEffect(() => {
    const root = document.documentElement;
    const effectiveTheme = !auth.isLoading && !isAdmin && policy
      ? (enabledThemes.includes(theme) ? theme : policyDefault)
      : theme;
    root.dataset.arbTheme = effectiveTheme;
    root.classList.toggle("dark", effectiveTheme !== "clean-light");
    root.style.colorScheme = effectiveTheme === "clean-light" ? "light" : "dark";

    if (!auth.isLoading && switchable && (isAdmin || (policy && customerCanSelect && enabledThemes.includes(effectiveTheme)))) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, effectiveTheme);
      } catch {
        // Keep the selected theme active for this session when storage is unavailable.
      }
    }
  }, [theme, switchable, auth.isLoading, isAdmin, policy, policyDefault, customerCanSelect, enabledThemes.join("|")]);

  const toggleTheme = switchable
    ? () => setTheme(theme === "clean-light" ? "original" : "clean-light")
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
