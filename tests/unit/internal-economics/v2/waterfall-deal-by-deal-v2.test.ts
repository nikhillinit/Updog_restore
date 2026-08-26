import { describe, it, expect } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import {
  runDealByDealWaterfall,
  toTierAllocationsV2,
} from '../../../../shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2';
import { computeGpCatchUpAllocationV2 } from '../../../../shared/lib/internal-economics/v2/catch-up-allocation-v2';
import type { EventStreamState } from '../../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
import {
  initializeEventStreamState,
  processSettledContribution,
  processDeployment,
  processRealization,
} from '../../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
import type { InternalEconomicsInputV2Wire } from '../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';
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

// ---------------------------------------------------------------------------
// F_2.0.4 catch-up parity: per-pool accumulators, independence, conservation
// ---------------------------------------------------------------------------

const CATCH_UP_POLICY: InternalEconomicsInputV2Wire['waterfallPolicy'] = [
  { kind: 'return_of_capital', priority: 1 },
  {
    kind: 'preferred_return',
    priority: 2,
    basis: 'unreturned_settled_cash_capital',
    annualRate: '0.080000000000',
    rateMode: 'simple',
  },
  { kind: 'gp_catch_up', priority: 3, gpAllocationRate: '0.800000000000' },
  { kind: 'carry', priority: 4, gpShare: '0.200000000000' },
];

const TIER_ORDER = ['return_of_capital', 'preferred_return', 'gp_catch_up', 'carry'];

function setupCatchUpState(overrides?: Partial<InternalEconomicsInputV2Wire>) {
  const wire = buildMinimalV2Input({ waterfallPolicy: CATCH_UP_POLICY, ...overrides });
  const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
  if (!normalizeResult.ok) throw new Error(`normalization failed: ${normalizeResult.code}`);
  const input = normalizeResult.input;
  const state = initializeEventStreamState(input);
  return { input, state };
}

// Preferred-return accruals never post on the direct event-processor path
// (computeAccrualsAtInstant has no production callers), and normalization
// refuses nonzero opening accrued preference. Seeding the runtime ledger
// directly is the only way to give the preferred_return tier a positive
// target at the engine boundary.
function seedAccruedPreference(state: EventStreamState, accruals: Record<string, string>): void {
  for (const [partnerId, amount] of Object.entries(accruals)) {
    const ledger = state.partnerLedgers.get(partnerId);
    if (!ledger) throw new Error(`unknown partner ${partnerId}`);
    ledger.accruedPreference = new Decimal(amount);
  }
}

function processDealLifecycle(
  state: EventStreamState,
  args: {
    partnerId: string;
    contribution: string;
    dealId: string;
    securityId: string;
    proceeds: string;
  }
): void {
  const tag = args.dealId;
  processSettledContribution(
    {
      eventId: `contrib-${tag}`,
      instant: '2024-02-01T00:00:00Z',
      amountUsd: args.contribution,
      kind: 'settled_contribution',
      partnerId: args.partnerId,
      purpose: 'deployment',
      settlementSourceRef: `ref-${tag}`,
    },
    state
  );
  const deployRefusal = processDeployment(
    {
      eventId: `dep-${tag}`,
      instant: '2024-03-01T00:00:00Z',
      amountUsd: args.contribution,
      kind: 'deployment',
      dealId: args.dealId,
      securityId: args.securityId,
      cashSourceAllocations: [{ lotId: `csl:contrib-${tag}`, amount: args.contribution }],
    },
    state
  );
  if (deployRefusal) throw new Error(`deployment refused: ${deployRefusal.code}`);
  const realizationRefusal = processRealization(
    {
      eventId: `real-${tag}`,
      instant: '2025-03-01T00:00:00Z',
      amountUsd: args.proceeds,
      kind: 'realization',
      dealId: args.dealId,
      reliefRows: [
        {
          investmentLotId: `inv:${args.dealId}:${args.securityId}:dep-${tag}`,
          relievedCostBasis: args.contribution,
          allocatedProceeds: args.proceeds,
        },
      ],
      recyclingTag: 'none',
    },
    state
  );
  if (realizationRefusal) throw new Error(`realization refused: ${realizationRefusal.code}`);
}

const TWO_DEALS = [
  {
    partnerId: 'lp-1',
    contribution: '200000.000000',
    dealId: 'd-1',
    securityId: 's-1',
    proceeds: '300000.000000',
  },
  {
    partnerId: 'lp-1',
    contribution: '100000.000000',
    dealId: 'd-2',
    securityId: 's-2',
    proceeds: '150000.000000',
  },
];

function setupTwoPoolState(order: 'forward' | 'reverse') {
  const { input, state } = setupCatchUpState();
  const ordered = order === 'forward' ? TWO_DEALS : [TWO_DEALS[1]!, TWO_DEALS[0]!];
  for (const deal of ordered) processDealLifecycle(state, deal);
  seedAccruedPreference(state, { 'lp-1': '4000.000000', 'gp-1': '400.000000' });
  return { input, state };
}

