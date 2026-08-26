import { describe, expect, it } from 'vitest';
import { parseMoney, parseIntSafe } from '@/utils/parse-helpers';

describe('parse-helpers', () => {
  describe('parseMoney', () => {
    it('accepts plain currency strings and grouping separators', () => {
      expect(parseMoney('$100')).toBe(100);
      expect(parseMoney('1,000')).toBe(1000);
      expect(parseMoney(' $ 2,500 ')).toBe(2500);
    });

    it('rejects suffix notation instead of partially parsing it', () => {
      expect(parseMoney('1.5M')).toBeUndefined();
    });
  });

  describe('parseIntSafe', () => {
    it('returns undefined for negative or empty values', () => {
      expect(parseIntSafe('-1')).toBeUndefined();
      expect(parseIntSafe('')).toBeUndefined();
    });
  });
});
