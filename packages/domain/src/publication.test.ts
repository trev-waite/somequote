import { describe, expect, it } from 'vitest';
import { historyCursor } from './publication';
import { parsePublicationDate } from './publication-clock';

const today = parsePublicationDate('2026-10-18');

describe('historyCursor', () => {
  it('starts after today when no cursor is given', () => {
    expect(historyCursor(today, undefined)).toBe('2026-10-19');
  });

  it('keeps a cursor up to tomorrow', () => {
    expect(historyCursor(today, parsePublicationDate('2026-10-01'))).toBe('2026-10-01');
    expect(historyCursor(today, parsePublicationDate('2026-10-19'))).toBe('2026-10-19');
  });

  it('clamps later cursors, so future dates share one page', () => {
    expect(historyCursor(today, parsePublicationDate('2099-01-01'))).toBe('2026-10-19');
  });
});
