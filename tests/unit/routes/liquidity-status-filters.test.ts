import { describe, expect, it } from 'vitest';

import { isExecutedTransaction, isUpcomingTransaction } from '../../../server/routes/liquidity';
import { TransactionStatusSchema } from '../../../shared/schemas/cashflow-schema';

// The liquidity routes cannot be reached over JSON today (CashTransactionSchema
// uses a bare z.date()), so the status predicates are pinned directly.
const statuses = TransactionStatusSchema.options;

describe('liquidity route status predicates', () => {
  it('analysis keeps executed history only', () => {
    expect(statuses.filter((status) => isExecutedTransaction({ status }))).toEqual(['executed']);
  });

  it('forecast keeps planned, pending and approved rows only', () => {
    expect(statuses.filter((status) => isUpcomingTransaction({ status }))).toEqual([
      'planned',
      'pending',
      'approved',
    ]);
  });

  it('cancelled and failed rows reach neither surface', () => {
    for (const status of ['cancelled', 'failed'] as const) {
      expect(isExecutedTransaction({ status })).toBe(false);
      expect(isUpcomingTransaction({ status })).toBe(false);
    }
  });
});
