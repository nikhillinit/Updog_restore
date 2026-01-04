/**
 * JSON Diff Utility Tests
 *
 * Tests for computeDiff and getDiffSummary functions.
 *
 * Run: npm test -- diff.test.ts
 *
 * @module shared/utils/__tests__/diff
 */

import { describe, it, expect } from 'vitest';
import { computeDiff, getDiffSummary, type DiffResult } from '../diff';

describe('computeDiff', () => {
  describe('basic operations', () => {
    it('should detect no changes for identical objects', () => {
      const base = { a: 1, b: 'hello', c: true };
      const comparison = { a: 1, b: 'hello', c: true };

      const result = computeDiff(base, comparison);

      expect(result.addedKeys).toEqual([]);
      expect(result.removedKeys).toEqual([]);
      expect(result.modifiedKeys).toEqual([]);
      expect(result.totalChanges).toBe(0);
    });

    it('should detect added keys', () => {
      const base = { a: 1 };
      const comparison = { a: 1, b: 2, c: 3 };

      const result = computeDiff(base, comparison);

      expect(result.addedKeys).toEqual(['b', 'c']);
      expect(result.removedKeys).toEqual([]);
      expect(result.modifiedKeys).toEqual([]);
      expect(result.totalChanges).toBe(2);
    });

    it('should detect removed keys', () => {
      const base = { a: 1, b: 2, c: 3 };
      const comparison = { a: 1 };

      const result = computeDiff(base, comparison);

      expect(result.addedKeys).toEqual([]);
      expect(result.removedKeys).toEqual(['b', 'c']);
      expect(result.modifiedKeys).toEqual([]);
      expect(result.totalChanges).toBe(2);
    });

    it('should detect modified keys', () => {
      const base = { a: 1, b: 'hello' };
      const comparison = { a: 2, b: 'world' };

      const result = computeDiff(base, comparison);

      expect(result.addedKeys).toEqual([]);
      expect(result.removedKeys).toEqual([]);
      expect(result.modifiedKeys).toEqual(['a', 'b']);
      expect(result.totalChanges).toBe(2);
    });

    it('should detect mixed changes', () => {
      const base = { a: 1, b: 2 };
      const comparison = { a: 10, c: 3 };

      const result = computeDiff(base, comparison);

      expect(result.addedKeys).toEqual(['c']);
      expect(result.removedKeys).toEqual(['b']);
      expect(result.modifiedKeys).toEqual(['a']);
      expect(result.totalChanges).toBe(3);
    });
  });

  describe('nested objects', () => {
    it('should detect changes in nested objects', () => {
      const base = { config: { timeout: 100, retries: 3 } };
      const comparison = { config: { timeout: 200, retries: 3 } };

      const result = computeDiff(base, comparison);

      expect(result.modifiedKeys).toEqual(['config.timeout']);
      expect(result.totalChanges).toBe(1);
    });

    it('should detect added nested keys', () => {
      const base = { config: { timeout: 100 } };
      const comparison = { config: { timeout: 100, retries: 3, maxSize: 1024 } };

      const result = computeDiff(base, comparison);

      expect(result.addedKeys).toEqual(['config.retries', 'config.maxSize']);
      expect(result.totalChanges).toBe(2);
    });

    it('should detect removed nested keys', () => {
      const base = { config: { timeout: 100, retries: 3, maxSize: 1024 } };
      const comparison = { config: { timeout: 100 } };

      const result = computeDiff(base, comparison);

      expect(result.removedKeys).toEqual(['config.retries', 'config.maxSize']);
      expect(result.totalChanges).toBe(2);
    });

    it('should handle deeply nested objects', () => {
      const base = { a: { b: { c: { d: 1 } } } };
      const comparison = { a: { b: { c: { d: 2 } } } };

      const result = computeDiff(base, comparison);

      expect(result.modifiedKeys).toEqual(['a.b.c.d']);
      expect(result.totalChanges).toBe(1);
    });
  });

  describe('array handling', () => {
    it('should detect array modifications', () => {
      const base = { items: [1, 2, 3] };
      const comparison = { items: [1, 2, 4] };

      const result = computeDiff(base, comparison);

      expect(result.modifiedKeys).toEqual(['items']);
      expect(result.totalChanges).toBe(1);
    });

    it('should detect array length changes', () => {
      const base = { items: [1, 2, 3] };
      const comparison = { items: [1, 2] };

      const result = computeDiff(base, comparison);

      expect(result.modifiedKeys).toEqual(['items']);
    });

    it('should consider identical arrays as unchanged', () => {
      const base = { items: [1, 2, 3] };
      const comparison = { items: [1, 2, 3] };

      const result = computeDiff(base, comparison);

      expect(result.totalChanges).toBe(0);
    });
  });

  describe('type changes', () => {
    it('should detect type changes', () => {
      const base = { value: '100' };
      const comparison = { value: 100 };

      const result = computeDiff(base, comparison);

      expect(result.modifiedKeys).toEqual(['value']);
    });

    it('should detect null to value changes', () => {
      const base = { value: null };
      const comparison = { value: 'hello' };

      const result = computeDiff(base, comparison);

      expect(result.modifiedKeys).toEqual(['value']);
    });
  });

  describe('details', () => {
    it('should include base and comparison values in details', () => {
      const base = { a: 1 };
      const comparison = { a: 2 };

      const result = computeDiff(base, comparison);

      expect(result.details).toHaveLength(1);
      expect(result.details[0]).toEqual({
        path: 'a',
        changeType: 'modified',
        baseValue: 1,
        comparisonValue: 2,
      });
    });

    it('should include only comparisonValue for added keys', () => {
      const base = {};
      const comparison = { a: 1 };

      const result = computeDiff(base, comparison);

      expect(result.details[0]).toEqual({
        path: 'a',
        changeType: 'added',
        comparisonValue: 1,
      });
    });

    it('should include only baseValue for removed keys', () => {
      const base = { a: 1 };
      const comparison = {};

      const result = computeDiff(base, comparison);

      expect(result.details[0]).toEqual({
        path: 'a',
        changeType: 'removed',
        baseValue: 1,
      });
    });
  });
});

