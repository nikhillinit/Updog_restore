import { describe, it, expect } from 'vitest';
import { findRawNumbers, assertNoRawNumbers } from '../../helpers/no-raw-numbers';

describe('findRawNumbers', () => {
  describe('positive cases (no violations)', () => {
    it('returns empty violations for an object with only string values', () => {
      const obj = {
        totals: { carry: '42.50', mgmtFee: '1000.00' },
        label: 'test',
      };
      const result = findRawNumbers(obj);
      expect(result.violations).toEqual([]);
    });

    it('returns empty violations for null and undefined values', () => {
      const obj = { a: null, b: undefined, c: { d: null } };
      const result = findRawNumbers(obj);
      expect(result.violations).toEqual([]);
    });

    it('returns empty violations for booleans', () => {
      const obj = { active: true, deleted: false };
      const result = findRawNumbers(obj);
      expect(result.violations).toEqual([]);
    });

    it('returns empty violations for empty objects and arrays', () => {
      const result = findRawNumbers({ items: [], nested: {} });
      expect(result.violations).toEqual([]);
    });

    it('returns empty violations when all numbers are allowlisted (exact)', () => {
      const obj = { meta: { version: 2 }, pagination: { page: 1 } };
      const result = findRawNumbers(obj, {
        allowlist: ['meta.version', 'pagination.page'],
      });
      expect(result.violations).toEqual([]);
    });

    it('returns empty violations when numbers are covered by prefix wildcard', () => {
      const obj = {
        pagination: { page: 1, total: 50, perPage: 25 },
        data: { amount: '100.00' },
      };
      const result = findRawNumbers(obj, { allowlist: ['pagination.*'] });
      expect(result.violations).toEqual([]);
    });

    it('handles deeply nested string values', () => {
      const obj = {
        a: { b: { c: { d: { e: '123.456' } } } },
      };
      const result = findRawNumbers(obj);
      expect(result.violations).toEqual([]);
    });
  });

  describe('negative cases (violations found)', () => {
    it('detects a top-level raw number', () => {
      const obj = { amount: 42.5 };
      const result = findRawNumbers(obj);
      expect(result.violations).toEqual([{ path: 'amount', value: 42.5 }]);
    });

    it('detects nested raw numbers', () => {
      const obj = {
        totals: { carry: 100, mgmtFee: '50.00' },
        summary: { irr: 0.15 },
      };
      const result = findRawNumbers(obj);
      expect(result.violations).toHaveLength(2);
      expect(result.violations).toContainEqual({ path: 'totals.carry', value: 100 });
      expect(result.violations).toContainEqual({ path: 'summary.irr', value: 0.15 });
    });

    it('detects raw numbers inside arrays', () => {
      const obj = {
        items: [
          { name: 'A', value: 10 },
          { name: 'B', value: '20.00' },
          { name: 'C', value: 30 },
        ],
      };
      const result = findRawNumbers(obj);
      expect(result.violations).toEqual([
        { path: 'items[0].value', value: 10 },
        { path: 'items[2].value', value: 30 },
      ]);
    });

    it('detects bare numbers in arrays', () => {
      const obj = { values: [1, '2', 3] };
      const result = findRawNumbers(obj);
      expect(result.violations).toEqual([
        { path: 'values[0]', value: 1 },
        { path: 'values[2]', value: 3 },
      ]);
    });

    it('detects numbers not covered by allowlist', () => {
      const obj = {
        meta: { version: 2 },
        totals: { carry: 42.5 },
      };
      const result = findRawNumbers(obj, { allowlist: ['meta.version'] });
      expect(result.violations).toEqual([{ path: 'totals.carry', value: 42.5 }]);
    });

    it('does not allowlist children when entry lacks wildcard', () => {
      const obj = {
        pagination: { page: 1, total: 50 },
      };
      // "pagination" without ".*" should NOT cover children
      const result = findRawNumbers(obj, { allowlist: ['pagination'] });
      expect(result.violations).toHaveLength(2);
      expect(result.violations).toContainEqual({ path: 'pagination.page', value: 1 });
      expect(result.violations).toContainEqual({ path: 'pagination.total', value: 50 });
    });

    it('detects NaN, Infinity, and negative numbers', () => {
      const obj = { a: NaN, b: Infinity, c: -Infinity, d: -42 };
      const result = findRawNumbers(obj);
      expect(result.violations).toHaveLength(4);
    });

    it('detects zero as a raw number', () => {
      const obj = { balance: 0 };
      const result = findRawNumbers(obj);
      expect(result.violations).toEqual([{ path: 'balance', value: 0 }]);
    });
  });

  describe('edge cases', () => {
    it('handles a top-level number', () => {
      const result = findRawNumbers(42);
      // Top-level number has empty-string path
      expect(result.violations).toEqual([{ path: '', value: 42 }]);
    });

    it('handles a top-level string', () => {
      const result = findRawNumbers('hello');
      expect(result.violations).toEqual([]);
    });

    it('handles a top-level null', () => {
      const result = findRawNumbers(null);
      expect(result.violations).toEqual([]);
    });

    it('handles a top-level array', () => {
      const result = findRawNumbers([1, '2', 3]);
      expect(result.violations).toEqual([
        { path: '[0]', value: 1 },
        { path: '[2]', value: 3 },
      ]);
    });

    it('handles nested arrays', () => {
      const obj = {
        matrix: [
          [1, 2],
          [3, 4],
        ],
      };
      const result = findRawNumbers(obj);
      expect(result.violations).toHaveLength(4);
      expect(result.violations[0]).toEqual({ path: 'matrix[0][0]', value: 1 });
    });

    it('handles mixed object/array nesting', () => {
      const obj = {
        items: [{ sub: { val: 99 } }],
      };
      const result = findRawNumbers(obj);
      expect(result.violations).toEqual([{ path: 'items[0].sub.val', value: 99 }]);
    });

    it('handles no options argument', () => {
      const result = findRawNumbers({ x: 1 });
      expect(result.violations).toHaveLength(1);
    });

    it('handles empty allowlist', () => {
      const result = findRawNumbers({ x: 1 }, { allowlist: [] });
      expect(result.violations).toHaveLength(1);
    });
  });
});

describe('assertNoRawNumbers', () => {
  it('does not throw when no violations exist', () => {
    const obj = { amount: '42.50', label: 'test' };
    expect(() => assertNoRawNumbers(obj)).not.toThrow();
  });

  it('returns the result when no violations exist', () => {
    const obj = { amount: '42.50' };
    const result = assertNoRawNumbers(obj);
    expect(result.violations).toEqual([]);
  });

  it('throws with descriptive message when violations exist', () => {
    const obj = { totals: { carry: 42.5 }, meta: { irr: 0.15 } };
    expect(() => assertNoRawNumbers(obj)).toThrow(/Found 2 raw number\(s\)/);
  });

  it('throw message includes violation paths', () => {
    const obj = { amount: 100 };
    try {
      assertNoRawNumbers(obj);
      expect.unreachable('should have thrown');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('amount: 100');
    }
  });

  it('respects allowlist and only throws for non-allowed paths', () => {
    const obj = { meta: { version: 2 }, totals: { carry: 42.5 } };
    expect(() => assertNoRawNumbers(obj, { allowlist: ['meta.version'] })).toThrow(
      /Found 1 raw number/
    );
  });

  it('does not throw when all violations are allowlisted', () => {
    const obj = { meta: { version: 2 } };
    expect(() => assertNoRawNumbers(obj, { allowlist: ['meta.version'] })).not.toThrow();
  });
});
