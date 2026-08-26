// REFLECTION_ID: REFL-021
// This test is linked to: docs/skills/REFL-021-exact-optional-property-types-spread-pattern.md
// Do not rename without updating the reflection's test_file field.

import { describe, expect, it } from 'vitest';

type SearchParams = {
  search?: string;
};

type ModalProps = {
  fundId?: number;
};

function buildUrlParamsUnsafe(search?: string): SearchParams {
  return { search: search || undefined };
}

function buildUrlParamsSafe(search?: string): SearchParams {
  return { ...(search && { search }) };
}

function buildModalPropsUnsafe(fundId?: number): ModalProps {
  return { fundId: fundId ?? undefined };
}

function buildModalPropsSafe(fundId?: number): ModalProps {
  return { ...(fundId != null && { fundId }) };
}

function hasOwnKey<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

describe('REFL-021: exactOptionalPropertyTypes Requires Spread Pattern', () => {
  it('demonstrates the anti-pattern by keeping undefined optional keys present', () => {
    const params = buildUrlParamsUnsafe(undefined);
    const props = buildModalPropsUnsafe(undefined);

    expect(hasOwnKey(params, 'search')).toBe(true);
    expect(params.search).toBeUndefined();
    expect(hasOwnKey(props, 'fundId')).toBe(true);
    expect(props.fundId).toBeUndefined();
  });

  it('uses conditional spreads to omit absent optional values entirely', () => {
    const params = buildUrlParamsSafe(undefined);
    const props = buildModalPropsSafe(undefined);

    expect(hasOwnKey(params, 'search')).toBe(false);
    expect(hasOwnKey(props, 'fundId')).toBe(false);
  });

  it('preserves defined values with the spread pattern', () => {
    const params = buildUrlParamsSafe('growth');
    const props = buildModalPropsSafe(123);

    expect(params).toEqual({ search: 'growth' });
    expect(props).toEqual({ fundId: 123 });
  });

  it('detects the common undefined-coalescing anti-patterns in source snippets', () => {
    const antiPatterns = [
      '<Modal fundId={fundId ?? undefined} />',
      'buildUrl({ search: filters.search || undefined })',
    ];

    antiPatterns.forEach((snippet) => {
      expect(/\?\? undefined|\|\| undefined/.test(snippet)).toBe(true);
    });
  });
});
