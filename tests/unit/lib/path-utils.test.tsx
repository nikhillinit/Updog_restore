import { describe, expect, it } from 'vitest';
import { deepGet, deepMerge, deepSet, normalizePath } from '@/lib/path-utils';

describe('Wave 2 path-utils boundary', () => {
  it('normalizes malformed dotted paths before traversal', () => {
    expect(normalizePath(' portfolio..companies. 0 .name ')).toEqual([
      'portfolio',
      'companies',
      '0',
      'name',
    ]);
  });

  it('creates nested object and array structure safely', () => {
    const target = {};

    deepSet(target, 'portfolio.companies.0.name', 'Alpha');

    expect(target).toEqual({
      portfolio: {
        companies: [{ name: 'Alpha' }],
      },
    });
  });

  it('returns the provided default when a path is missing', () => {
    expect(deepGet({ portfolio: { companies: [] } }, 'portfolio.companies.1.name', 'missing')).toBe(
      'missing'
    );
  });

  it('merges new keys without discarding the existing nested object', () => {
    const target = {
      portfolio: {
        totals: {
          committed: 10,
        },
      },
    };

    const merged = deepMerge(target, 'portfolio.totals', { remaining: 4 });

    expect(merged).toEqual({
      portfolio: {
        totals: {
          committed: 10,
          remaining: 4,
        },
      },
    });
  });
});
