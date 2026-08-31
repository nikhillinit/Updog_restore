import { describe, it, expect } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import { deriveInternalEconomicsV2 } from '../../../../shared/lib/internal-economics/v2/derive-composite-v2';
import { classifyReserveFundingSources } from '../../../../shared/lib/internal-economics/v2/reserve-funding-classifier-v2';
import {
  initializeEventStreamState,
  processSettledContribution,
  processDeployment,
  processRealization,
} from '../../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
import { buildMinimalV2Input } from '../../../helpers/v2-input-builder';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../../shared/lib/internal-economics/v2/normalize-input-v2';

function buildState() {
  const wire = buildMinimalV2Input();
  const result = verifyAndNormalizeInternalEconomicsInputV2(wire);
  if (!result.ok) throw new Error('normalization failed');
  return initializeEventStreamState(result.input);
}

function buildV2S0101Input() {
  const input = buildMinimalV2Input({
    selectedLane: 'deal_by_deal',
    events: [],
    waterfallPolicy: [{ kind: 'carry', priority: 1, gpShare: '0.200000000000' }],
    gpCashPreferredReturnTreatment: 'pari_passu',
  });

  for (const lpClass of input.lpClasses) {
    lpClass.feeProfile.managementFeeSchedule = [];
    lpClass.feeProfile.feeRecyclingEnabled = false;
    delete lpClass.feeProfile.feeRecyclingCapUsd;
    lpClass.feeProfile.exitRecyclingEnabled = false;
    delete lpClass.feeProfile.exitRecyclingCapUsd;
  }

  return input;
}

describe('classifyReserveFundingSources', () => {
  it('returns three figures from initial state', () => {
    const state = buildState();
    const result = classifyReserveFundingSources(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sources.remainingCallableCommitmentUsd).toBeDefined();
    expect(result.sources.eligiblePaidInCashUsd).toBeDefined();
    expect(result.sources.eligibleRecyclingCashUsd).toBeDefined();
  });

  it('callable commitment matches initial partner commitments', () => {
    const state = buildState();
    const result = classifyReserveFundingSources(state);
    if (!result.ok) return;
    expect(result.sources.remainingCallableCommitmentUsd).toBe('550000.000000');
  });

  it('includes opening paid-in cash with no stream contributions', () => {
    const state = buildState();
    const result = classifyReserveFundingSources(state);
    if (!result.ok) return;
    expect(result.sources.eligiblePaidInCashUsd).toBe('550000.000000');
  });

  it('recycling cash is zero with no realizations', () => {
    const state = buildState();
    const result = classifyReserveFundingSources(state);
    if (!result.ok) return;
    expect(result.sources.eligibleRecyclingCashUsd).toBe('0.000000');
  });

  it('separates paid-in from recycling after realization', () => {
    const wire = buildMinimalV2Input();
    const normResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
    if (!normResult.ok) throw new Error('normalization failed');
    const state = initializeEventStreamState(normResult.input);

    processSettledContribution(
      {
        eventId: 'c1',
        instant: '2024-02-01T00:00:00Z',
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
        eventId: 'd1',
        instant: '2024-03-01T00:00:00Z',
        amountUsd: '100000.000000',
        kind: 'deployment',
        dealId: 'deal-1',
        securityId: 'sec-1',
        cashSourceAllocations: [{ lotId: 'csl:c1', amount: '100000.000000' }],
      },
      state
    );

    processRealization(
      {
        eventId: 'r1',
        instant: '2025-01-01T00:00:00Z',
        amountUsd: '150000.000000',
        kind: 'realization',
        dealId: 'deal-1',
        reliefRows: [
          {
            investmentLotId: 'inv:deal-1:sec-1:d1',
            relievedCostBasis: '100000.000000',
            allocatedProceeds: '150000.000000',
          },
        ],
        recyclingTag: 'none',
      },
      state
    );

    const result = classifyReserveFundingSources(state);
    if (!result.ok) return;
    expect(result.sources.eligiblePaidInCashUsd).toBe('550000.000000');
    expect(result.sources.eligibleRecyclingCashUsd).toBe('150000.000000');
  });

  it('excludes unclassified opening cash from both eligibility buckets', () => {
    const state = buildState();
    state.cashSourceLots.set('opening-cash:fund', {
      origin: 'opening',
      lotId: 'opening-cash:fund',
      sourceRef: 'opening-ledger:fund',
      owner: { kind: 'fund' },
      classification: 'unclassified',
      originalAmount: new Decimal('1.000000'),
      remainingBalance: new Decimal('1.000000'),
    });

    const result = classifyReserveFundingSources(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sources.eligiblePaidInCashUsd).toBe('550000.000000');
    expect(result.sources.eligibleRecyclingCashUsd).toBe('0.000000');
  });

  it('keeps reserve refusal independent from a valid economics receipt', () => {
    const economics = deriveInternalEconomicsV2(buildV2S0101Input());
    expect(economics.ok).toBe(true);
    if (!economics.ok) return;
    const receiptBefore = structuredClone(economics.receipt);

    const state = buildState();
    state.callableTrackers.get('lp-1')!.remainingCallable = new Decimal(-1_000_000);
    const reserve = classifyReserveFundingSources(state);

    expect(reserve.ok).toBe(false);
    if (reserve.ok) return;
    expect(reserve.refusal).toMatchObject({
      code: 'RESERVE_CONSERVATION_VIOLATION',
      stage: 'receipt',
    });
    expect(economics.receipt).toEqual(receiptBefore);
    expect(economics.receipt).not.toHaveProperty('reserveFundingSources');
    expect(economics.receipt).not.toHaveProperty('reserveRefusal');
  });
});
