import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ThemeContext, type ThemeContextValue } from "./theme-context";

export const THEME_STORAGE_KEY = "inboxos:theme";
export type ThemeMode = "light" | "dark";

function readStoredTheme(): ThemeMode {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [themeLoaded, setThemeLoaded] = useState(false);

  useEffect(() => {
    setTheme(readStoredTheme());
    setThemeLoaded(true);
  }, []);

  useEffect(() => {
    applyTheme(theme);
    if (!themeLoaded) return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // A preferência em memória continua funcionando quando o storage está indisponível.
    }
  }, [theme, themeLoaded]);

  const value = useMemo(
    () => ({
      theme,
      isDarkMode: theme === "dark",
      themeLoaded,
      toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    }),
    [theme, themeLoaded],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
