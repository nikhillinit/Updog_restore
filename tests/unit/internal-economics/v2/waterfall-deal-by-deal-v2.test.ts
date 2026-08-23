import { describe, it, expect } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import {
  runDealByDealWaterfall,
  toTierAllocationsV2,
} from '../../../../shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2';
import {
  initializeEventStreamState,
  processSettledContribution,
  processDeployment,
  processRealization,
} from '../../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
import { buildMinimalV2Input } from '../../../helpers/v2-input-builder';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../../shared/lib/internal-economics/v2/normalize-input-v2';

function setupStateWithRealization() {
  const wire = buildMinimalV2Input();
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

describe('runDealByDealWaterfall', () => {
  it('returns ok with tier allocations', () => {
    const { input, state } = setupStateWithRealization();
    const result = runDealByDealWaterfall(input, state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tierAllocations.length).toBeGreaterThan(0);
    expect(result.totalDistributed.gt(0)).toBe(true);
  });

  it('allocates return of capital first', () => {
    const { input, state } = setupStateWithRealization();
    const result = runDealByDealWaterfall(input, state);
    if (!result.ok) return;

    const roc = result.tierAllocations.find((t) => t.kind === 'return_of_capital');
    expect(roc).toBeDefined();
    expect(roc!.totalAllocated.gt(0)).toBe(true);
  });

  it('allocates carry as GP/LP split', () => {
    const { input, state } = setupStateWithRealization();
    const result = runDealByDealWaterfall(input, state);
    if (!result.ok) return;

    const carry = result.tierAllocations.find((t) => t.kind === 'carry');
    expect(carry).toBeDefined();
    if (carry && carry.totalAllocated.gt(0)) {
      expect(carry.gpShare.gt(0)).toBe(true);
      expect(carry.lpShare.gt(0)).toBe(true);
    }
  });

  it('distributes to partners', () => {
    const { input, state } = setupStateWithRealization();
    const result = runDealByDealWaterfall(input, state);
    if (!result.ok) return;

    const lpDist = result.partnerDistributions.get('lp-1');
    expect(lpDist).toBeDefined();
    expect(lpDist!.gt(0)).toBe(true);
  });

  it('refuses when carry tier missing', () => {
    const wire = buildMinimalV2Input({
      waterfallPolicy: [{ kind: 'return_of_capital', priority: 1 }],
    });
    const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
    if (!normalizeResult.ok) return;
    const state = initializeEventStreamState(normalizeResult.input);
    const result = runDealByDealWaterfall(normalizeResult.input, state);
    expect(result.ok).toBe(false);
  });

  it('handles zero proceeds', () => {
    const wire = buildMinimalV2Input();
    const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
    if (!normalizeResult.ok) return;
    const state = initializeEventStreamState(normalizeResult.input);
    const result = runDealByDealWaterfall(normalizeResult.input, state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalDistributed.isZero()).toBe(true);
  });
});

describe('toTierAllocationsV2', () => {
  it('merges same-kind tiers', () => {
    const results = [
      {
        kind: 'return_of_capital',
        priority: 1,
        totalAllocated: new Decimal('100'),
        gpShare: new Decimal('10'),
        lpShare: new Decimal('90'),
        perPartner: new Map(),
      },
      {
        kind: 'return_of_capital',
        priority: 1,
        totalAllocated: new Decimal('50'),
        gpShare: new Decimal('5'),
        lpShare: new Decimal('45'),
        perPartner: new Map(),
      },
    ];
    const merged = toTierAllocationsV2(results);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.totalAllocated).toBe('150.000000');
    expect(merged[0]!.gpShare).toBe('15.000000');
    expect(merged[0]!.lpShare).toBe('135.000000');
  });

  it('sorts by priority', () => {
    const results = [
      {
        kind: 'carry',
        priority: 3,
        totalAllocated: new Decimal('50'),
        gpShare: new Decimal('10'),
        lpShare: new Decimal('40'),
        perPartner: new Map(),
      },
      {
        kind: 'return_of_capital',
        priority: 1,
        totalAllocated: new Decimal('100'),
        gpShare: new Decimal('10'),
        lpShare: new Decimal('90'),
        perPartner: new Map(),
      },
    ];
    const merged = toTierAllocationsV2(results);
    expect(merged[0]!.kind).toBe('return_of_capital');
    expect(merged[1]!.kind).toBe('carry');
  });
});
