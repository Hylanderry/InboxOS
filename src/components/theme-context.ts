import { createContext, useContext } from "react";
import type { ThemeMode } from "./theme-provider";

export type ThemeContextValue = {
  theme: ThemeMode;
  isDarkMode: boolean;
  themeLoaded: boolean;
  toggleTheme: () => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme deve ser usado dentro de ThemeProvider");
  return context;
}