describe('getDiffSummary', () => {
  it('should return "No changes" for empty diff', () => {
    const diff: DiffResult = {
      addedKeys: [],
      removedKeys: [],
      modifiedKeys: [],
      details: [],
      totalChanges: 0,
    };

    expect(getDiffSummary(diff)).toBe('No changes');
  });

  it('should summarize added keys only', () => {
    const diff: DiffResult = {
      addedKeys: ['a', 'b'],
      removedKeys: [],
      modifiedKeys: [],
      details: [],
      totalChanges: 2,
    };

    expect(getDiffSummary(diff)).toBe('+2 added');
  });

  it('should summarize removed keys only', () => {
    const diff: DiffResult = {
      addedKeys: [],
      removedKeys: ['a', 'b', 'c'],
      modifiedKeys: [],
      details: [],
      totalChanges: 3,
    };

    expect(getDiffSummary(diff)).toBe('-3 removed');
  });

  it('should summarize modified keys only', () => {
    const diff: DiffResult = {
      addedKeys: [],
      removedKeys: [],
      modifiedKeys: ['a'],
      details: [],
      totalChanges: 1,
    };

    expect(getDiffSummary(diff)).toBe('~1 modified');
  });

  it('should summarize all change types', () => {
    const diff: DiffResult = {
      addedKeys: ['new1', 'new2'],
      removedKeys: ['old'],
      modifiedKeys: ['changed1', 'changed2', 'changed3'],
      details: [],
      totalChanges: 6,
    };

    expect(getDiffSummary(diff)).toBe('+2 added, -1 removed, ~3 modified');
  });
});
