import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spies for the Drizzle insert chain, hoisted so the vi.mock factory (itself
// hoisted above imports) can close over them. Mocking `../../../server/db`
// intercepts the writer's `import { db } from '../db'` at the same resolved
// module, so this proof is fully DB-free (the real db.ts side effects never run).
const { insert, values, onConflictDoNothing } = vi.hoisted(() => {
  const onConflictDoNothing = vi.fn(() => Promise.resolve({ rowsAffected: 0 }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  return { insert, values, onConflictDoNothing };
});

vi.mock('../../../server/db', () => ({ db: { insert } }));

import { persistSubstrateShadowReconciliation } from '../../../server/services/substrate-shadow-reconciliation-writer';
import { substrateShadowReconciliations } from '../../../shared/schema';
import type { SubstrateShadowReconciliationRecord } from '../../../server/services/constrained-reserve-substrate-shadow';

const RECORD: SubstrateShadowReconciliationRecord = {
  fundId: 7,
  calculationKey: 'reserve-constrained',
  configuredMode: 'shadow',
  effectiveMode: 'shadow',
  killSwitchActive: false,
  substrateState: 'indicative',
  reconciliationStatus: 'match',
  inputHash: 'a'.repeat(64),
  resultHash: 'b'.repeat(64),
  assumptionsHash: 'c'.repeat(64),
  mismatches: [],
};

describe('persistSubstrateShadowReconciliation (default writer)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues insert(table).values(record).onConflictDoNothing() exactly once against the fund-scoped ledger', async () => {
    await persistSubstrateShadowReconciliation(RECORD);

    expect(insert).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledWith(substrateShadowReconciliations);
    expect(values).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(RECORD);
    // onConflictDoNothing is what makes the append-only insert idempotent.
    expect(onConflictDoNothing).toHaveBeenCalledOnce();
  });

  it('is idempotent-by-construction: a duplicate record still routes through onConflictDoNothing (no throw)', async () => {
    await persistSubstrateShadowReconciliation(RECORD);
    await persistSubstrateShadowReconciliation(RECORD);

    expect(insert).toHaveBeenCalledTimes(2);
    expect(onConflictDoNothing).toHaveBeenCalledTimes(2);
  });
});
