import { describe, expect, it } from 'vitest';

import { canonicalSha256 } from '@shared/lib/canonical-hash';

describe('canonicalSha256', () => {
  it('is independent of object key order', () => {
    expect(canonicalSha256({ a: 1, b: { c: 2, d: 3 } })).toBe(
      canonicalSha256({ b: { d: 3, c: 2 }, a: 1 })
    );
  });

  it('drops undefined object keys', () => {
    expect(canonicalSha256({ a: 1, b: undefined })).toBe(canonicalSha256({ a: 1 }));
  });

  it('serializes Date values by timestamp', () => {
    expect(canonicalSha256({ createdAt: new Date('2026-06-24T00:00:00.000Z') })).toBe(
      canonicalSha256({ createdAt: '2026-06-24T00:00:00.000Z' })
    );
    expect(canonicalSha256({ createdAt: new Date('2026-06-24T00:00:00.000Z') })).not.toBe(
      canonicalSha256({ createdAt: new Date('2026-06-24T00:00:01.000Z') })
    );
  });
});
