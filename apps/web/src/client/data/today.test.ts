import { afterEach, describe, expect, it, vi } from 'vitest';
import { quoteFontReady } from './today';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('quote font readiness', () => {
  it('releases its timeout when the font loads', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { fonts: { load: () => Promise.resolve([]) } });
    await quoteFontReady();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows the quote to render when the font fails', async () => {
    vi.stubGlobal('document', { fonts: { load: () => Promise.reject(new Error('offline')) } });
    await expect(quoteFontReady()).resolves.toBeUndefined();
  });

  it('limits how long a stalled font can delay the quote', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { fonts: { load: () => new Promise(() => undefined) } });
    let ready = false;
    const waiting = quoteFontReady().then(() => {
      ready = true;
    });
    await vi.advanceTimersByTimeAsync(2999);
    expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(ready).toBe(true);
  });
});
