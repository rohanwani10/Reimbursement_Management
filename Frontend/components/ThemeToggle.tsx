"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className="mac-btn"
        style={{ width: 32, height: 32, padding: 0, display: "flex", justifyContent: "center", alignItems: "center" }}
      >
        <div style={{ width: 14, height: 14 }} />
      </div>
    );
  }

  const cycleTheme = () => {
    if (theme === "system") {
      setTheme(resolvedTheme === "light" ? "dark" : "light");
    } else if (theme === "light") {
      setTheme("dark");
    } else {
      setTheme("system");
    }
  };

  return (
    <button
      onClick={cycleTheme}
      className="mac-btn"
      title={`Current theme: ${theme}. Click to cycle.`}
      style={{
        width: 32,
        height: 32,
        padding: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        borderRadius: "50%",
      }}
    >
      {theme === "light" && <Sun size={14} className="text-[var(--mac-text-primary)]" />}
      {theme === "dark" && <Moon size={14} className="text-[var(--mac-text-primary)]" />}
      {theme === "system" && <Monitor size={14} className="text-[var(--mac-text-primary)]" />}
    </button>
  );
}
