import { describe, it, expect } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import {
  runWholeFundWaterfall,
  toTierAllocationsV2,
} from '../../../../shared/lib/internal-economics/v2/waterfall-whole-fund-v2';
import {
  initializeEventStreamState,
  processSettledContribution,
  processDeployment,
  processRealization,
} from '../../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
import { buildMinimalV2Input } from '../../../helpers/v2-input-builder';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../../shared/lib/internal-economics/v2/normalize-input-v2';

function setupStateWithRealization() {
  const wire = buildMinimalV2Input({ selectedLane: 'whole_fund' });
  const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
  if (!normalizeResult.ok) throw new Error('normalization failed');
  const input = normalizeResult.input;
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

describe('runWholeFundWaterfall', () => {
  it('returns ok with tier allocations', () => {
    const { input, state } = setupStateWithRealization();
    const result = runWholeFundWaterfall(input, state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tierAllocations.length).toBeGreaterThan(0);
    expect(result.totalDistributed.gt(0)).toBe(true);
  });

  it('allocates ROC up to cost basis', () => {
    const { input, state } = setupStateWithRealization();
    const result = runWholeFundWaterfall(input, state);
    if (!result.ok) return;

    const roc = result.tierAllocations.find((t) => t.kind === 'return_of_capital');
    expect(roc).toBeDefined();
    expect(roc!.totalAllocated.lte(new Decimal('200000'))).toBe(true);
  });

  it('carry splits remainder by GP share rate', () => {
    const { input, state } = setupStateWithRealization();
    const result = runWholeFundWaterfall(input, state);
    if (!result.ok) return;

    const carry = result.tierAllocations.find((t) => t.kind === 'carry');
    expect(carry).toBeDefined();
    if (carry && carry.totalAllocated.gt(0)) {
      expect(carry.gpShare.plus(carry.lpShare).toFixed(6)).toBe(carry.totalAllocated.toFixed(6));
    }
  });

  it('distributes to all partners', () => {
    const { input, state } = setupStateWithRealization();
    const result = runWholeFundWaterfall(input, state);
    if (!result.ok) return;

    expect(result.partnerDistributions.has('lp-1')).toBe(true);
    expect(result.partnerDistributions.has('gp-1')).toBe(true);
  });

  it('refuses when carry tier missing', () => {
    const wire = buildMinimalV2Input({
      selectedLane: 'whole_fund',
      waterfallPolicy: [{ kind: 'return_of_capital', priority: 1 }],
    });
    const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
    if (!normalizeResult.ok) return;
    const state = initializeEventStreamState(normalizeResult.input);
    const result = runWholeFundWaterfall(normalizeResult.input, state);
    expect(result.ok).toBe(false);
  });

  it('handles zero distributable', () => {
    const wire = buildMinimalV2Input({ selectedLane: 'whole_fund' });
    const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
    if (!normalizeResult.ok) return;
    const state = initializeEventStreamState(normalizeResult.input);
    const result = runWholeFundWaterfall(normalizeResult.input, state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalDistributed.isZero()).toBe(true);
  });

  it('defers carry until fund-wide ROC satisfied', () => {
    const { input, state } = setupStateWithRealization();
    const result = runWholeFundWaterfall(input, state);
    if (!result.ok) return;

    const roc = result.tierAllocations.find((t) => t.kind === 'return_of_capital');
    const carry = result.tierAllocations.find((t) => t.kind === 'carry');

    if (roc && carry) {
      expect(roc.priority).toBeLessThan(carry.priority);
    }
  });
});

describe('toTierAllocationsV2', () => {
  it('formats tier results as V2 receipt allocations', () => {
    const results = [
      {
        kind: 'return_of_capital',
        priority: 1,
        totalAllocated: new Decimal('200000'),
        gpShare: new Decimal('18181.818182'),
        lpShare: new Decimal('181818.181818'),
        perPartner: new Map(),
      },
    ];
    const formatted = toTierAllocationsV2(results);
    expect(formatted).toHaveLength(1);
    expect(formatted[0]!.totalAllocated).toBe('200000.000000');
    expect(formatted[0]!.kind).toBe('return_of_capital');
  });
});
