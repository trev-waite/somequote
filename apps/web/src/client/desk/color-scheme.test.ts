import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { preferReducedMotion } from '../test-render';
import { COLOR_SCHEME_KEY, currentColorScheme, switchColorScheme } from './color-scheme';

let meta: HTMLMetaElement;

beforeEach(() => {
  preferReducedMotion(false);
  meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = '#ffffff';
  document.head.append(meta);
});

afterEach(() => {
  meta.remove();
  localStorage.clear();
  delete document.documentElement.dataset.colorScheme;
  document.documentElement.style.removeProperty('--paper');
});

describe('switchColorScheme', () => {
  it('applies, remembers, and tints the browser chrome with the page color', () => {
    document.documentElement.style.setProperty('--paper', '#000000');
    switchColorScheme('dark');

    expect(document.documentElement.dataset.colorScheme).toBe('dark');
    expect(currentColorScheme()).toBe('dark');
    expect(localStorage.getItem(COLOR_SCHEME_KEY)).toBe('dark');
    expect(meta.content).toBe('#000000');
  });

  it('follows the saved choice when nothing has been applied yet', () => {
    localStorage.setItem(COLOR_SCHEME_KEY, 'dark');
    expect(currentColorScheme()).toBe('dark');
  });
});
