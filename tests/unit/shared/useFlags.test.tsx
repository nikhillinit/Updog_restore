import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFlagSnapshot, useFlag } from '@/shared/useFlags';

describe('Wave 3 useFlags consumer', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    delete (import.meta.env as Record<string, unknown>)['VITE_ENABLE_NEW_IA'];
  });

  afterEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    consoleWarnSpy.mockRestore();
    delete (import.meta.env as Record<string, unknown>)['VITE_ENABLE_NEW_IA'];
  });

  it('prefers runtime overrides over env values and defaults', () => {
    (import.meta.env as Record<string, unknown>)['VITE_ENABLE_NEW_IA'] = 'false';
    localStorage.setItem('ff_enable_new_ia', '1');

    expect(getFlagSnapshot().enable_new_ia).toBe(true);
  });

  it('lets query params override local storage for individual flags', () => {
    localStorage.setItem('ff_enable_new_ia', '0');
    window.history.replaceState({}, '', '/?ff_enable_new_ia=1');

    const { result } = renderHook(() => useFlag('enable_new_ia'));

    expect(result.current).toBe(true);
  });
});
