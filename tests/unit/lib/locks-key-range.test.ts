import { describe, expect, it } from 'vitest';
import { generateLockKey } from '../../../server/lib/locks';

const INT8_MIN = -(2n ** 63n);
const INT8_MAX = 2n ** 63n - 1n;

describe('generateLockKey int8 range', () => {
  it('produces keys within Postgres int8 range for adversarial inputs', () => {
    const cases: Array<[string, string]> = [
      ['1', '1'],
      ['ffffffffffffffff', 'ffffffffffffffff'],
      ['org-with-high-hash', 'fund-9999999'],
      ['z', 'z'],
    ];
    for (const [orgId, fundId] of cases) {
      const key = generateLockKey(orgId, fundId);
      expect(key).toBeGreaterThanOrEqual(INT8_MIN);
      expect(key).toBeLessThanOrEqual(INT8_MAX);
    }
  });
});
