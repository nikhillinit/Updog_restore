import { describe, it, expect } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import { canonicalJson } from '../../../../shared/lib/canonical-json';
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
  type EventStreamState,
  type CashSourceLot,
  type InvestmentLot,
  type CallableCommitmentTracker,
} from '../../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
import { buildMinimalV2Input } from '../../../helpers/v2-input-builder';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../../shared/lib/internal-economics/v2/normalize-input-v2';
import type { V2Event } from '../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';
import { processEventsV2ForTest } from '../../../../shared/lib/internal-economics/v2/derive-composite-v2';

function makeEventStreamState(): EventStreamState {
  const result = verifyAndNormalizeInternalEconomicsInputV2(buildMinimalV2Input());
  if (!result.ok) throw new Error('normalization failed');
  return initializeEventStreamState(result.input);
}

function snapshotMutableEventLaneState(state: EventStreamState): string {
  const sortedEntries = <T>(map: Map<string, T>): [string, T][] =>
    [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return canonicalJson({
    cashSourceLots: sortedEntries(state.cashSourceLots).map(([mapKey, lot]) => ({
      mapKey,
      lotId: lot.lotId,
      sourceEventId: lot.sourceEventId,
      partnerId: lot.partnerId,
      ...(lot.dealId === undefined ? {} : { dealId: lot.dealId }),
      originalAmount: lot.originalAmount.toFixed(6),
      remainingBalance: lot.remainingBalance.toFixed(6),
    })),
    investmentLots: sortedEntries(state.investmentLots).map(([mapKey, lot]) => ({
      mapKey,
      lotId: lot.lotId,
      dealId: lot.dealId,
      securityId: lot.securityId,
      costBasis: lot.costBasis.toFixed(6),
      relievedAmount: lot.relievedAmount.toFixed(6),
    })),
    partnerLedgers: sortedEntries(state.partnerLedgers).map(([mapKey, ledger]) => ({
      mapKey,
      partnerId: ledger.partnerId,
      isGp: ledger.isGp,
      settledCapital: ledger.settledCapital.toFixed(6),
      paidInCapital: ledger.paidInCapital.toFixed(6),
      unreturnedSettledCashCapital: ledger.unreturnedSettledCashCapital.toFixed(6),
      cumulativeDistributions: ledger.cumulativeDistributions.toFixed(6),
      cumulativeFees: ledger.cumulativeFees.toFixed(6),
      accruedPreference: ledger.accruedPreference.toFixed(6),
      calledCapitalPeriodDeployment: ledger.calledCapitalPeriodDeployment.toFixed(6),
    })),
    endingCash: state.endingCash.toFixed(6),
  });
}

function seedCashLot(
  state: EventStreamState,
  eventId: string,
  purpose: 'deployment' | 'fund_expense' = 'deployment'
): string {
  processSettledContribution(
    {
      eventId,
      instant: '2025-02-01T00:00:00Z',
      amountUsd: '100.000000',
      kind: 'settled_contribution',
      partnerId: 'lp-1',
      purpose,
      settlementSourceRef: `ref:${eventId}`,
    },
    state
  );
  return `csl:${eventId}`;
}

function seedInvestmentLot(state: EventStreamState, eventId: string): string {
  const cashLotId = seedCashLot(state, `${eventId}-contribution`);
  const deploymentEventId = `${eventId}-deployment`;
  const refusal = processDeployment(
    {
      eventId: deploymentEventId,
      instant: '2025-02-15T00:00:00Z',
      amountUsd: '100.000000',
      kind: 'deployment',
      dealId: 'd-1',
      securityId: 's-1',
      cashSourceAllocations: [{ lotId: cashLotId, amount: '100.000000' }],
    },
    state
  );
  if (refusal) throw new Error(`seed deployment refused: ${refusal.message}`);
  return `inv:d-1:s-1:${deploymentEventId}`;
}

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

  it('hydrates opening maps and balance-forward journal without mutating normalized input', () => {
    const wire = buildMinimalV2Input();
    wire.openingState.openingCash = '549900.000000';
    wire.openingState.openingCashClassification.paidIn = '549900.000000';
    wire.openingState.openingProvenance.cashLots[1]!.originalAmount = '499900.000000';
    wire.openingState.openingProvenance.cashLots[1]!.remainingBalance = '499900.000000';
    wire.openingState.openingProvenance.entitlementPools = [
      {
        entitlementPoolId: 'pool-1',
        sourceRef: 'pool-source:1',
        dealId: 'deal-1',
        securityId: 'security-1',
      },
    ];
    wire.openingState.openingProvenance.investmentLots = [
      {
        investmentLotId: 'opening-investment:1',
        sourceRef: 'investment-source:1',
        entitlementPoolId: 'pool-1',
        dealId: 'deal-1',
        securityId: 'security-1',
        owner: { kind: 'lp', partnerId: 'lp-1', lpClassId: 'class-a' },
        costBasis: '100.000000',
        relievedAmount: '0.000000',
        entitlementAmount: '99.000000',
      },
    ];
    const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
    expect(normalizeResult.ok).toBe(true);
    if (!normalizeResult.ok) return;

    const before = canonicalJson(normalizeResult.input);
    const state = initializeEventStreamState(normalizeResult.input);

    expect(canonicalJson(normalizeResult.input)).toBe(before);
    expect(state.openingCashLots.size).toBe(2);
    expect(state.openingInvestmentSlices.size).toBe(1);
    expect(state.openingEntitlementPools.size).toBe(1);
    expect(state.openingCashLots.get('opening-cash:lp-1')!.originalAmount).toBeInstanceOf(Decimal);
    expect(
      state.openingInvestmentSlices.get('opening-investment:1')!.remainingBasis.toFixed(6)
    ).toBe('100.000000');
    expect(state.openingEntitlementPools.get('pool-1')!.entitlementTotal.toFixed(6)).toBe(
      '99.000000'
    );

    const entryIds = state.openingJournal.map((entry) => entry.entryId);
    expect(entryIds).toEqual([...entryIds].sort());
    expect(entryIds.filter((entryId) => entryId.startsWith('opening/cash_lot/'))).toHaveLength(2);
    expect(
      entryIds.filter((entryId) => entryId.startsWith('opening/investment_slice/'))
    ).toHaveLength(1);
    expect(entryIds[0]!.startsWith('opening/cash_lot/')).toBe(true);
    expect(entryIds[2]!.startsWith('opening/investment_slice/')).toBe(true);

    const allowedAccounts = new Set(['cash', 'invested_basis', 'opening_unreturned_capital']);
    for (const entry of state.openingJournal) {
      expect(entry.instant).toBe('2025-01-01T00:00:00Z');
      expect(entry.postings).toHaveLength(2);
      expect(entry.postings.every((posting) => allowedAccounts.has(posting.account))).toBe(true);
      expect(
        entry.postings
          .reduce((sum, posting) => sum.plus(posting.amountUsd), new Decimal(0))
          .toFixed(6)
      ).toBe('0.000000');
      for (const posting of entry.postings) {
        expect(posting.rowRef).toBe(
          entry.kind === 'opening_cash_lot'
            ? entry.entryId.replace('opening/cash_lot/', '')
            : entry.entryId.replace('opening/investment_slice/', '')
        );
        expect(posting.owner).toEqual(
          entry.kind === 'opening_cash_lot'
            ? state.openingCashLots.get(posting.rowRef)!.owner
            : state.openingInvestmentSlices.get(posting.rowRef)!.owner
        );
      }
    }
    expect(state.openingJournal.find((entry) => entry.kind === 'opening_cash_lot')!.sourceRef).toBe(
      'opening-ledger:gp-1'
    );
    expect(
      state.openingJournal.find((entry) => entry.kind === 'opening_investment_slice')!.sourceRef
    ).toBe('investment-source:1');
    expect(state.cashSourceLots.size).toBe(0);
    expect(state.investmentLots.size).toBe(0);
    expect(state.cashSourceLots.has('opening-cash:lp-1')).toBe(false);
    expect(state.investmentLots.has('opening-investment:1')).toBe(false);
  });
});

