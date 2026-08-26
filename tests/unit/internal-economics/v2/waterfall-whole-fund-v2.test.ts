import { describe, it, expect } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import {
  runWholeFundWaterfall,
  toTierAllocationsV2,
} from '../../../../shared/lib/internal-economics/v2/waterfall-whole-fund-v2';
import {
  runDealByDealWaterfall,
  toTierAllocationsV2 as toDealByDealTierAllocationsV2,
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

// ---------------------------------------------------------------------------
// F_2.0.4 catch-up parity: first-ever catch-up/carry arithmetic coverage
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

function setupCatchUpState(overrides?: Partial<InternalEconomicsInputV2Wire>) {
  const wire = buildMinimalV2Input({
    selectedLane: 'whole_fund',
    waterfallPolicy: CATCH_UP_POLICY,
    ...overrides,
  });
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

function buildSingleCohortWire(cohort: 'lp_only' | 'gp_only'): InternalEconomicsInputV2Wire {
  const base = buildMinimalV2Input({
    selectedLane: 'whole_fund',
    waterfallPolicy: CATCH_UP_POLICY,
  });
  const lpOnly = cohort === 'lp_only';
  const partner = base.partners[lpOnly ? 0 : 1]!;
  const ledger = base.openingState.investorLedgers[lpOnly ? 0 : 1]!;
  // cashLots are defined GP-first in buildMinimalV2Input.
  const cashLot = base.openingState.openingProvenance.cashLots[lpOnly ? 1 : 0]!;
  const cash = lpOnly ? '500000.000000' : '50000.000000';
  const commitments = lpOnly ? '1000000.000000' : '100000.000000';
  return {
    ...base,
    partners: [partner],
    openingState: {
      ...base.openingState,
      openingCash: cash,
      openingCashClassification: {
        paidIn: cash,
        recycling: '0.000000',
        unclassified: '0.000000',
      },
      openingProvenance: {
        cashLots: [cashLot],
        investmentLots: [],
        entitlementPools: [],
      },
      openingCommitments: commitments,
      investorLedgers: [ledger],
    },
  };
}

describe('runWholeFundWaterfall gp_catch_up tier (F_2.0.4)', () => {
  it('computes catch-up from cumulative profit accumulators via the locked equation', () => {
    const { input, state } = setupCatchUpState();
    processDealLifecycle(state, {
      partnerId: 'lp-1',
      contribution: '200000.000000',
      dealId: 'd-1',
      securityId: 's-1',
      proceeds: '300000.000000',
    });
    seedAccruedPreference(state, { 'lp-1': '40000.000000', 'gp-1': '4000.000000' });
    const result = runWholeFundWaterfall(input, state);
    if (!result.ok) throw new Error('expected ok');

    const roc = result.tierAllocations.find((t) => t.kind === 'return_of_capital')!;
    const pref = result.tierAllocations.find((t) => t.kind === 'preferred_return')!;
    const catchUp = result.tierAllocations.find((t) => t.kind === 'gp_catch_up')!;

    // Preferred return pays 44000 (GP 4000 / LP 40000 by accrued shares), so
    // the accumulators entering catch-up are G = 4000, L = 40000.
    expect(roc.totalAllocated.toFixed(6)).toBe('200000.000000');
    expect(pref.totalAllocated.toFixed(6)).toBe('44000.000000');
    expect(pref.gpShare.toFixed(6)).toBe('4000.000000');
    expect(pref.lpShare.toFixed(6)).toBe('40000.000000');

    // Locked equation: (0.2*(4000+40000) - 4000) / (0.8-0.2) = 8000 exactly.
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
    expect(expected.allocatedTotal).toBe('8000.000000');
    expect(catchUp.totalAllocated.toFixed(6)).toBe('8000.000000');
    expect(catchUp.gpShare.toFixed(6)).toBe('6400.000000');
    expect(catchUp.lpShare.toFixed(6)).toBe('1600.000000');

    // The pre-F_2.0.4 engine equation ((c*(openingPrefPaid + remaining) - G)/g,
    // openings zero here) would allocate 14000 on this same input.
    const oldEngineAllocated = Decimal.min(
      remainingAtCatchUp,
      remainingAtCatchUp.mul(new Decimal('0.2')).div(new Decimal('0.8'))
    );
    expect(oldEngineAllocated.toFixed(6)).toBe('14000.000000');
    expect(catchUp.totalAllocated.toFixed(6)).not.toBe(oldEngineAllocated.toFixed(6));
  });

  it('conserves quantized units across catch-up and carry tiers', () => {
    const { input, state } = setupCatchUpState();
    processDealLifecycle(state, {
      partnerId: 'lp-1',
      contribution: '200000.000000',
      dealId: 'd-1',
      securityId: 's-1',
      proceeds: '300000.000000',
    });
    seedAccruedPreference(state, { 'lp-1': '40000.000000', 'gp-1': '4000.000000' });
    const result = runWholeFundWaterfall(input, state);
    if (!result.ok) throw new Error('expected ok');

    for (const kind of ['gp_catch_up', 'carry']) {
      const tier = result.tierAllocations.find((t) => t.kind === kind)!;
      expect(tier.totalAllocated.gt(0)).toBe(true);
      expect(tier.gpShare.plus(tier.lpShare).toFixed(6)).toBe(tier.totalAllocated.toFixed(6));
      let perPartnerSum = new Decimal(0);
      for (const [, amount] of tier.perPartner) perPartnerSum = perPartnerSum.plus(amount);
      expect(perPartnerSum.toFixed(6)).toBe(tier.totalAllocated.toFixed(6));
    }

    // Carry consumes the exact remainder: 200000 + 44000 + 8000 + 48000.
    const carry = result.tierAllocations.find((t) => t.kind === 'carry')!;
    expect(carry.totalAllocated.toFixed(6)).toBe('48000.000000');
    expect(result.totalDistributed.toFixed(6)).toBe('300000.000000');
  });

  it('conserves source proceeds when preferred return rounds at a half-micro boundary', () => {
    const { input, state } = setupCatchUpState({
      waterfallPolicy: [
        {
          kind: 'preferred_return',
          priority: 1,
          basis: 'unreturned_settled_cash_capital',
          annualRate: '0.080000000000',
          rateMode: 'simple',
        },
        { kind: 'carry', priority: 2, gpShare: '0.200000000000' },
      ],
    });
    processDealLifecycle(state, {
      partnerId: 'lp-1',
      contribution: '0.100000',
      dealId: 'd-1',
      securityId: 's-1',
      proceeds: '1.000000',
    });
    seedAccruedPreference(state, { 'lp-1': '0.0000005' });

    const result = runWholeFundWaterfall(input, state);
    if (!result.ok) throw new Error('expected ok');

    const preferred = result.tierAllocations.find((t) => t.kind === 'preferred_return')!;
    const carry = result.tierAllocations.find((t) => t.kind === 'carry')!;
    const partnerTotal = Array.from(result.partnerDistributions.values()).reduce(
      (sum, amount) => sum.plus(amount),
      new Decimal(0)
    );
    expect(preferred.totalAllocated.toFixed(6)).toBe('0.000001');
    expect(carry.totalAllocated.toFixed(6)).toBe('0.999999');
    expect(result.totalDistributed.toFixed(6)).toBe('1.000000');
    expect(partnerTotal.toFixed(6)).toBe('1.000000');
  });

  it('clean-opening single-pool fixture is equal across engines', () => {
    const { input, state } = setupCatchUpState();
    processDealLifecycle(state, {
      partnerId: 'lp-1',
      contribution: '200000.000000',
      dealId: 'd-1',
      securityId: 's-1',
      proceeds: '300000.000000',
    });
    seedAccruedPreference(state, { 'lp-1': '40000.000000', 'gp-1': '4000.000000' });
    const wholeFund = runWholeFundWaterfall(input, state);
    const dealByDeal = runDealByDealWaterfall(input, state);
    if (!wholeFund.ok) throw new Error('whole-fund not ok');
    if (!dealByDeal.ok) throw new Error('deal-by-deal not ok');

    expect(dealByDeal.pools.map((p) => `${p.dealId}:${p.securityId}`)).toEqual(['d-1:s-1']);
    const wholeFundTiers = toTierAllocationsV2(wholeFund.tierAllocations);
    const dealByDealTiers = toDealByDealTierAllocationsV2(dealByDeal.tierAllocations);
    expect(dealByDealTiers).toEqual(wholeFundTiers);

    const catchUp = wholeFundTiers.find((t) => t.kind === 'gp_catch_up')!;
    expect(catchUp.totalAllocated).toBe('8000.000000');
  });

  it('throws the defensive error on a positive GP bucket with no GP cohort', () => {
    const wire = buildSingleCohortWire('lp_only');
    const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
    if (!normalizeResult.ok) throw new Error(`normalization failed: ${normalizeResult.code}`);
    const state = initializeEventStreamState(normalizeResult.input);
    processDealLifecycle(state, {
      partnerId: 'lp-1',
      contribution: '200000.000000',
      dealId: 'd-1',
      securityId: 's-1',
      proceeds: '300000.000000',
    });
    seedAccruedPreference(state, { 'lp-1': '40000.000000' });
    // Preferred return funds L, so the catch-up GP bucket is positive and the
    // empty GP cohort must trip the guard rather than drop the bucket.
    expect(() => runWholeFundWaterfall(normalizeResult.input, state)).toThrow(
      /no eligible GP partners/
    );
  });

  it('throws the defensive error on a positive LP bucket with no LP cohort', () => {
    const wire = buildSingleCohortWire('gp_only');
    const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
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
    // All-GP fund: catch-up is zero (G-only profit cannot satisfy c*(G+L) > G),
    // so the carry LP bucket is the first positive bucket with an empty cohort.
    expect(() => runWholeFundWaterfall(normalizeResult.input, state)).toThrow(
      /no eligible LP partners/
    );
  });

  it('throws the defensive error on pari-passu opening preferred history', () => {
    const { input, state } = setupCatchUpState();
    const tampered = JSON.parse(JSON.stringify(input)) as typeof input;
    tampered.openingState.profitDecomposition.openingCumulativePreferredPaid = '1.000000';

    expect(() => runWholeFundWaterfall(tampered, state)).toThrow(
      /pari-passu opening preferred history/i
    );
  });
});
