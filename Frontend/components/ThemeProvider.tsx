"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

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
  attribute = "class",
  enableSystem = true,
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  attribute?: "class" | "data-theme";
  enableSystem?: boolean;
}) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") {
      return defaultTheme;
    }

    try {
      const savedTheme = localStorage.getItem("app-theme") as Theme | null;
      if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
        return savedTheme;
      }
    } catch {}

    return defaultTheme;
  });

  const resolvedTheme = useMemo<"dark" | "light">(() => {
    if (theme === "system") {
      if (!enableSystem) {
        return "light";
      }
      if (typeof window !== "undefined") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      return "light";
    }
    return theme;
  }, [theme, enableSystem]);

  useEffect(() => {
    const root = window.document.documentElement;

    if (attribute === "class") {
      root.classList.remove("light", "dark");
      root.classList.add(resolvedTheme);
    } else {
      root.setAttribute(attribute, resolvedTheme);
    }

    try {
      if (theme !== defaultTheme) {
        localStorage.setItem("app-theme", theme);
      }
    } catch {}
  }, [theme, defaultTheme, resolvedTheme, attribute]);

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
