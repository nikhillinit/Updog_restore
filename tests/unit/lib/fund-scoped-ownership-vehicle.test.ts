import { describe, expect, it, vi } from 'vitest';

import {
  assertOwnedByFund,
  FundScopeError,
  type FundScopedOwnershipDatabase,
} from '../../../server/lib/fund-scoped-ownership';

function ownershipDatabase(rows: ReadonlyArray<{ id: number }>): FundScopedOwnershipDatabase {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return {
    select: vi.fn(() => ({ from })),
  };
}

describe('vehicle fund ownership', () => {
  it('accepts a vehicle found inside the authoritative fund scope', async () => {
    await expect(
      assertOwnedByFund({
        db: ownershipDatabase([{ id: 51 }]),
        fundId: 7,
        ref: { kind: 'vehicle', id: 51 },
      })
    ).resolves.toBeUndefined();
  });

  it('rejects a vehicle absent from the authoritative fund scope', async () => {
    await expect(
      assertOwnedByFund({
        db: ownershipDatabase([]),
        fundId: 7,
        ref: { kind: 'vehicle', id: 51 },
      })
    ).rejects.toBeInstanceOf(FundScopeError);
  });
});
