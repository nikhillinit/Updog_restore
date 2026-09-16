import { describe, expect, it } from 'vitest';

import { summarizeCapitalCalls, type CapitalCall } from '@/hooks/useLPCapitalCalls';

function call(overrides: Partial<CapitalCall>): CapitalCall {
  return {
    id: 'call',
    fundId: 7,
    fundName: 'Fund VII',
    callNumber: 1,
    callAmount: '250000',
    dueDate: '2026-02-01',
    callDate: '2026-01-15',
    purpose: 'Follow-on reserve',
    status: 'pending',
    paidAmount: '0',
    ...overrides,
  };
}

describe('summarizeCapitalCalls', () => {
  it('counts a partially paid call as pending with only its outstanding balance', () => {
    const summary = summarizeCapitalCalls([
      call({ id: 'a', status: 'pending', callAmount: '250000', paidAmount: '0' }),
      call({
        id: 'b',
        status: 'partial',
        callAmount: '400000',
        paidAmount: '150000',
        dueDate: '2026-01-20',
      }),
      call({ id: 'c', status: 'paid', callAmount: '100000', paidAmount: '100000' }),
      call({ id: 'd', status: 'overdue', callAmount: '50000', paidAmount: '0' }),
    ]);

    expect(summary).toMatchObject({
      totalPending: 2,
      totalPendingAmount: '500000',
      totalDue: 0,
      totalOverdue: 1,
      totalOverdueAmount: '50000',
      nextDueDate: '2026-01-20',
    });
  });
});
