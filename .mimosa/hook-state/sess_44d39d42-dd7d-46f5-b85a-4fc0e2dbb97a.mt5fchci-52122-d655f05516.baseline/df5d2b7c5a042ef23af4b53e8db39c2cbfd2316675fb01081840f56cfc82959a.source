import { describe, expect, it } from 'vitest';

import { computeLegacyUserBucket, computeLegacyUserHash } from '../unifiedClientFlags';

function legacyReferenceHash(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash &= hash;
  }
  return Math.abs(hash);
}

describe('unifiedClientFlags rollout parity', () => {
  it('matches the legacy hash for deterministic sample IDs', () => {
    const ids = Array.from({ length: 100 }, (_, idx) => `user-${idx.toString().padStart(3, '0')}`);
    for (const id of ids) {
      expect(computeLegacyUserHash(id)).toBe(legacyReferenceHash(id));
      expect(computeLegacyUserBucket(id)).toBe(legacyReferenceHash(id) % 100);
    }
  });
});
