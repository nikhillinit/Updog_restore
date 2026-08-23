import { describe, it, expect } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import {
  sortEventsIntoChronology,
  validateCashSourceAllocations,
  validateReliefRows,
  processCallableCommitment,
  initializeEventStreamState,
  processSettledContribution,
  processRealization,
  processDeployment,
  processFundExpense,
  type CashSourceLot,
  type InvestmentLot,
  type CallableCommitmentTracker,
} from '../../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
import { buildMinimalV2Input } from '../../../helpers/v2-input-builder';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../../shared/lib/internal-economics/v2/normalize-input-v2';
import type { V2Event } from '../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';

describe('sortEventsIntoChronology', () => {
  it('sorts by instant first', () => {
    const events: V2Event[] = [
      {
        eventId: 'e-2',
        instant: '2025-04-01T00:00:00Z',
        amountUsd: '100.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'deployment',
        settlementSourceRef: 'ref-2',
      },
      {
        eventId: 'e-1',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '200.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'deployment',
        settlementSourceRef: 'ref-1',
      },
    ];
    const chronology = sortEventsIntoChronology(events);
    expect(chronology[0]!.event!.eventId).toBe('e-1');
    expect(chronology[1]!.event!.eventId).toBe('e-2');
  });

  it('sorts same-instant by phase', () => {
    const events: V2Event[] = [
      {
        eventId: 'dep-1',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '50.000000',
        kind: 'deployment',
        dealId: 'd-1',
        securityId: 's-1',
        cashSourceAllocations: [{ lotId: 'lot-1', amount: '50.000000' }],
      },
      {
        eventId: 'contrib-1',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '100.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'deployment',
        settlementSourceRef: 'ref-1',
      },
    ];
    const chronology = sortEventsIntoChronology(events);
    expect(chronology[0]!.event!.kind).toBe('settled_contribution');
    expect(chronology[1]!.event!.kind).toBe('deployment');
  });

  it('sorts same-instant same-phase by eventId', () => {
    const events: V2Event[] = [
      {
        eventId: 'e-b',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '100.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'deployment',
        settlementSourceRef: 'ref-b',
      },
      {
        eventId: 'e-a',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '200.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'deployment',
        settlementSourceRef: 'ref-a',
      },
    ];
    const chronology = sortEventsIntoChronology(events);
    expect(chronology[0]!.event!.eventId).toBe('e-a');
    expect(chronology[1]!.event!.eventId).toBe('e-b');
  });
});

describe('validateCashSourceAllocations', () => {
  it('passes for valid allocations', () => {
    const lots = new Map<string, CashSourceLot>();
    lots.set('lot-1', {
      lotId: 'lot-1',
      sourceEventId: 'e-1',
      partnerId: 'lp-1',
      originalAmount: new Decimal('1000'),
      remainingBalance: new Decimal('1000'),
    });

    const result = validateCashSourceAllocations(
      [{ lotId: 'lot-1', amount: '500.000000' }],
      lots,
      'e-2'
    );
    expect(result).toBeNull();
  });

  it('refuses missing lot', () => {
    const lots = new Map<string, CashSourceLot>();
    const result = validateCashSourceAllocations(
      [{ lotId: 'nonexistent', amount: '500.000000' }],
      lots,
      'e-2'
    );
    expect(result).not.toBeNull();
    expect(result!.code).toBe('CASH_SOURCE_ALLOCATION_VIOLATION');
  });

  it('refuses over-allocation', () => {
    const lots = new Map<string, CashSourceLot>();
    lots.set('lot-1', {
      lotId: 'lot-1',
      sourceEventId: 'e-1',
      partnerId: 'lp-1',
      originalAmount: new Decimal('100'),
      remainingBalance: new Decimal('100'),
    });

    const result = validateCashSourceAllocations(
      [{ lotId: 'lot-1', amount: '150.000000' }],
      lots,
      'e-2'
    );
    expect(result).not.toBeNull();
    expect(result!.code).toBe('CASH_SOURCE_ALLOCATION_VIOLATION');
  });
});

