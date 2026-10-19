import React, { createContext, useContext, useEffect, useState } from "react";
import { ARBITRADE_THEMES, normalizeEnabledThemes, type ArbitradeTheme } from "../components/appearance-policy";
import { trpc } from "@/lib/trpc";

export { ARBITRADE_THEMES };
export type { ArbitradeTheme };

// Legacy values remain in the context type for compatibility with the component
// showcase and any existing light/dark-only consumers.
export type Theme = "light" | "dark";

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
  isAdmin: boolean;
  policyDefault: ArbitradeTheme;
  enabledThemes: ArbitradeTheme[];
  customerCanSelect: boolean;
  policyReady: boolean;
  policyFailed: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const THEME_STORAGE_KEY = "arbitrade-theme";

function isTheme(value: unknown): value is ArbitradeTheme {
  return typeof value === "string" && ARBITRADE_THEMES.some(theme => theme === value);
}

function readEnabledThemes(value: unknown, fallback: ArbitradeTheme): ArbitradeTheme[] {
  // Reuse the domain normalizer so server, administrator and customer theme
  // lists share the same validation and canonical product order.
  return normalizeEnabledThemes(value, fallback);
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
  const requestedPolicyDefault = isTheme(policy?.defaultTheme) ? policy.defaultTheme : defaultTheme;
  // A published default must also be in the allow-list. If configuration is malformed
  // or omits that default, consistently fall back to the first permitted theme.
  const enabledThemes = readEnabledThemes(policy?.enabledThemes, requestedPolicyDefault);
  const policyDefault = enabledThemes.includes(requestedPolicyDefault)
    ? requestedPolicyDefault
    : enabledThemes[0];
  const customerCanSelect = policy?.customerCanSelect === true;
  // Start from the published-safe default. Customer preferences are read only after policy loads,
  // preventing a previously stored but now-disabled theme from flashing during initial render.
  const [theme, setThemeState] = useState<ArbitradeTheme>(defaultTheme);
  // Avoid writing the initial fallback over an administrator's saved preview before
  // the authenticated role has been resolved and the stored theme has been restored.
  const [adminThemeReady, setAdminThemeReady] = useState(false);

  useEffect(() => {
    if (auth.isLoading) return;
    if (auth.isError || !isAdmin) {
      setAdminThemeReady(true);
      return;
    }
    // Administrators may keep a local preview independent of the published customer policy.
    setThemeState(readStoredTheme(defaultTheme));
    setAdminThemeReady(true);
  }, [auth.isLoading, auth.isError, isAdmin, defaultTheme]);

  useEffect(() => {
    if (auth.isLoading || auth.isError || appearance.isError || isAdmin || !policy) return;
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
  }, [auth.isLoading, auth.isError, appearance.isError, isAdmin, policy, policyDefault, customerCanSelect, enabledThemes.join("|")]);

  // Keep theme previews in sync across tabs while revalidating customer choices
  // against the latest published policy instead of blindly trusting storage events.
  useEffect(() => {
    if (!switchable || auth.isLoading || auth.isError) return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;

      if (isAdmin) {
        setThemeState(isTheme(event.newValue) ? event.newValue : defaultTheme);
        return;
      }

      if (!policy || appearance.isError) return;
      const nextTheme = customerCanSelect && isTheme(event.newValue) && enabledThemes.includes(event.newValue)
        ? event.newValue
        : policyDefault;
      setThemeState(nextTheme);
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [switchable, auth.isLoading, auth.isError, appearance.isError, isAdmin, defaultTheme, policy, customerCanSelect, policyDefault, enabledThemes.join("|")]);

  const setTheme = (nextTheme: ArbitradeTheme) => {
    if (!isTheme(nextTheme) || auth.isLoading || auth.isError) return;
    if (isAdmin) {
      setThemeState(nextTheme);
      return;
    }
    // Do not accept customer theme changes until authentication and the server policy
    // have both resolved; this prevents role/policy transitions from applying stale choices.
    if (!policy || appearance.isError) return;
    if (customerCanSelect && enabledThemes.includes(nextTheme)) setThemeState(nextTheme);
  };

  useEffect(() => {
    const root = document.documentElement;
    // Apply the published default as soon as policy is available, even while
    // authentication is resolving; this prevents a stale initial theme flash.
    const effectiveTheme = auth.isError || (auth.isLoading && policy) || (!isAdmin && appearance.isError)
      ? policyDefault
      : !auth.isLoading && !isAdmin && policy
        ? (customerCanSelect && enabledThemes.includes(theme) ? theme : policyDefault)
        : theme;
    root.dataset.arbTheme = effectiveTheme;
    root.classList.toggle("dark", effectiveTheme !== "clean-light");
    root.style.colorScheme = effectiveTheme === "clean-light" ? "light" : "dark";

    if (!auth.isLoading && !auth.isError && (!isAdmin || adminThemeReady) && switchable && (isAdmin || (policy && customerCanSelect && enabledThemes.includes(effectiveTheme)))) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, effectiveTheme);
      } catch {
        // Keep the selected theme active for this session when storage is unavailable.
      }
    }
  }, [theme, switchable, auth.isLoading, auth.isError, appearance.isError, isAdmin, adminThemeReady, policy, policyDefault, customerCanSelect, enabledThemes.join("|")]);

  const selectableThemes: ArbitradeTheme[] = isAdmin
    ? [...ARBITRADE_THEMES]
    : policy && customerCanSelect
      ? enabledThemes
      : [];
  const canToggleTheme = switchable && !auth.isLoading && !auth.isError && selectableThemes.length > 1 && (isAdmin || Boolean(policy && !appearance.isError && customerCanSelect));
  const toggleTheme = canToggleTheme
    ? () => {
        const alternateTheme = theme === "clean-light"
          ? (selectableThemes.includes(policyDefault) && policyDefault !== "clean-light"
              ? policyDefault
              : selectableThemes.find(option => option !== theme))
          : selectableThemes.includes("clean-light")
            ? "clean-light"
            : selectableThemes.find(option => option !== theme);
        if (alternateTheme) setTheme(alternateTheme);
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{
      theme,
      setTheme,
      toggleTheme,
      switchable,
      isAdmin,
      policyDefault,
      enabledThemes,
      customerCanSelect,
      policyReady: !auth.isLoading && !appearance.isLoading,
      policyFailed: auth.isError || appearance.isError,
    }}>
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
