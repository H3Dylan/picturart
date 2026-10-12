import type { Theme } from '@picturart/shared';
import { useEffect } from 'react';

const STORAGE_KEY = 'picturart.theme';

/** Applique le thème : `auto` suit le réglage du téléphone (tokens.css). */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  const meta = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (theme !== 'auto' && bg) for (const m of meta) m.content = bg;

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // stockage indisponible (navigation privée) : le thème vaut pour cette visite
  }
}

/** Thème mémorisé sur l'appareil, appliqué avant la connexion pour éviter un flash. */
export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'auto') return value;
  } catch {
    // ignore
  }
  return 'auto';
}

export function useApplyTheme(theme: Theme | undefined) {
  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);
}
