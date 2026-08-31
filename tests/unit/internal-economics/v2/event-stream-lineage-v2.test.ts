import { describe, expect, it } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import type {
  InternalEconomicsInputV2Wire,
  V2Event,
} from '../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../../shared/lib/internal-economics/v2/normalize-input-v2';
import {
  cloneEventStreamState,
  initializeEventStreamState,
  processDeployment,
  processFundExpense,
  processRealization,
  processSettledContribution,
  type EventStreamState,
} from '../../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
import { processEventsV2ForTest } from '../../../../shared/lib/internal-economics/v2/derive-composite-v2';
import { buildMinimalV2Input } from '../../../helpers/v2-input-builder';

function normalized(mutate?: (wire: InternalEconomicsInputV2Wire) => void): {
  wire: InternalEconomicsInputV2Wire;
  input: Parameters<typeof processEventsV2ForTest>[0];
  state: EventStreamState;
} {
  const wire = buildMinimalV2Input();
  mutate?.(wire);
  const result = verifyAndNormalizeInternalEconomicsInputV2(wire);
  if (!result.ok) throw new Error(`normalization failed: ${result.refusal.message}`);
  return { wire, input: result.input, state: initializeEventStreamState(result.input) };
}

function contribution(
  eventId: string,
  amountUsd = '100.000000',
  purpose: 'deployment' | 'management_fee' | 'fund_expense' = 'deployment'
): V2Event {
  return {
    eventId,
    instant: '2025-02-01T00:00:00Z',
    amountUsd,
    kind: 'settled_contribution',
    partnerId: 'lp-1',
    purpose,
    settlementSourceRef: `ref:${eventId}`,
  };
}

function deployment(
  eventId: string,
  amountUsd: string,
  allocations: readonly { lotId: string; amount: string }[],
  securityId = 's-1'
): V2Event {
  return {
    eventId,
    instant: '2025-03-01T00:00:00Z',
    amountUsd,
    kind: 'deployment',
    dealId: 'd-1',
    securityId,
    cashSourceAllocations: allocations.map((allocation) => ({ ...allocation })),
  };
}

function expense(
  eventId: string,
  amountUsd: string,
  allocations: readonly { lotId: string; amount: string }[]
): V2Event {
  return {
    eventId,
    instant: '2025-04-01T00:00:00Z',
    amountUsd,
    kind: 'fund_expense_payment',
    expenseCategory: 'legal',
    cashSourceAllocations: allocations.map((allocation) => ({ ...allocation })),
  };
}

function realization(eventId: string, investmentLotId: string): V2Event {
  return {
    eventId,
    instant: '2025-05-01T00:00:00Z',
    amountUsd: '100.000000',
    kind: 'realization',
    dealId: 'd-1',
    reliefRows: [
      {
        investmentLotId,
        relievedCostBasis: '100.000000',
        allocatedProceeds: '100.000000',
      },
    ],
    recyclingTag: 'none',
  };
}

function lpOpeningCashLot(wire: InternalEconomicsInputV2Wire) {
  const lot = wire.openingState.openingProvenance.cashLots.find(
    (candidate) => candidate.owner.kind === 'lp'
  );
  if (!lot) throw new Error('LP opening cash lot missing');
  return lot;
}

function recordStrings(state: EventStreamState): string[] {
  return state.consumptionRecords.map(
    (record) => `${record.eventId}|${record.lotId}|${record.amountUsd.toFixed(6)}`
  );
}

function effectStrings(state: EventStreamState): string[] {
  return state.partnerEffectRecords.map(
    (record) =>
      `${record.origin}|${record.eventId}|${record.instant}|${record.partnerId}|${record.field}|${record.amountUsd.toFixed(6)}`
  );
}

