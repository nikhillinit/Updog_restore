import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useElapsedSeconds } from '@/components/sensitivity/_shared/useElapsedSeconds';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useElapsedSeconds', () => {
  it('returns 0 when isActive is false initially', () => {
    const { result } = renderHook(({ isActive }) => useElapsedSeconds(isActive), {
      initialProps: { isActive: false },
    });
    expect(result.current).toBe(0);
  });

  it('returns 0 immediately when isActive flips to true', () => {
    const { result, rerender } = renderHook(({ isActive }) => useElapsedSeconds(isActive), {
      initialProps: { isActive: false },
    });
    rerender({ isActive: true });
    expect(result.current).toBe(0);
  });

  it('ticks to 1 after 1000ms', () => {
    const { result, rerender } = renderHook(({ isActive }) => useElapsedSeconds(isActive), {
      initialProps: { isActive: false },
    });
    rerender({ isActive: true });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1);
  });

  it('ticks to 3 after 3000ms total', () => {
    const { result, rerender } = renderHook(({ isActive }) => useElapsedSeconds(isActive), {
      initialProps: { isActive: false },
    });
    rerender({ isActive: true });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(3);
  });

  it('returns 0 again when isActive flips back to false', () => {
    const { result, rerender } = renderHook(({ isActive }) => useElapsedSeconds(isActive), {
      initialProps: { isActive: false },
    });
    rerender({ isActive: true });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(2);
    rerender({ isActive: false });
    expect(result.current).toBe(0);
  });

  it('unmount does not throw', () => {
    const { unmount, rerender } = renderHook(({ isActive }) => useElapsedSeconds(isActive), {
      initialProps: { isActive: false },
    });
    rerender({ isActive: true });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(() => unmount()).not.toThrow();
  });
});
