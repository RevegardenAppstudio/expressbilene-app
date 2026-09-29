import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkColors, lightColors, ThemeColors } from "./colors";

export type ThemeMode = "light" | "dark";

type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  toggleMode: () => void;
};

const STORAGE_KEY = "expressbilene:theme-mode";

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(systemScheme === "dark" ? "dark" : "light");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark") setMode(saved);
    });
  }, []);

  function toggleMode() {
    setMode((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      AsyncStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, colors: mode === "dark" ? darkColors : lightColors, toggleMode }),
    [mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme må brukes inne i en ThemeProvider.");
  return ctx;
}