describe('F3b unified source-lot registry and lineage', () => {
  it('admits deployment funded by an opening cash lot without synthetic event identity', () => {
    const { wire, input, state } = normalized();
    const openingLot = lpOpeningCashLot(wire);
    const result = processEventsV2ForTest(
      {
        ...input,
        events: [
          deployment('opening-funded-deployment', '100.000000', [
            { lotId: openingLot.lotId, amount: '100.000000' },
          ]),
        ],
      },
      state
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sourceLot = result.state.cashSourceLots.get(openingLot.lotId)!;
    expect(sourceLot.origin).toBe('opening');
    expect(sourceLot).toMatchObject({
      lotId: openingLot.lotId,
      sourceRef: openingLot.sourceRef,
      classification: 'paid_in',
      owner: { kind: 'lp', partnerId: 'lp-1', lpClassId: 'class-a' },
    });
    expect('sourceEventId' in sourceLot).toBe(false);
    expect('partnerId' in sourceLot).toBe(false);
    expect(
      result.state.investmentLots.get('inv:d-1:s-1:opening-funded-deployment')?.fundingAllocations
    ).toEqual([{ lotId: openingLot.lotId, amount: '100.000000' }]);
    expect(result.state.cashSourceLots.get(openingLot.lotId)!.remainingBalance.toFixed(6)).toBe(
      '499900.000000'
    );
  });

  it('refuses opening-lot overdraw with remaining-balance diagnostics', () => {
    const { wire, state } = normalized();
    const openingLot = lpOpeningCashLot(wire);
    const result = processDeployment(
      deployment('opening-overdraw', '500001.000000', [
        { lotId: openingLot.lotId, amount: '500001.000000' },
      ]),
      state
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'CASH_SOURCE_ALLOCATION_VIOLATION',
      stage: 'provenance',
      message: `Event opening-overdraw: allocation 500001.000000 exceeds lot '${openingLot.lotId}' remaining balance 500000.000000.`,
    });
  });

  it('refuses contribution-lot insertion when opening id collides with csl prefix', () => {
    const { state } = normalized((input) => {
      const lot = lpOpeningCashLot(input);
      lot.lotId = 'csl:collision-contribution';
      lot.sourceRef = 'opening-collision-contribution';
    });

    const result = processSettledContribution(
      contribution('collision-contribution', '10.000000'),
      state
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'CASH_SOURCE_ALLOCATION_VIOLATION',
      stage: 'provenance',
      message:
        "Event collision-contribution: cash source lot 'csl:collision-contribution' already exists.",
    });
    expect(state.cashSourceLots.get('csl:collision-contribution')).toMatchObject({
      origin: 'opening',
    });
  });

  it('refuses proceeds-lot insertion when opening id collides with proceeds prefix', () => {
    const { state } = normalized((input) => {
      const lot = lpOpeningCashLot(input);
      lot.lotId = 'proceeds:collision-realization';
      lot.sourceRef = 'opening-collision-realization';
    });
    processSettledContribution(contribution('realization-seed'), state);
    const deploymentResult = processDeployment(
      deployment('realization-deployment', '100.000000', [
        { lotId: 'csl:realization-seed', amount: '100.000000' },
      ]),
      state
    );
    expect(deploymentResult).toBeNull();

    const result = processRealization(
      realization('collision-realization', 'inv:d-1:s-1:realization-deployment'),
      state
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'CASH_SOURCE_ALLOCATION_VIOLATION',
      stage: 'provenance',
      message:
        "Event collision-realization: cash source lot 'proceeds:collision-realization' already exists.",
    });
    expect(state.cashSourceLots.get('proceeds:collision-realization')).toMatchObject({
      origin: 'opening',
    });
    expect(state.investmentLots.get('inv:d-1:s-1:realization-deployment')!.relievedAmount).toEqual(
      new Decimal('0.000000')
    );
  });

  it('refuses generated investment-lot insertion when opening slice id collides', () => {
    const investmentLotId = 'inv:d-1:s-1:opening-investment-collision';
    const { wire, state } = normalized((input) => {
      const lot = lpOpeningCashLot(input);
      input.openingState.openingProvenance.entitlementPools = [
        {
          entitlementPoolId: 'opening-pool-collision',
          sourceRef: 'opening-pool-collision-source',
          dealId: 'd-1',
          securityId: 's-1',
        },
      ];
      input.openingState.openingProvenance.investmentLots = [
        {
          investmentLotId,
          sourceRef: 'opening-investment-collision-source',
          entitlementPoolId: 'opening-pool-collision',
          dealId: 'd-1',
          securityId: 's-1',
          owner: { kind: 'lp', partnerId: 'lp-1', lpClassId: 'class-a' },
          costBasis: '0.000000',
          relievedAmount: '0.000000',
          entitlementAmount: '1.000000',
        },
      ];
      lot.sourceRef = 'opening-collision-investment';
    });
    const openingLot = lpOpeningCashLot(wire);

    expect(state.openingInvestmentSlices.has(investmentLotId)).toBe(true);
    const result = processDeployment(
      deployment('opening-investment-collision', '100.000000', [
        { lotId: openingLot.lotId, amount: '100.000000' },
      ]),
      state
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'INVESTMENT_LOT_RELIEF_VIOLATION',
      stage: 'provenance',
      message: `Event opening-investment-collision: investment lot '${investmentLotId}' already exists.`,
    });
    expect(state.cashSourceLots.get(openingLot.lotId)!.remainingBalance.toFixed(6)).toBe(
      '500000.000000'
    );
  });

  it('retains funding vector for one event-created source lot', () => {
    const { state } = normalized();
    processSettledContribution(contribution('single-source', '100.000000'), state);
    const result = processDeployment(
      deployment('single-source-deployment', '40.000000', [
        { lotId: 'csl:single-source', amount: '40.000000' },
      ]),
      state
    );

    expect(result).toBeNull();
    expect(
      state.investmentLots.get('inv:d-1:s-1:single-source-deployment')?.fundingAllocations
    ).toEqual([{ lotId: 'csl:single-source', amount: '40.000000' }]);
  });

  it('retains funding vector for multi-lot event-created funding', () => {
    const { state } = normalized();
    processSettledContribution(contribution('multi-source-a', '100.000000'), state);
    processSettledContribution(contribution('multi-source-b', '100.000000'), state);
    const result = processDeployment(
      deployment('multi-source-deployment', '150.000000', [
        { lotId: 'csl:multi-source-a', amount: '90.000000' },
        { lotId: 'csl:multi-source-b', amount: '60.000000' },
      ]),
      state
    );

    expect(result).toBeNull();
    expect(
      state.investmentLots.get('inv:d-1:s-1:multi-source-deployment')?.fundingAllocations
    ).toEqual([
      { lotId: 'csl:multi-source-a', amount: '90.000000' },
      { lotId: 'csl:multi-source-b', amount: '60.000000' },
    ]);
  });

  it('retains funding vector for opening-lot funding', () => {
    const { wire, state } = normalized();
    const openingLot = lpOpeningCashLot(wire);
    const result = processDeployment(
      deployment('opening-vector-deployment', '25.000000', [
        { lotId: openingLot.lotId, amount: '25.000000' },
      ]),
      state
    );

    expect(result).toBeNull();
    expect(
      state.investmentLots.get('inv:d-1:s-1:opening-vector-deployment')?.fundingAllocations
    ).toEqual([{ lotId: openingLot.lotId, amount: '25.000000' }]);
  });

  it('records every deployment and fund-expense allocation in order', () => {
    const { state } = normalized();
    processSettledContribution(contribution('consumption-source', '100.000000'), state);
    expect(
      processDeployment(
        deployment('consumption-deployment', '40.000000', [
          { lotId: 'csl:consumption-source', amount: '40.000000' },
        ]),
        state
      )
    ).toBeNull();
    expect(
      processFundExpense(
        expense('consumption-expense', '30.000000', [
          { lotId: 'csl:consumption-source', amount: '30.000000' },
        ]),
        state
      )
    ).toBeNull();

    expect(recordStrings(state)).toEqual([
      'consumption-deployment|csl:consumption-source|40.000000',
      'consumption-expense|csl:consumption-source|30.000000',
    ]);
  });

  it('records each event-origin partner-ledger mutation', () => {
    const { state } = normalized();
    processSettledContribution(contribution('partner-effects', '100.000000'), state);

    expect(effectStrings(state)).toEqual([
      'event|partner-effects|2025-02-01T00:00:00Z|lp-1|settledCapital|100.000000',
      'event|partner-effects|2025-02-01T00:00:00Z|lp-1|paidInCapital|100.000000',
      'event|partner-effects|2025-02-01T00:00:00Z|lp-1|unreturnedSettledCashCapital|100.000000',
      'event|partner-effects|2025-02-01T00:00:00Z|lp-1|calledCapitalPeriodDeployment|100.000000',
    ]);
  });

  it('clones staged consumption and partner-effect records independently', () => {
    const { state } = normalized();
    processSettledContribution(contribution('clone-lineage', '100.000000'), state);
    expect(
      processDeployment(
        deployment('clone-lineage-deployment', '40.000000', [
          { lotId: 'csl:clone-lineage', amount: '40.000000' },
        ]),
        state
      )
    ).toBeNull();

    const clone = cloneEventStreamState(state);
    expect(clone.consumptionRecords).not.toBe(state.consumptionRecords);
    expect(clone.partnerEffectRecords).not.toBe(state.partnerEffectRecords);
    expect(clone.consumptionRecords[0]).not.toBe(state.consumptionRecords[0]);
    expect(clone.consumptionRecords[0]!.amountUsd).not.toBe(state.consumptionRecords[0]!.amountUsd);
    expect(clone.partnerEffectRecords[0]).not.toBe(state.partnerEffectRecords[0]);
    expect(clone.partnerEffectRecords[0]!.amountUsd).not.toBe(
      state.partnerEffectRecords[0]!.amountUsd
    );

    clone.consumptionRecords.pop();
    clone.partnerEffectRecords.pop();
    expect(state.consumptionRecords).toHaveLength(1);
    expect(state.partnerEffectRecords).toHaveLength(4);
  });
});