describe('F3a regression-green baseline', () => {
  it('keeps mutable state unchanged when deployment refuses a missing cash lot', () => {
    const state = makeEventStreamState();
    processSettledContribution(
      {
        eventId: 'baseline-contrib-deployment',
        instant: '2025-02-01T00:00:00Z',
        amountUsd: '100.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'deployment',
        settlementSourceRef: 'baseline-ref-deployment',
      },
      state
    );

    const before = snapshotMutableEventLaneState(state);
    const result = processDeployment(
      {
        eventId: 'baseline-deployment-refusal',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '40.000000',
        kind: 'deployment',
        dealId: 'd-1',
        securityId: 's-1',
        cashSourceAllocations: [{ lotId: 'missing-cash-lot', amount: '40.000000' }],
      },
      state
    );

    expect(result?.code).toBe('CASH_SOURCE_ALLOCATION_VIOLATION');
    expect(snapshotMutableEventLaneState(state)).toBe(before);
    expect(before).toMatchInlineSnapshot(
      `"{"cashSourceLots":[{"lotId":"csl:baseline-contrib-deployment","mapKey":"csl:baseline-contrib-deployment","originalAmount":"100.000000","partnerId":"lp-1","remainingBalance":"100.000000","sourceEventId":"baseline-contrib-deployment"}],"endingCash":"550100.000000","investmentLots":[],"partnerLedgers":[{"accruedPreference":"0.000000","calledCapitalPeriodDeployment":"0.000000","cumulativeDistributions":"0.000000","cumulativeFees":"0.000000","isGp":true,"mapKey":"gp-1","paidInCapital":"50000.000000","partnerId":"gp-1","settledCapital":"50000.000000","unreturnedSettledCashCapital":"50000.000000"},{"accruedPreference":"0.000000","calledCapitalPeriodDeployment":"100.000000","cumulativeDistributions":"0.000000","cumulativeFees":"0.000000","isGp":false,"mapKey":"lp-1","paidInCapital":"500100.000000","partnerId":"lp-1","settledCapital":"500100.000000","unreturnedSettledCashCapital":"500100.000000"}]}"`
    );
  });

  it('keeps mutable state unchanged when realization refuses a missing investment lot', () => {
    const state = makeEventStreamState();
    processSettledContribution(
      {
        eventId: 'baseline-contrib-realization',
        instant: '2025-02-01T00:00:00Z',
        amountUsd: '100.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'deployment',
        settlementSourceRef: 'baseline-ref-realization',
      },
      state
    );
    expect(
      processDeployment(
        {
          eventId: 'baseline-deployment-realization',
          instant: '2025-02-15T00:00:00Z',
          amountUsd: '100.000000',
          kind: 'deployment',
          dealId: 'd-1',
          securityId: 's-1',
          cashSourceAllocations: [
            { lotId: 'csl:baseline-contrib-realization', amount: '100.000000' },
          ],
        },
        state
      )
    ).toBeNull();

    const before = snapshotMutableEventLaneState(state);
    const result = processRealization(
      {
        eventId: 'baseline-realization-refusal',
        instant: '2025-05-01T00:00:00Z',
        amountUsd: '120.000000',
        kind: 'realization',
        dealId: 'd-1',
        reliefRows: [
          {
            investmentLotId: 'missing-investment-lot',
            relievedCostBasis: '100.000000',
            allocatedProceeds: '120.000000',
          },
        ],
        recyclingTag: 'none',
      },
      state
    );

    expect(result?.code).toBe('INVESTMENT_LOT_RELIEF_VIOLATION');
    expect(snapshotMutableEventLaneState(state)).toBe(before);
    expect(before).toMatchInlineSnapshot(
      `"{"cashSourceLots":[{"lotId":"csl:baseline-contrib-realization","mapKey":"csl:baseline-contrib-realization","originalAmount":"100.000000","partnerId":"lp-1","remainingBalance":"0.000000","sourceEventId":"baseline-contrib-realization"}],"endingCash":"550000.000000","investmentLots":[{"costBasis":"100.000000","dealId":"d-1","lotId":"inv:d-1:s-1:baseline-deployment-realization","mapKey":"inv:d-1:s-1:baseline-deployment-realization","relievedAmount":"0.000000","securityId":"s-1"}],"partnerLedgers":[{"accruedPreference":"0.000000","calledCapitalPeriodDeployment":"0.000000","cumulativeDistributions":"0.000000","cumulativeFees":"0.000000","isGp":true,"mapKey":"gp-1","paidInCapital":"50000.000000","partnerId":"gp-1","settledCapital":"50000.000000","unreturnedSettledCashCapital":"50000.000000"},{"accruedPreference":"0.000000","calledCapitalPeriodDeployment":"100.000000","cumulativeDistributions":"0.000000","cumulativeFees":"0.000000","isGp":false,"mapKey":"lp-1","paidInCapital":"500100.000000","partnerId":"lp-1","settledCapital":"500100.000000","unreturnedSettledCashCapital":"500100.000000"}]}"`
    );
  });

  it('keeps mutable state unchanged when fund expense refuses a missing cash lot', () => {
    const state = makeEventStreamState();
    processSettledContribution(
      {
        eventId: 'baseline-contrib-expense',
        instant: '2025-02-01T00:00:00Z',
        amountUsd: '100.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'fund_expense',
        settlementSourceRef: 'baseline-ref-expense',
      },
      state
    );

    const before = snapshotMutableEventLaneState(state);
    const result = processFundExpense(
      {
        eventId: 'baseline-expense-refusal',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '40.000000',
        kind: 'fund_expense_payment',
        expenseCategory: 'legal',
        cashSourceAllocations: [{ lotId: 'missing-expense-lot', amount: '40.000000' }],
      },
      state
    );

    expect(result?.code).toBe('CASH_SOURCE_ALLOCATION_VIOLATION');
    expect(snapshotMutableEventLaneState(state)).toBe(before);
    expect(before).toMatchInlineSnapshot(
      `"{"cashSourceLots":[{"lotId":"csl:baseline-contrib-expense","mapKey":"csl:baseline-contrib-expense","originalAmount":"100.000000","partnerId":"lp-1","remainingBalance":"100.000000","sourceEventId":"baseline-contrib-expense"}],"endingCash":"550100.000000","investmentLots":[],"partnerLedgers":[{"accruedPreference":"0.000000","calledCapitalPeriodDeployment":"0.000000","cumulativeDistributions":"0.000000","cumulativeFees":"0.000000","isGp":true,"mapKey":"gp-1","paidInCapital":"50000.000000","partnerId":"gp-1","settledCapital":"50000.000000","unreturnedSettledCashCapital":"50000.000000"},{"accruedPreference":"0.000000","calledCapitalPeriodDeployment":"0.000000","cumulativeDistributions":"0.000000","cumulativeFees":"0.000000","isGp":false,"mapKey":"lp-1","paidInCapital":"500100.000000","partnerId":"lp-1","settledCapital":"500100.000000","unreturnedSettledCashCapital":"500100.000000"}]}"`
    );
  });

  it('accepts repeated cash allocations against one lot', () => {
    const state = makeEventStreamState();
    processSettledContribution(
      {
        eventId: 'baseline-repeated-cash',
        instant: '2025-02-01T00:00:00Z',
        amountUsd: '100.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'deployment',
        settlementSourceRef: 'baseline-ref-repeated-cash',
      },
      state
    );

    const result = processDeployment(
      {
        eventId: 'baseline-repeated-cash-deployment',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '75.000000',
        kind: 'deployment',
        dealId: 'd-1',
        securityId: 's-1',
        cashSourceAllocations: [
          { lotId: 'csl:baseline-repeated-cash', amount: '40.000000' },
          { lotId: 'csl:baseline-repeated-cash', amount: '35.000000' },
        ],
      },
      state
    );

    expect(result).toBeNull();
    expect(
      state.cashSourceLots.get('csl:baseline-repeated-cash')!.remainingBalance.toFixed(6)
    ).toBe('25.000000');
  });

  it('accepts repeated relief rows against one investment lot', () => {
    const state = makeEventStreamState();
    processSettledContribution(
      {
        eventId: 'baseline-repeated-relief-contribution',
        instant: '2025-02-01T00:00:00Z',
        amountUsd: '100.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'deployment',
        settlementSourceRef: 'baseline-ref-repeated-relief',
      },
      state
    );
    expect(
      processDeployment(
        {
          eventId: 'baseline-repeated-relief-deployment',
          instant: '2025-02-15T00:00:00Z',
          amountUsd: '100.000000',
          kind: 'deployment',
          dealId: 'd-1',
          securityId: 's-1',
          cashSourceAllocations: [
            {
              lotId: 'csl:baseline-repeated-relief-contribution',
              amount: '100.000000',
            },
          ],
        },
        state
      )
    ).toBeNull();

    const result = processRealization(
      {
        eventId: 'baseline-repeated-relief-realization',
        instant: '2025-05-01T00:00:00Z',
        amountUsd: '75.000000',
        kind: 'realization',
        dealId: 'd-1',
        reliefRows: [
          {
            investmentLotId: 'inv:d-1:s-1:baseline-repeated-relief-deployment',
            relievedCostBasis: '40.000000',
            allocatedProceeds: '40.000000',
          },
          {
            investmentLotId: 'inv:d-1:s-1:baseline-repeated-relief-deployment',
            relievedCostBasis: '35.000000',
            allocatedProceeds: '35.000000',
          },
        ],
        recyclingTag: 'none',
      },
      state
    );

    expect(result).toBeNull();
    const investmentLot = state.investmentLots.get(
      'inv:d-1:s-1:baseline-repeated-relief-deployment'
    )!;
    expect(investmentLot.relievedAmount.toFixed(6)).toBe('75.000000');
    expect(investmentLot.costBasis.minus(investmentLot.relievedAmount).toFixed(6)).toBe(
      '25.000000'
    );
  });
});

