// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  clearExpiredData,
  getStorageStats,
  loadFromStorage,
  saveToStorage,
} from '@/lib/storage';

describe('Wave 3 storage boundary', () => {
  const schema = z.object({ value: z.number() });
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.localStorage.clear();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    window.localStorage.clear();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('round trips allowed keys with schema validation', () => {
    expect(saveToStorage('modeling-wizard-progress', { value: 42 }, schema)).toBe(true);

    expect(loadFromStorage('modeling-wizard-progress', schema)).toEqual({ value: 42 });
  });

  it('migrates legacy persisted envelopes before validation', () => {
    window.localStorage.setItem(
      'povc:modeling-wizard-progress',
      JSON.stringify({
        v: 0,
        at: Date.now() - 1_000,
        data: { value: 7 },
      })
    );

    expect(loadFromStorage('modeling-wizard-progress', schema)).toEqual({ value: 7 });
  });

  it('clears malformed and expired namespaced keys without touching foreign keys', () => {
    window.localStorage.setItem('foreign-key', 'keep');
    window.localStorage.setItem(
      'povc:modeling-wizard-progress',
      JSON.stringify({
        v: 1,
        at: Date.now() - 8 * 24 * 60 * 60 * 1000,
        data: { value: 1 },
      })
    );
    window.localStorage.setItem('povc:ui-state', 'not-json');

    clearExpiredData();

    expect(window.localStorage.getItem('foreign-key')).toBe('keep');
    expect(window.localStorage.getItem('povc:modeling-wizard-progress')).toBeNull();
    expect(window.localStorage.getItem('povc:ui-state')).toBeNull();
    expect(getStorageStats()).toEqual({
      available: true,
      itemCount: 1,
      namespacedItems: 0,
      estimatedSize: 0,
    });
  });
});
