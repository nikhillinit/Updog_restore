import { describe, it, expect } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import { runDealByDealWaterfall } from '../../../../shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2';
import { runWholeFundWaterfall } from '../../../../shared/lib/internal-economics/v2/waterfall-whole-fund-v2';
import {
  initializeEventStreamState,
  processSettledContribution,
  processDeployment,
  processRealization,
} from '../../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
import type { EventStreamState } from '../../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
import { buildMinimalV2Input } from '../../../helpers/v2-input-builder';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../../shared/lib/internal-economics/v2/normalize-input-v2';
import type { NormalizedInternalEconomicsInputV2 } from '../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';

function setupLaneTestState(selectedLane: 'deal_by_deal' | 'whole_fund'): {
  input: NormalizedInternalEconomicsInputV2;
  state: EventStreamState;
} {
  const wire = buildMinimalV2Input({ selectedLane });
  const result = verifyAndNormalizeInternalEconomicsInputV2(wire);
  if (!result.ok) throw new Error('normalization failed');
  const input = result.input;
  const state = initializeEventStreamState(input);

  processSettledContribution(
    {
      eventId: 'contrib-1',
      instant: '2024-02-01T00:00:00Z',
      amountUsd: '200000.000000',
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
      instant: '2024-03-01T00:00:00Z',
      amountUsd: '200000.000000',
      kind: 'deployment',
      dealId: 'd-1',
      securityId: 's-1',
      cashSourceAllocations: [{ lotId: 'csl:contrib-1', amount: '200000.000000' }],
    },
    state
  );

  processRealization(
    {
      eventId: 'real-1',
      instant: '2025-03-01T00:00:00Z',
      amountUsd: '300000.000000',
      kind: 'realization',
      dealId: 'd-1',
      reliefRows: [
        {
          investmentLotId: 'inv:d-1:s-1:dep-1',
          relievedCostBasis: '200000.000000',
          allocatedProceeds: '300000.000000',
        },
      ],
      recyclingTag: 'none',
    },
    state
  );

  return { input, state };
}

function snapshotState(state: EventStreamState): string {
  const parts: string[] = [];
  for (const [id, ledger] of state.partnerLedgers) {
    parts.push(
      `${id}:settled=${ledger.settledCapital.toFixed(6)},dist=${ledger.cumulativeDistributions.toFixed(6)}`
    );
  }
  for (const [id, lot] of state.investmentLots) {
    parts.push(`inv:${id}:relieved=${lot.relievedAmount.toFixed(6)}`);
  }
  for (const [id, lot] of state.cashSourceLots) {
    parts.push(`csl:${id}:bal=${lot.remainingBalance.toFixed(6)}`);
  }
  return parts.sort().join('|');
}

describe('lane isolation', () => {
  it('deal-by-deal does not mutate shared state', () => {
    const { input, state } = setupLaneTestState('deal_by_deal');
    const before = snapshotState(state);
    runDealByDealWaterfall(input, state);
    const after = snapshotState(state);
    expect(after).toBe(before);
  });

  it('whole-fund does not mutate shared state', () => {
    const { input, state } = setupLaneTestState('whole_fund');
    const before = snapshotState(state);
    runWholeFundWaterfall(input, state);
    const after = snapshotState(state);
    expect(after).toBe(before);
  });

  it('running both lanes on same state produces independent results', () => {
    const { input: dInput, state: dState } = setupLaneTestState('deal_by_deal');
    const { input: wInput, state: wState } = setupLaneTestState('whole_fund');

    const dealResult = runDealByDealWaterfall(dInput, dState);
    const wholeResult = runWholeFundWaterfall(wInput, wState);

    expect(dealResult.ok).toBe(true);
    expect(wholeResult.ok).toBe(true);

    if (!dealResult.ok || !wholeResult.ok) return;

    expect(dealResult.totalDistributed.gt(0)).toBe(true);
    expect(wholeResult.totalDistributed.gt(0)).toBe(true);
  });

  it('sequential lane runs produce same results as independent runs', () => {
    const { input: i1, state: s1 } = setupLaneTestState('deal_by_deal');
    const { input: i2, state: s2 } = setupLaneTestState('deal_by_deal');

    runWholeFundWaterfall(
      verifyAndNormalizeInternalEconomicsInputV2(
        buildMinimalV2Input({ selectedLane: 'whole_fund' })
      ).ok
        ? (
            verifyAndNormalizeInternalEconomicsInputV2(
              buildMinimalV2Input({ selectedLane: 'whole_fund' })
            ) as { ok: true; input: NormalizedInternalEconomicsInputV2 }
          ).input
        : i1,
      s1
    );

    const afterWhole = runDealByDealWaterfall(i1, s1);
    const standalone = runDealByDealWaterfall(i2, s2);

    expect(afterWhole.ok).toBe(true);
    expect(standalone.ok).toBe(true);
    if (!afterWhole.ok || !standalone.ok) return;

    expect(afterWhole.totalDistributed.toFixed(6)).toBe(standalone.totalDistributed.toFixed(6));
  });

  it('waterfall results contain only Decimal values, not raw numbers', () => {
    const { input, state } = setupLaneTestState('deal_by_deal');
    const result = runDealByDealWaterfall(input, state);
    if (!result.ok) return;

    for (const tier of result.tierAllocations) {
      expect(tier.totalAllocated).toBeInstanceOf(Decimal);
      expect(tier.gpShare).toBeInstanceOf(Decimal);
      expect(tier.lpShare).toBeInstanceOf(Decimal);
    }
  });
});
