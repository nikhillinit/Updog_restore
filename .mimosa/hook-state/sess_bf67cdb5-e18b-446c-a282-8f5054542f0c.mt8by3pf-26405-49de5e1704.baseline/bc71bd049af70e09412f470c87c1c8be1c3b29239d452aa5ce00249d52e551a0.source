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

describe('current plan version fund ownership', () => {
  it('accepts a current plan version found inside the authoritative fund scope', async () => {
    await expect(
      assertOwnedByFund({
        db: ownershipDatabase([{ id: 51 }]),
        fundId: 7,
        ref: { kind: 'current_plan_version', id: 51 },
      })
    ).resolves.toBeUndefined();
  });

  it('rejects a current plan version absent from the authoritative fund scope', async () => {
    await expect(
      assertOwnedByFund({
        db: ownershipDatabase([]),
        fundId: 7,
        ref: { kind: 'current_plan_version', id: 51 },
      })
    ).rejects.toBeInstanceOf(FundScopeError);
  });
});
