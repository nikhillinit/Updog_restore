import { describe, test, expect } from 'vitest';
import { clampPct, clampInt, toUSD } from '../coerce';

describe('coerce utilities', () => {
  describe('clampPct', () => {
    test('clamps to 0..100 (rounded)', () => {
      expect(clampPct(-2)).toBe(0);
      expect(clampPct(49.6)).toBe(50);
      expect(clampPct(123)).toBe(100);
      expect(clampPct('x' as any)).toBe(0);
      expect(clampPct(NaN)).toBe(0);
      expect(clampPct(Infinity)).toBe(100);
    });

    test('handles normal values correctly', () => {
      expect(clampPct(0)).toBe(0);
      expect(clampPct(50)).toBe(50);
      expect(clampPct(100)).toBe(100);
      expect(clampPct(75.4)).toBe(75);
      expect(clampPct(75.5)).toBe(76);
    });
  });

  describe('clampInt', () => {
    test('clamps and rounds within bounds', () => {
      expect(clampInt(0.4, 1, 10)).toBe(1);
      expect(clampInt(9.6, 1, 10)).toBe(10);
      expect(clampInt('x' as any, 1, 10)).toBe(1);
      expect(clampInt(NaN, 1, 10)).toBe(1);
      expect(clampInt(Infinity, 1, 10)).toBe(10);
    });

    test('handles normal values correctly', () => {
      expect(clampInt(5, 1, 10)).toBe(5);
      expect(clampInt(1, 1, 10)).toBe(1);
      expect(clampInt(10, 1, 10)).toBe(10);
      expect(clampInt(5.4, 1, 10)).toBe(5);
      expect(clampInt(5.5, 1, 10)).toBe(6);
    });

    test('uses default bounds when not specified', () => {
      expect(clampInt(-5)).toBe(0);
      expect(clampInt(1000000)).toBe(1000000);
    });
  });

  describe('toUSD', () => {
    test('formats currency correctly', () => {
      expect(toUSD(1500000)).toMatch(/\$1,500,000/);
      expect(toUSD(0)).toMatch(/\$0/);
      expect(toUSD(123.456, 2)).toMatch(/\$123\.46/);
      expect(toUSD(999999.99, 2)).toMatch(/\$999,999\.99/);
    });

    test('handles edge cases', () => {
      expect(toUSD(-1000)).toMatch(/-\$1,000/);
      expect(toUSD(0.5, 2)).toMatch(/\$0\.50/);
      expect(toUSD(NaN)).toMatch(/NaN/);
    });
  });
});
