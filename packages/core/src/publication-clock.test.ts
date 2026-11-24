import { describe, expect, it } from 'vitest';
import {
  addDays,
  isPublicationDate,
  nextPublicationAt,
  parsePublicationDate,
  publicationDateAt,
  publicationStartsAt,
} from './publication-clock';

const date = parsePublicationDate;
const HOUR_MS = 60 * 60 * 1000;

describe('publicationDateAt', () => {
  it('rolls over at midnight Eastern daylight time (UTC−4)', () => {
    expect(publicationDateAt(new Date('2026-10-19T03:59:59.999Z'))).toBe('2026-10-18');
    expect(publicationDateAt(new Date('2026-10-19T04:00:00.000Z'))).toBe('2026-10-19');
  });

  it('rolls over at midnight Eastern standard time (UTC−5)', () => {
    expect(publicationDateAt(new Date('2026-01-15T04:59:59.999Z'))).toBe('2026-01-14');
    expect(publicationDateAt(new Date('2026-01-15T05:00:00.000Z'))).toBe('2026-01-15');
  });

  it('keeps the calendar day through the hour that repeats when clocks fall back', () => {
    expect(publicationDateAt(new Date('2026-11-01T05:30:00Z'))).toBe('2026-11-01');
    expect(publicationDateAt(new Date('2026-11-01T06:30:00Z'))).toBe('2026-11-01');
  });
});

describe('publicationStartsAt', () => {
  it('handles the 23-hour day when clocks spring forward', () => {
    const start = publicationStartsAt(date('2026-03-08'));
    const next = publicationStartsAt(date('2026-03-09'));
    expect(start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(next.toISOString()).toBe('2026-03-09T04:00:00.000Z');
    expect(next.getTime() - start.getTime()).toBe(23 * HOUR_MS);
  });

  it('handles the 25-hour day when clocks fall back', () => {
    const start = publicationStartsAt(date('2026-11-01'));
    const next = publicationStartsAt(date('2026-11-02'));
    expect(start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(next.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(next.getTime() - start.getTime()).toBe(25 * HOUR_MS);
  });

  it('starts every day at 04:00 or 05:00 UTC, the hours the cron triggers cover', () => {
    for (let day = date('2026-01-01'); day < '2031-01-01'; day = addDays(day, 1)) {
      const start = publicationStartsAt(day);
      expect([4, 5]).toContain(start.getUTCHours());
      expect(publicationDateAt(start)).toBe(day);
      expect(publicationDateAt(new Date(start.getTime() - 1))).toBe(addDays(day, -1));
    }
  });
});

describe('nextPublicationAt', () => {
  it('points at the next Eastern midnight across a daylight saving change', () => {
    expect(nextPublicationAt(new Date('2026-11-01T12:00:00Z')).toISOString()).toBe(
      '2026-11-02T05:00:00.000Z',
    );
    expect(nextPublicationAt(new Date('2026-03-08T04:59:59Z')).toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    );
  });
});

describe('publication dates', () => {
  it('accepts only real calendar days in YYYY-MM-DD form', () => {
    expect(isPublicationDate('2028-02-29')).toBe(true);
    for (const invalid of [
      '2026-02-29',
      '2026-02-30',
      '2026-13-01',
      '2026-1-1',
      '26-01-01',
      '2026-01-01\n',
      '2026-01-01\r',
      '2026-01-01\u2028',
      '2026-01-01\u2029',
    ]) {
      expect(isPublicationDate(invalid)).toBe(false);
    }
    expect(isPublicationDate('2026-01-01T00:00:00Z')).toBe(false);
    expect(() => parsePublicationDate('tomorrow')).toThrow();
  });

  it('adds days across month, year, and leap-day boundaries', () => {
    expect(addDays(date('2028-02-28'), 1)).toBe('2028-02-29');
    expect(addDays(date('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(date('2026-03-01'), -1)).toBe('2026-02-28');
  });
});
