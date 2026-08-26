"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { THEMES, THEME_ORDER, getThemeForSong, type CinematicTheme, type ThemeId } from "../data/themes";

interface ThemeContextValue {
  theme: CinematicTheme;
  manualThemeId: ThemeId | null;
  setManualTheme: (id: ThemeId | null) => void;
  setAutoTheme: (songId: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: THEMES[THEME_ORDER[0]],
  manualThemeId: null,
  setManualTheme: () => {},
  setAutoTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [manualThemeId, setManualThemeId] = useState<ThemeId | null>(null);
  const [autoTheme, setAutoThemeState] = useState<CinematicTheme>(THEMES[THEME_ORDER[0]]);

  const setManualTheme = useCallback((id: ThemeId | null) => {
    setManualThemeId(id);
  }, []);

  const setAutoTheme = useCallback((songId: string) => {
    const t = getThemeForSong(songId);
    setAutoThemeState(t);
  }, []);

  const theme = manualThemeId ? THEMES[manualThemeId] : autoTheme;

  return (
    <ThemeContext.Provider value={{ theme, manualThemeId, setManualTheme, setAutoTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export { THEMES, THEME_ORDER };
export type { ThemeId };
