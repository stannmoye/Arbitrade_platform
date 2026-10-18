import React, { createContext, useContext, useEffect, useState } from "react";

export const ARBITRADE_THEMES = [
  "original",
  "midnight-premium",
  "clean-light",
  "emerald-finance",
  "aurora-modern",
] as const;

export type Theme = (typeof ARBITRADE_THEMES)[number];

export const ARBITRADE_THEME_LABELS: Record<Theme, string> = {
  original: "Original Arbitrade",
  "midnight-premium": "Midnight Premium",
  "clean-light": "Clean Light",
  "emerald-finance": "Emerald Finance",
  "aurora-modern": "Aurora Modern",
};

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const THEME_STORAGE_KEY = "arbitrade-theme";

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && ARBITRADE_THEMES.some(theme => theme === value);
}

function readStoredTheme(defaultTheme: Theme): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : defaultTheme;
  } catch {
    return defaultTheme;
  }
}

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "original",
  switchable = true,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window === "undefined" ? defaultTheme : readStoredTheme(defaultTheme)
  );

  const setTheme = (nextTheme: Theme) => {
    if (isTheme(nextTheme)) setThemeState(nextTheme);
  };

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.arbTheme = theme;
    root.classList.toggle("dark", theme !== "clean-light");

    if (switchable) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        // Keep the selected theme active for this session when storage is unavailable.
      }
    }
  }, [theme, switchable]);

  const toggleTheme = switchable
    ? () => setThemeState(current => current === "clean-light" ? "original" : "clean-light")
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
