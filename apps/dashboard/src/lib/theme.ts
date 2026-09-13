import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
export type ThemeMode = Theme | 'system';

const storageKey = 'workerdeck-theme';

function preferredTheme(): ThemeMode {
  const saved = window.localStorage.getItem(storageKey);
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  return 'system';
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(mode: ThemeMode, theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0b0d0f' : '#f5f6f7');
}

export function initializeTheme(): void {
  const mode = preferredTheme();
  applyTheme(mode, mode === 'system' ? systemTheme() : mode);
}

function suppressThemeTransitions(): void {
  const style = document.createElement('style');
  style.dataset.themeTransitionGuard = '';
  style.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.append(style);
  void document.documentElement.offsetHeight;
  requestAnimationFrame(() => style.remove());
}

export function useTheme(): [ThemeMode, Theme, () => void] {
  const [mode, setMode] = useState<ThemeMode>(preferredTheme);
  const [system, setSystem] = useState<Theme>(systemTheme);
  const theme = mode === 'system' ? system : mode;

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const update = () => setSystem(media.matches ? 'light' : 'dark');
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    applyTheme(mode, theme);
    window.localStorage.setItem(storageKey, mode);
  }, [mode, theme]);

  const toggleTheme = () => {
    suppressThemeTransitions();
    setMode(theme === 'light' ? 'dark' : 'light');
  };

  return [mode, theme, toggleTheme];
}