describe('validateReliefRows', () => {
  it('passes for valid relief', () => {
    const lots = new Map<string, InvestmentLot>();
    lots.set('inv-1', {
      lotId: 'inv-1',
      dealId: 'd-1',
      securityId: 's-1',
      costBasis: new Decimal('1000'),
      relievedAmount: new Decimal(0),
    });

    const result = validateReliefRows(
      [
        {
          investmentLotId: 'inv-1',
          relievedCostBasis: '500.000000',
          allocatedProceeds: '600.000000',
        },
      ],
      lots,
      'e-2'
    );
    expect(result).toBeNull();
  });

  it('refuses missing investment lot', () => {
    const lots = new Map<string, InvestmentLot>();
    const result = validateReliefRows(
      [
        {
          investmentLotId: 'nonexistent',
          relievedCostBasis: '500.000000',
          allocatedProceeds: '600.000000',
        },
      ],
      lots,
      'e-2'
    );
    expect(result).not.toBeNull();
    expect(result!.code).toBe('INVESTMENT_LOT_RELIEF_VIOLATION');
  });

  it('refuses over-relief', () => {
    const lots = new Map<string, InvestmentLot>();
    lots.set('inv-1', {
      lotId: 'inv-1',
      dealId: 'd-1',
      securityId: 's-1',
      costBasis: new Decimal('100'),
      relievedAmount: new Decimal('80'),
    });

    const result = validateReliefRows(
      [
        {
          investmentLotId: 'inv-1',
          relievedCostBasis: '30.000000',
          allocatedProceeds: '40.000000',
        },
      ],
      lots,
      'e-2'
    );
    expect(result).not.toBeNull();
    expect(result!.code).toBe('INVESTMENT_LOT_RELIEF_VIOLATION');
  });
});

describe('processCallableCommitment', () => {
  it('consumes callable on settled contribution', () => {
    const trackers = new Map<string, CallableCommitmentTracker>();
    trackers.set('lp-1', {
      partnerId: 'lp-1',
      remainingCallable: new Decimal('500000'),
    });

    const event: V2Event = {
      eventId: 'e-1',
      instant: '2025-03-01T00:00:00Z',
      amountUsd: '100000.000000',
      kind: 'settled_contribution',
      partnerId: 'lp-1',
      purpose: 'deployment',
      settlementSourceRef: 'ref-1',
    };

    const refusal = processCallableCommitment(event, trackers);
    expect(refusal).toBeNull();
    expect(trackers.get('lp-1')!.remainingCallable.toFixed(6)).toBe('400000.000000');
  });

  it('refuses commitment overrun', () => {
    const trackers = new Map<string, CallableCommitmentTracker>();
    trackers.set('lp-1', {
      partnerId: 'lp-1',
      remainingCallable: new Decimal('50000'),
    });

    const event: V2Event = {
      eventId: 'e-1',
      instant: '2025-03-01T00:00:00Z',
      amountUsd: '100000.000000',
      kind: 'settled_contribution',
      partnerId: 'lp-1',
      purpose: 'deployment',
      settlementSourceRef: 'ref-1',
    };

    const refusal = processCallableCommitment(event, trackers);
    expect(refusal).not.toBeNull();
    expect(refusal!.code).toBe('COMMITMENT_OVERRUN');
  });
});

describe('initializeEventStreamState', () => {
  it('initializes from normalized input', () => {
    const wire = buildMinimalV2Input();
    const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
    expect(normalizeResult.ok).toBe(true);
    if (!normalizeResult.ok) return;

    const state = initializeEventStreamState(normalizeResult.input);
    expect(state.callableTrackers.size).toBe(2);
    expect(state.partnerLedgers.size).toBe(2);
    expect(state.endingCash.toFixed(6)).toBe('550000.000000');
  });
});

describe('processSettledContribution', () => {
  it('creates cash source lot and updates ledger', () => {
    const wire = buildMinimalV2Input();
    const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
    if (!normalizeResult.ok) return;

    const state = initializeEventStreamState(normalizeResult.input);
    const event = {
      eventId: 'e-1',
      instant: '2025-03-01T00:00:00Z',
      amountUsd: '100000.000000',
      kind: 'settled_contribution' as const,
      partnerId: 'lp-1',
      purpose: 'deployment' as const,
      settlementSourceRef: 'ref-1',
    };

    processSettledContribution(event, state);
    expect(state.cashSourceLots.has('csl:e-1')).toBe(true);
    expect(state.endingCash.toFixed(6)).toBe('650000.000000');
    expect(state.partnerLedgers.get('lp-1')!.settledCapital.toFixed(6)).toBe('600000.000000');
  });
});

