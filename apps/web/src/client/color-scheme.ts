import { useSyncExternalStore } from 'react';

export type ColorScheme = 'light' | 'dark';

/** Also read by `public/color-scheme.js`, which applies the scheme before the first paint. */
export const COLOR_SCHEME_KEY = 'somequote.color-scheme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

function isColorScheme(value: unknown): value is ColorScheme {
  return value === 'light' || value === 'dark';
}

function savedScheme(): ColorScheme | null {
  try {
    const saved = localStorage.getItem(COLOR_SCHEME_KEY);
    return isColorScheme(saved) ? saved : null;
  } catch {
    return null;
  }
}

function systemScheme(): ColorScheme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function currentColorScheme(): ColorScheme {
  const applied = document.documentElement.dataset.colorScheme;
  return isColorScheme(applied) ? applied : (savedScheme() ?? systemScheme());
}

/**
 * Safari tints its toolbars from `theme-color` and from the page behind them. The page is always an
 * opaque `--paper`, so the meta tag follows it. Setting a different value first makes Safari repaint.
 */
function syncBrowserChrome(scheme: ColorScheme): void {
  const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor && paper && themeColor.content !== paper) {
    themeColor.content = paper === '#ffffff' ? '#000000' : '#ffffff';
    themeColor.content = paper;
  }
  const statusBar = document.querySelector<HTMLMetaElement>(
    'meta[name="apple-mobile-web-app-status-bar-style"]',
  );
  const style = scheme === 'dark' ? 'black-translucent' : 'default';
  if (statusBar && statusBar.content !== style) statusBar.content = style;
}

function applyColorScheme(scheme: ColorScheme): void {
  document.documentElement.dataset.colorScheme = scheme;
  syncBrowserChrome(scheme);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const system = window.matchMedia(DARK_QUERY);
  const followSystem = () => {
    if (!savedScheme()) applyColorScheme(systemScheme());
  };
  system.addEventListener('change', followSystem);
  return () => {
    listeners.delete(listener);
    system.removeEventListener('change', followSystem);
  };
}

export function useColorScheme(): ColorScheme {
  return useSyncExternalStore(subscribe, currentColorScheme, () => 'light');
}

/** Switches and remembers the scheme. The page changes at once: no fade, no transition. */
export function switchColorScheme(scheme: ColorScheme): void {
  try {
    localStorage.setItem(COLOR_SCHEME_KEY, scheme);
  } catch {
    // Storage is optional; the scheme still applies for this visit.
  }
  applyColorScheme(scheme);
}
