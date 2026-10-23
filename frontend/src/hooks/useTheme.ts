import { useState, useEffect, useCallback } from 'react';
import { ThemeMode } from '../types';

export const THEME_STORAGE_KEY = 'pdf_form_agent_theme';

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'live';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'live' || saved === 'paper' || saved === 'contrast') {
      return saved;
    }
  } catch {
    // ignore storage access error
  }
  return 'live';
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage access error
    }
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      if (prev === 'live') return 'paper';
      if (prev === 'paper') return 'contrast';
      return 'live';
    });
  }, []);

  return {
    theme,
    setTheme,
    toggleTheme,
  };
}