describe('processDeployment', () => {
  it('creates investment lot and consumes cash', () => {
    const wire = buildMinimalV2Input();
    const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
    if (!normalizeResult.ok) return;

    const state = initializeEventStreamState(normalizeResult.input);

    processSettledContribution(
      {
        eventId: 'contrib-1',
        instant: '2025-02-01T00:00:00Z',
        amountUsd: '200000.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'deployment',
        settlementSourceRef: 'ref-1',
      },
      state
    );

    const result = processDeployment(
      {
        eventId: 'dep-1',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '150000.000000',
        kind: 'deployment',
        dealId: 'd-1',
        securityId: 's-1',
        cashSourceAllocations: [{ lotId: 'csl:contrib-1', amount: '150000.000000' }],
      },
      state
    );

    expect(result).toBeNull();
    expect(state.investmentLots.has('inv:d-1:s-1:dep-1')).toBe(true);
    expect(state.endingCash.toFixed(6)).toBe('600000.000000');
  });

  it('refuses invalid cash source lot', () => {
    const wire = buildMinimalV2Input();
    const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
    if (!normalizeResult.ok) return;

    const state = initializeEventStreamState(normalizeResult.input);
    const result = processDeployment(
      {
        eventId: 'dep-1',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '100.000000',
        kind: 'deployment',
        dealId: 'd-1',
        securityId: 's-1',
        cashSourceAllocations: [{ lotId: 'nonexistent', amount: '100.000000' }],
      },
      state
    );
    expect(result).not.toBeNull();
    expect(result!.code).toBe('CASH_SOURCE_ALLOCATION_VIOLATION');
  });
});

describe('processRealization', () => {
  it('creates proceeds lot after relief', () => {
    const wire = buildMinimalV2Input();
    const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
    if (!normalizeResult.ok) return;

    const state = initializeEventStreamState(normalizeResult.input);

    processSettledContribution(
      {
        eventId: 'contrib-1',
        instant: '2025-02-01T00:00:00Z',
        amountUsd: '100000.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'deployment',
        settlementSourceRef: 'ref-1',
      },
      state
    );

    processDeployment(
      {
        eventId: 'dep-1',
        instant: '2025-02-15T00:00:00Z',
        amountUsd: '100000.000000',
        kind: 'deployment',
        dealId: 'd-1',
        securityId: 's-1',
        cashSourceAllocations: [{ lotId: 'csl:contrib-1', amount: '100000.000000' }],
      },
      state
    );

    const result = processRealization(
      {
        eventId: 'real-1',
        instant: '2025-05-01T00:00:00Z',
        amountUsd: '120000.000000',
        kind: 'realization',
        dealId: 'd-1',
        reliefRows: [
          {
            investmentLotId: 'inv:d-1:s-1:dep-1',
            relievedCostBasis: '100000.000000',
            allocatedProceeds: '120000.000000',
          },
        ],
        recyclingTag: 'none',
      },
      state
    );

    expect(result).toBeNull();
    expect(state.cashSourceLots.has('proceeds:real-1')).toBe(true);
    expect(state.cashSourceLots.get('proceeds:real-1')!.remainingBalance.toFixed(6)).toBe(
      '120000.000000'
    );
  });
});

describe('processFundExpense', () => {
  it('consumes cash source allocations', () => {
    const wire = buildMinimalV2Input();
    const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
    if (!normalizeResult.ok) return;

    const state = initializeEventStreamState(normalizeResult.input);

    processSettledContribution(
      {
        eventId: 'contrib-1',
        instant: '2025-02-01T00:00:00Z',
        amountUsd: '10000.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'fund_expense',
        settlementSourceRef: 'ref-1',
      },
      state
    );

    const result = processFundExpense(
      {
        eventId: 'exp-1',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '5000.000000',
        kind: 'fund_expense_payment',
        expenseCategory: 'legal',
        cashSourceAllocations: [{ lotId: 'csl:contrib-1', amount: '5000.000000' }],
      },
      state
    );

    expect(result).toBeNull();
    expect(state.cashSourceLots.get('csl:contrib-1')!.remainingBalance.toFixed(6)).toBe(
      '5000.000000'
    );
  });
});