describe('F3a expected-red validation cases', () => {
  it('rejects cumulative cash overdraw before mutation', () => {
    const state = makeEventStreamState();
    const cashLotId = seedCashLot(state, 'red-cumulative-cash');
    const before = snapshotMutableEventLaneState(state);

    const result = processDeployment(
      {
        eventId: 'red-cumulative-cash-deployment',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '110.000000',
        kind: 'deployment',
        dealId: 'd-1',
        securityId: 's-1',
        cashSourceAllocations: [
          { lotId: cashLotId, amount: '60.000000' },
          { lotId: cashLotId, amount: '50.000000' },
        ],
      },
      state
    );

    expect(result?.code).toBe('CASH_SOURCE_ALLOCATION_VIOLATION');
    expect(result?.stage).toBe('provenance');
    expect(snapshotMutableEventLaneState(state)).toBe(before);
  });

  it('rejects cumulative relief overdraw before mutation', () => {
    const state = makeEventStreamState();
    const investmentLotId = seedInvestmentLot(state, 'red-cumulative-relief');
    const before = snapshotMutableEventLaneState(state);

    const result = processRealization(
      {
        eventId: 'red-cumulative-relief-realization',
        instant: '2025-05-01T00:00:00Z',
        amountUsd: '110.000000',
        kind: 'realization',
        dealId: 'd-1',
        reliefRows: [
          {
            investmentLotId,
            relievedCostBasis: '60.000000',
            allocatedProceeds: '60.000000',
          },
          {
            investmentLotId,
            relievedCostBasis: '50.000000',
            allocatedProceeds: '50.000000',
          },
        ],
        recyclingTag: 'none',
      },
      state
    );

    expect(result?.code).toBe('INVESTMENT_LOT_RELIEF_VIOLATION');
    expect(result?.stage).toBe('provenance');
    expect(snapshotMutableEventLaneState(state)).toBe(before);
  });

  it('rejects deployment cash total mismatch before mutation', () => {
    const state = makeEventStreamState();
    const cashLotId = seedCashLot(state, 'red-deployment-total');
    const before = snapshotMutableEventLaneState(state);

    const result = processDeployment(
      {
        eventId: 'red-deployment-total-mismatch',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '75.000000',
        kind: 'deployment',
        dealId: 'd-1',
        securityId: 's-1',
        cashSourceAllocations: [{ lotId: cashLotId, amount: '40.000000' }],
      },
      state
    );

    expect(result?.code).toBe('CASH_SOURCE_ALLOCATION_VIOLATION');
    expect(result?.stage).toBe('provenance');
    expect(result?.message).toBe(
      'Event red-deployment-total-mismatch: event amount 75.000000 must equal cash source allocation total 40.000000.'
    );
    expect(result?.diagnostics?.contextDetails).toBe(
      '{"expectedEventAmountUsd":"75.000000","actualCashSourceAllocationTotalUsd":"40.000000"}'
    );
    expect(snapshotMutableEventLaneState(state)).toBe(before);
  });

  it('rejects fund-expense cash total mismatch before mutation', () => {
    const state = makeEventStreamState();
    const cashLotId = seedCashLot(state, 'red-expense-total', 'fund_expense');
    const before = snapshotMutableEventLaneState(state);

    const result = processFundExpense(
      {
        eventId: 'red-expense-total-mismatch',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '75.000000',
        kind: 'fund_expense_payment',
        expenseCategory: 'legal',
        cashSourceAllocations: [{ lotId: cashLotId, amount: '40.000000' }],
      },
      state
    );

    expect(result?.code).toBe('CASH_SOURCE_ALLOCATION_VIOLATION');
    expect(result?.stage).toBe('provenance');
    expect(result?.message).toBe(
      'Event red-expense-total-mismatch: event amount 75.000000 must equal cash source allocation total 40.000000.'
    );
    expect(result?.diagnostics?.contextDetails).toBe(
      '{"expectedEventAmountUsd":"75.000000","actualCashSourceAllocationTotalUsd":"40.000000"}'
    );
    expect(snapshotMutableEventLaneState(state)).toBe(before);
  });

  it('rejects realization allocated-proceeds total mismatch before mutation', () => {
    const state = makeEventStreamState();
    const investmentLotId = seedInvestmentLot(state, 'red-realization-total');
    const before = snapshotMutableEventLaneState(state);

    const result = processRealization(
      {
        eventId: 'red-realization-total-mismatch',
        instant: '2025-05-01T00:00:00Z',
        amountUsd: '75.000000',
        kind: 'realization',
        dealId: 'd-1',
        reliefRows: [
          {
            investmentLotId,
            relievedCostBasis: '40.000000',
            allocatedProceeds: '40.000000',
          },
        ],
        recyclingTag: 'none',
      },
      state
    );

    expect(result?.code).toBe('INVESTMENT_LOT_RELIEF_VIOLATION');
    expect(result?.stage).toBe('provenance');
    expect(result?.message).toBe(
      'Event red-realization-total-mismatch: event amount 75.000000 must equal allocated proceeds total 40.000000.'
    );
    expect(result?.diagnostics?.contextDetails).toBe(
      '{"expectedEventAmountUsd":"75.000000","actualAllocatedProceedsTotalUsd":"40.000000"}'
    );
    expect(snapshotMutableEventLaneState(state)).toBe(before);
  });

  it('rejects negative cash-source allocation rows before mutation', () => {
    const state = makeEventStreamState();
    const cashLotId = seedCashLot(state, 'red-negative-cash');
    const before = snapshotMutableEventLaneState(state);

    const result = processDeployment(
      {
        eventId: 'red-negative-cash-deployment',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '75.000000',
        kind: 'deployment',
        dealId: 'd-1',
        securityId: 's-1',
        cashSourceAllocations: [
          { lotId: cashLotId, amount: '100.000000' },
          { lotId: cashLotId, amount: '-25.000000' },
        ],
      },
      state
    );

    expect(result?.code).toBe('CASH_SOURCE_ALLOCATION_VIOLATION');
    expect(result?.stage).toBe('provenance');
    expect(snapshotMutableEventLaneState(state)).toBe(before);
  });

  it('rejects negative relieved-cost-basis rows before mutation', () => {
    const state = makeEventStreamState();
    const investmentLotId = seedInvestmentLot(state, 'red-negative-basis');
    const before = snapshotMutableEventLaneState(state);

    const result = processRealization(
      {
        eventId: 'red-negative-basis-realization',
        instant: '2025-05-01T00:00:00Z',
        amountUsd: '75.000000',
        kind: 'realization',
        dealId: 'd-1',
        reliefRows: [
          {
            investmentLotId,
            relievedCostBasis: '100.000000',
            allocatedProceeds: '100.000000',
          },
          {
            investmentLotId,
            relievedCostBasis: '-25.000000',
            allocatedProceeds: '-25.000000',
          },
        ],
        recyclingTag: 'none',
      },
      state
    );

    expect(result?.code).toBe('INVESTMENT_LOT_RELIEF_VIOLATION');
    expect(result?.stage).toBe('provenance');
    expect(snapshotMutableEventLaneState(state)).toBe(before);
  });

  it('rejects negative allocated-proceeds rows before mutation', () => {
    const state = makeEventStreamState();
    const investmentLotId = seedInvestmentLot(state, 'red-negative-proceeds');
    const before = snapshotMutableEventLaneState(state);

    const result = processRealization(
      {
        eventId: 'red-negative-proceeds-realization',
        instant: '2025-05-01T00:00:00Z',
        amountUsd: '75.000000',
        kind: 'realization',
        dealId: 'd-1',
        reliefRows: [
          {
            investmentLotId,
            relievedCostBasis: '50.000000',
            allocatedProceeds: '100.000000',
          },
          {
            investmentLotId,
            relievedCostBasis: '25.000000',
            allocatedProceeds: '-25.000000',
          },
        ],
        recyclingTag: 'none',
      },
      state
    );

    expect(result?.code).toBe('INVESTMENT_LOT_RELIEF_VIOLATION');
    expect(result?.stage).toBe('provenance');
    expect(snapshotMutableEventLaneState(state)).toBe(before);
  });

  it('returns first chronology refusal and retains earlier effects only', () => {
    const contribution = {
      eventId: 'red-chronology-contribution',
      instant: '2025-02-01T00:00:00Z',
      amountUsd: '100.000000',
      kind: 'settled_contribution' as const,
      partnerId: 'lp-1',
      purpose: 'deployment' as const,
      settlementSourceRef: 'ref:red-chronology-contribution',
    };
    const earlierDeployment = {
      eventId: 'red-chronology-deployment',
      instant: '2025-03-01T00:00:00Z',
      amountUsd: '40.000000',
      kind: 'deployment' as const,
      dealId: 'd-1',
      securityId: 's-1',
      cashSourceAllocations: [{ lotId: 'csl:red-chronology-contribution', amount: '40.000000' }],
    };
    const laterMismatch = {
      eventId: 'red-chronology-total-mismatch',
      instant: '2025-04-01T00:00:00Z',
      amountUsd: '50.000000',
      kind: 'deployment' as const,
      dealId: 'd-1',
      securityId: 's-2',
      cashSourceAllocations: [{ lotId: 'csl:red-chronology-contribution', amount: '40.000000' }],
    };
    const trailingValid = {
      eventId: 'red-chronology-trailing-valid',
      instant: '2025-05-01T00:00:00Z',
      amountUsd: '20.000000',
      kind: 'deployment' as const,
      dealId: 'd-1',
      securityId: 's-3',
      cashSourceAllocations: [{ lotId: 'csl:red-chronology-contribution', amount: '20.000000' }],
    };
    const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(
      buildMinimalV2Input({
        events: [contribution, earlierDeployment, laterMismatch, trailingValid],
      })
    );
    if (!normalizeResult.ok) throw new Error('normalization failed');

    const expectedState = makeEventStreamState();
    processSettledContribution(contribution, expectedState);
    expect(processDeployment(earlierDeployment, expectedState)).toBeNull();
    const expectedStateAfterEarlier = snapshotMutableEventLaneState(expectedState);

    const state = makeEventStreamState();
    const result = processEventsV2ForTest(normalizeResult.input, state);

    expect(result?.code).toBe('CASH_SOURCE_ALLOCATION_VIOLATION');
    expect(result?.stage).toBe('provenance');
    expect(snapshotMutableEventLaneState(state)).toBe(expectedStateAfterEarlier);
    expect(
      state.cashSourceLots.get('csl:red-chronology-contribution')!.remainingBalance.toFixed(6)
    ).toBe('60.000000');
    expect(state.investmentLots.has('inv:d-1:s-1:red-chronology-deployment')).toBe(true);
    expect(state.investmentLots.has('inv:d-1:s-2:red-chronology-total-mismatch')).toBe(false);
    // An implementation that continued after the first refusal would apply this event.
    expect(state.investmentLots.has('inv:d-1:s-3:red-chronology-trailing-valid')).toBe(false);
  });

  it('enforces cash refusal precedence', () => {
    const cases = [
      {
        eventId: 'red-precedence-cash-missing',
        amountUsd: '5.000000',
        // Negative row listed FIRST: proves the missing-reference check is a
        // full pass, not just first-hit row order.
        allocations: (cashLotId: string) => [
          { lotId: cashLotId, amount: '-5.000000' },
          { lotId: 'missing-cash-reference', amount: '10.000000' },
        ],
        expectedCode: 'CASH_SOURCE_ALLOCATION_VIOLATION' as const,
        expectedMessage:
          "Event red-precedence-cash-missing: cash source lot 'missing-cash-reference' not found.",
      },
      {
        eventId: 'red-precedence-cash-negative',
        amountUsd: '105.000000',
        allocations: (cashLotId: string) => [
          { lotId: cashLotId, amount: '60.000000' },
          { lotId: cashLotId, amount: '-25.000000' },
          { lotId: cashLotId, amount: '70.000000' },
        ],
        expectedCode: 'CASH_SOURCE_ALLOCATION_VIOLATION' as const,
        expectedMessage:
          'Event red-precedence-cash-negative: cash source allocation -25.000000 is negative.',
      },
      {
        eventId: 'red-precedence-cash-cumulative',
        amountUsd: '120.000000',
        allocations: (cashLotId: string) => [
          { lotId: cashLotId, amount: '60.000000' },
          { lotId: cashLotId, amount: '50.000000' },
        ],
        expectedCode: 'CASH_SOURCE_ALLOCATION_VIOLATION' as const,
        expectedMessage:
          "Event red-precedence-cash-cumulative: allocation 110.000000 exceeds lot 'csl:red-precedence-cash-cumulative' remaining balance 100.000000.",
      },
    ];

    for (const testCase of cases) {
      const state = makeEventStreamState();
      const cashLotId = seedCashLot(state, testCase.eventId);
      const before = snapshotMutableEventLaneState(state);
      const result = processDeployment(
        {
          eventId: testCase.eventId,
          instant: '2025-03-01T00:00:00Z',
          amountUsd: testCase.amountUsd,
          kind: 'deployment',
          dealId: 'd-1',
          securityId: 's-1',
          cashSourceAllocations: testCase.allocations(cashLotId),
        },
        state
      );

      expect.soft(result?.code).toBe(testCase.expectedCode);
      expect.soft(result?.stage).toBe('provenance');
      expect.soft(result?.message).toBe(testCase.expectedMessage);
      expect.soft(snapshotMutableEventLaneState(state)).toBe(before);
    }
  });

  it('enforces relief refusal precedence', () => {
    const cases = [
      {
        eventId: 'red-precedence-relief-missing',
        amountUsd: '15.000000',
        // Negative row listed FIRST: proves the missing-reference check is a
        // full pass, not just first-hit row order.
        rows: (investmentLotId: string) => [
          {
            investmentLotId,
            relievedCostBasis: '-5.000000',
            allocatedProceeds: '5.000000',
          },
          {
            investmentLotId: 'missing-investment-reference',
            relievedCostBasis: '10.000000',
            allocatedProceeds: '10.000000',
          },
        ],
        expectedCode: 'INVESTMENT_LOT_RELIEF_VIOLATION' as const,
        expectedMessage:
          "Event red-precedence-relief-missing: investment lot 'missing-investment-reference' not found.",
      },
      {
        eventId: 'red-precedence-relief-negative',
        amountUsd: '155.000000',
        rows: (investmentLotId: string) => [
          {
            investmentLotId,
            relievedCostBasis: '60.000000',
            allocatedProceeds: '60.000000',
          },
          {
            investmentLotId,
            relievedCostBasis: '-25.000000',
            allocatedProceeds: '25.000000',
          },
          {
            investmentLotId,
            relievedCostBasis: '70.000000',
            allocatedProceeds: '70.000000',
          },
        ],
        expectedCode: 'INVESTMENT_LOT_RELIEF_VIOLATION' as const,
        expectedMessage:
          "Event red-precedence-relief-negative: relief row for investment lot 'inv:d-1:s-1:red-precedence-relief-negative-deployment' contains a negative amount.",
      },
      {
        eventId: 'red-precedence-relief-cumulative',
        amountUsd: '120.000000',
        rows: (investmentLotId: string) => [
          {
            investmentLotId,
            relievedCostBasis: '60.000000',
            allocatedProceeds: '40.000000',
          },
          {
            investmentLotId,
            relievedCostBasis: '50.000000',
            allocatedProceeds: '40.000000',
          },
        ],
        expectedCode: 'INVESTMENT_LOT_RELIEF_VIOLATION' as const,
        expectedMessage:
          "Event red-precedence-relief-cumulative: relief 110.000000 exceeds lot 'inv:d-1:s-1:red-precedence-relief-cumulative-deployment' remaining basis 100.000000.",
      },
    ];

    for (const testCase of cases) {
      const state = makeEventStreamState();
      const investmentLotId = seedInvestmentLot(state, testCase.eventId);
      const before = snapshotMutableEventLaneState(state);
      const result = processRealization(
        {
          eventId: testCase.eventId,
          instant: '2025-05-01T00:00:00Z',
          amountUsd: testCase.amountUsd,
          kind: 'realization',
          dealId: 'd-1',
          reliefRows: testCase.rows(investmentLotId),
          recyclingTag: 'none',
        },
        state
      );

      expect.soft(result?.code).toBe(testCase.expectedCode);
      expect.soft(result?.stage).toBe('provenance');
      expect.soft(result?.message).toBe(testCase.expectedMessage);
      expect.soft(snapshotMutableEventLaneState(state)).toBe(before);
    }
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
