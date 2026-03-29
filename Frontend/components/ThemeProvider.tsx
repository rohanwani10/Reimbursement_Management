"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "dark" | "light";
};

const ThemeContext = createContext<ThemeProviderState | undefined>(undefined);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  ...props
}: {
  children: React.ReactNode;
  defaultTheme?: string;
  [key: string]: any;
}) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme as Theme);
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("app-theme") as Theme | null;
      if (savedTheme) {
        setThemeState(savedTheme);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    
    let currentResolved: "light" | "dark" = "light";
    
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
      currentResolved = systemTheme;
      root.classList.add(systemTheme);
    } else {
      currentResolved = theme;
      root.classList.add(theme);
    }
    
    setResolvedTheme(currentResolved);
    try {
      if (theme !== defaultTheme) {
        localStorage.setItem("app-theme", theme);
      }
    } catch {}
  }, [theme, defaultTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};