function tierSnapshot(
  tiers: ReadonlyArray<{
    kind: string;
    totalAllocated: Decimal;
    gpShare: Decimal;
    lpShare: Decimal;
  }>
) {
  return tiers.map((t) => ({
    kind: t.kind,
    totalAllocated: t.totalAllocated.toFixed(6),
    gpShare: t.gpShare.toFixed(6),
    lpShare: t.lpShare.toFixed(6),
  }));
}

describe('runDealByDealWaterfall gp_catch_up tier (F_2.0.4)', () => {
  it('computes catch-up from the pool-level accumulators via the locked equation', () => {
    const { input, state } = setupCatchUpState();
    processDealLifecycle(state, TWO_DEALS[0]!);
    seedAccruedPreference(state, { 'lp-1': '4000.000000', 'gp-1': '400.000000' });
    const result = runDealByDealWaterfall(input, state);
    if (!result.ok) throw new Error('expected ok');

    const roc = result.tierAllocations.find((t) => t.kind === 'return_of_capital')!;
    const pref = result.tierAllocations.find((t) => t.kind === 'preferred_return')!;
    const catchUp = result.tierAllocations.find((t) => t.kind === 'gp_catch_up')!;

    // Preferred return pays 4400 (GP 400 / LP 4000), so the pool accumulators
    // entering catch-up are G = 400, L = 4000.
    expect(roc.totalAllocated.toFixed(6)).toBe('200000.000000');
    expect(pref.totalAllocated.toFixed(6)).toBe('4400.000000');
    expect(pref.gpShare.toFixed(6)).toBe('400.000000');
    expect(pref.lpShare.toFixed(6)).toBe('4000.000000');

    // Locked equation: (0.2*(400+4000) - 400) / (0.8-0.2) = 800 exactly.
    const remainingAtCatchUp = new Decimal('300000')
      .minus(roc.totalAllocated)
      .minus(pref.totalAllocated);
    const expected = computeGpCatchUpAllocationV2({
      available: remainingAtCatchUp,
      cumulativeGpProfit: pref.gpShare,
      cumulativeLpProfit: pref.lpShare,
      terminalGpShare: new Decimal('0.2'),
      catchUpGpAllocationRate: new Decimal('0.8'),
    });
    expect(expected.allocatedTotal).toBe('800.000000');
    expect(catchUp.totalAllocated.toFixed(6)).toBe('800.000000');
    expect(catchUp.gpShare.toFixed(6)).toBe('640.000000');
    expect(catchUp.lpShare.toFixed(6)).toBe('160.000000');
  });

  it('attributes proceeds to distinct-deal pools with exact pool keys', () => {
    const { input, state } = setupTwoPoolState('forward');
    const result = runDealByDealWaterfall(input, state);
    if (!result.ok) throw new Error('expected ok');

    // Executable preconditions: exactly two pools, distinct deals, no
    // same-deal multi-security aliasing, proceeds on the expected pools.
    expect(result.pools.map((p) => `${p.dealId}:${p.securityId}`)).toEqual(['d-1:s-1', 'd-2:s-2']);
    const [p1, p2] = result.pools;
    expect(p1!.proceedsAvailable.toFixed(6)).toBe('300000.000000');
    expect(p1!.costBasisRelieved.toFixed(6)).toBe('200000.000000');
    expect(p1!.gainLoss.toFixed(6)).toBe('100000.000000');
    expect(p2!.proceedsAvailable.toFixed(6)).toBe('150000.000000');
    expect(p2!.costBasisRelieved.toFixed(6)).toBe('100000.000000');
    expect(p2!.gainLoss.toFixed(6)).toBe('50000.000000');

    // Each pool runs the full four-tier policy in order.
    expect(result.tierAllocations).toHaveLength(8);
    expect(result.tierAllocations.slice(0, 4).map((t) => t.kind)).toEqual(TIER_ORDER);
    expect(result.tierAllocations.slice(4, 8).map((t) => t.kind)).toEqual(TIER_ORDER);
  });

  it('pool processing order changes pool order only, not pool economics', () => {
    const forward = runDealByDealWaterfall(
      ...(() => {
        const { input, state } = setupTwoPoolState('forward');
        return [input, state] as const;
      })()
    );
    const reverse = runDealByDealWaterfall(
      ...(() => {
        const { input, state } = setupTwoPoolState('reverse');
        return [input, state] as const;
      })()
    );
    if (!forward.ok || !reverse.ok) throw new Error('expected ok');

    // The permutation actually changed processing order.
    expect(forward.pools.map((p) => `${p.dealId}:${p.securityId}`)).toEqual(['d-1:s-1', 'd-2:s-2']);
    expect(reverse.pools.map((p) => `${p.dealId}:${p.securityId}`)).toEqual(['d-2:s-2', 'd-1:s-1']);

    // Aggregate economics identical.
    expect(toTierAllocationsV2(reverse.tierAllocations)).toEqual(
      toTierAllocationsV2(forward.tierAllocations)
    );
    expect(reverse.totalDistributed.toFixed(6)).toBe(forward.totalDistributed.toFixed(6));
    for (const [partnerId, amount] of forward.partnerDistributions) {
      expect(reverse.partnerDistributions.get(partnerId)!.toFixed(6)).toBe(amount.toFixed(6));
    }

    // Per-pool tier slices identical after realignment (d-1 leads forward,
    // trails reverse).
    expect(tierSnapshot(reverse.tierAllocations.slice(4, 8))).toEqual(
      tierSnapshot(forward.tierAllocations.slice(0, 4))
    );
    expect(tierSnapshot(reverse.tierAllocations.slice(0, 4))).toEqual(
      tierSnapshot(forward.tierAllocations.slice(4, 8))
    );
  });

  it('conserves quantized units across catch-up and carry tiers in every pool', () => {
    const { input, state } = setupTwoPoolState('forward');
    const result = runDealByDealWaterfall(input, state);
    if (!result.ok) throw new Error('expected ok');

    for (const tier of result.tierAllocations) {
      if (tier.kind !== 'gp_catch_up' && tier.kind !== 'carry') continue;
      expect(tier.totalAllocated.gt(0)).toBe(true);
      expect(tier.gpShare.plus(tier.lpShare).toFixed(6)).toBe(tier.totalAllocated.toFixed(6));
      let perPartnerSum = new Decimal(0);
      for (const [, amount] of tier.perPartner) perPartnerSum = perPartnerSum.plus(amount);
      expect(perPartnerSum.toFixed(6)).toBe(tier.totalAllocated.toFixed(6));
    }

    // Carry consumes each pool's exact remainder: pool d-1 totals 300000
    // (200000 + 4400 + 800 + 94800), pool d-2 totals 150000
    // (100000 + 4400 + 800 + 44800).
    expect(result.totalDistributed.toFixed(6)).toBe('450000.000000');
  });

  it('throws the defensive error on a positive GP bucket with no GP cohort', () => {
    const wire = buildMinimalV2Input({ waterfallPolicy: CATCH_UP_POLICY });
    const lpOnly = {
      ...wire,
      partners: [wire.partners[0]!],
      openingState: {
        ...wire.openingState,
        openingCash: '500000.000000',
        openingCashClassification: {
          paidIn: '500000.000000',
          recycling: '0.000000',
          unclassified: '0.000000',
        },
        openingProvenance: {
          cashLots: [wire.openingState.openingProvenance.cashLots[1]!],
          investmentLots: [],
          entitlementPools: [],
        },
        openingCommitments: '1000000.000000',
        investorLedgers: [wire.openingState.investorLedgers[0]!],
      },
    };
    const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(lpOnly);
    if (!normalizeResult.ok) throw new Error(`normalization failed: ${normalizeResult.code}`);
    const state = initializeEventStreamState(normalizeResult.input);
    processDealLifecycle(state, TWO_DEALS[0]!);
    seedAccruedPreference(state, { 'lp-1': '40000.000000' });
    expect(() => runDealByDealWaterfall(normalizeResult.input, state)).toThrow(
      /no eligible GP partners/
    );
  });

  it('throws the defensive error on a positive LP bucket with no LP cohort', () => {
    const wire = buildMinimalV2Input({ waterfallPolicy: CATCH_UP_POLICY });
    const gpOnly = {
      ...wire,
      partners: [wire.partners[1]!],
      openingState: {
        ...wire.openingState,
        openingCash: '50000.000000',
        openingCashClassification: {
          paidIn: '50000.000000',
          recycling: '0.000000',
          unclassified: '0.000000',
        },
        openingProvenance: {
          cashLots: [wire.openingState.openingProvenance.cashLots[0]!],
          investmentLots: [],
          entitlementPools: [],
        },
        openingCommitments: '100000.000000',
        investorLedgers: [wire.openingState.investorLedgers[1]!],
      },
    };
    const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(gpOnly);
    if (!normalizeResult.ok) throw new Error(`normalization failed: ${normalizeResult.code}`);
    const state = initializeEventStreamState(normalizeResult.input);
    processDealLifecycle(state, {
      partnerId: 'gp-1',
      contribution: '50000.000000',
      dealId: 'd-1',
      securityId: 's-1',
      proceeds: '80000.000000',
    });
    seedAccruedPreference(state, { 'gp-1': '4000.000000' });
    expect(() => runDealByDealWaterfall(normalizeResult.input, state)).toThrow(
      /no eligible LP partners/
    );
  });

  it('throws the defensive error on nonzero scalar opening profit history', () => {
    const { input, state } = setupCatchUpState();
    processDealLifecycle(state, TWO_DEALS[0]!);
    // Normalization refuses this with OPENING_PROVENANCE_REQUIRED on the public
    // path; the engine-level throw is the internal backstop (no new public
    // refusal family).
    const tampered = JSON.parse(JSON.stringify(input)) as typeof input;
    tampered.openingState.profitDecomposition.openingCumulativePreferredPaid = '1.000000';
    expect(() => runDealByDealWaterfall(tampered, state)).toThrow(/opening profit history/i);
  });
});
