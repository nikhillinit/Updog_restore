import { describe, it, expect } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import type { InternalEconomicsInputV2Wire } from '../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';
import {
  runDealByDealWaterfall,
  toTierAllocationsV2,
  type DealByDealWaterfallResult,
} from '../../../../shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2';
import {
  runWholeFundWaterfall,
  toTierAllocationsV2 as toWholeFundTierAllocationsV2,
} from '../../../../shared/lib/internal-economics/v2/waterfall-whole-fund-v2';
import type { EventStreamState } from '../../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
import {
  initializeEventStreamState,
  processSettledContribution,
  processDeployment,
  processRealization,
} from '../../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
import { buildMinimalV2Input } from '../../../helpers/v2-input-builder';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../../shared/lib/internal-economics/v2/normalize-input-v2';

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

function setupCatchUpState() {
  const wire = buildMinimalV2Input({
    selectedLane: 'deal_by_deal',
    waterfallPolicy: CATCH_UP_POLICY,
  });
  const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
  if (!normalizeResult.ok) throw new Error(`normalization failed: ${normalizeResult.code}`);
  return {
    input: normalizeResult.input,
    state: initializeEventStreamState(normalizeResult.input),
  };
}

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

function poolTierSignatures(
  result: DealByDealWaterfallResult,
  poolIndex: number,
  policyLength: number
): Array<{
  kind: string;
  totalAllocated: string;
  gpShare: string;
  lpShare: string;
  perPartner: string[];
}> {
  return result.tierAllocations
    .slice(poolIndex * policyLength, (poolIndex + 1) * policyLength)
    .map((tier) => ({
      kind: tier.kind,
      totalAllocated: tier.totalAllocated.toFixed(6),
      gpShare: tier.gpShare.toFixed(6),
      lpShare: tier.lpShare.toFixed(6),
      perPartner: Array.from(tier.perPartner.entries())
        .map(([partnerId, amount]) => `${partnerId}:${amount.toFixed(6)}`)
        .sort(),
    }));
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

describe('runDealByDealWaterfall gp_catch_up tier (F_2.0.4)', () => {
  it('keeps distinct-deal pools independent and order-invariant', () => {
    const deals = [
      {
        partnerId: 'lp-1',
        contribution: '200000.000000',
        dealId: 'deal-a',
        securityId: 'security-a',
        proceeds: '300000.000000',
      },
      {
        partnerId: 'lp-1',
        contribution: '150000.000000',
        dealId: 'deal-b',
        securityId: 'security-b',
        proceeds: '260000.000000',
      },
    ];

    const run = (reverse: boolean): DealByDealWaterfallResult => {
      const { input, state } = setupCatchUpState();
      for (const deal of reverse ? [...deals].reverse() : deals) {
        processDealLifecycle(state, deal);
      }
      // Zero accrued preference: a positive fund-level preference balance with
      // multiple pools fails closed (no per-pool provenance) — covered below.

      const result = runDealByDealWaterfall(input, state);
      if (!result.ok) throw new Error('expected deal-by-deal waterfall to succeed');
      return result;
    };

    const forward = run(false);
    const reverse = run(true);
    const forwardKeys = forward.pools.map((pool) => `${pool.dealId}:${pool.securityId}`);
    const reverseKeys = reverse.pools.map((pool) => `${pool.dealId}:${pool.securityId}`);
    const expectedKeys = ['deal-a:security-a', 'deal-b:security-b'];

    expect(forwardKeys).toEqual(expectedKeys);
    expect(reverseKeys).toEqual([...expectedKeys].reverse());
    expect(new Set(forward.pools.map((pool) => pool.dealId)).size).toBe(forward.pools.length);
    expect(new Set(reverse.pools.map((pool) => pool.dealId)).size).toBe(reverse.pools.length);

    const expectedProceeds: Record<string, string> = {
      'deal-a:security-a': '300000.000000',
      'deal-b:security-b': '260000.000000',
    };
    const expectedBasis: Record<string, string> = {
      'deal-a:security-a': '200000.000000',
      'deal-b:security-b': '150000.000000',
    };

    for (const result of [forward, reverse]) {
      for (const pool of result.pools) {
        const key = `${pool.dealId}:${pool.securityId}`;
        expect(expectedKeys).toContain(key);
        expect(pool.proceedsAvailable.toFixed(6)).toBe(expectedProceeds[key]);
        expect(pool.costBasisRelieved.toFixed(6)).toBe(expectedBasis[key]);
      }
    }

    for (const key of expectedKeys) {
      const forwardIndex = forwardKeys.indexOf(key);
      const reverseIndex = reverseKeys.indexOf(key);
      expect(forwardIndex).toBeGreaterThanOrEqual(0);
      expect(reverseIndex).toBeGreaterThanOrEqual(0);
      expect(poolTierSignatures(forward, forwardIndex, CATCH_UP_POLICY.length)).toEqual(
        poolTierSignatures(reverse, reverseIndex, CATCH_UP_POLICY.length)
      );
    }
  });

  it('fails closed when a positive accrued-preference balance meets multiple pools', () => {
    const { input, state } = setupCatchUpState();
    for (const deal of [
      {
        partnerId: 'lp-1',
        contribution: '200000.000000',
        dealId: 'deal-a',
        securityId: 'security-a',
        proceeds: '300000.000000',
      },
      {
        partnerId: 'lp-1',
        contribution: '150000.000000',
        dealId: 'deal-b',
        securityId: 'security-b',
        proceeds: '260000.000000',
      },
    ]) {
      processDealLifecycle(state, deal);
    }
    seedAccruedPreference(state, { 'lp-1': '40000.000000', 'gp-1': '4000.000000' });

    expect(() => runDealByDealWaterfall(input, state)).toThrow(
      /accrued-preference balance across multiple entitlement pools/
    );
  });

  it('bounds single-pool preferred return by the ledger balance with weights independent of settled capital', () => {
    const { input, state } = setupCatchUpState();
    processDealLifecycle(state, {
      partnerId: 'lp-1',
      contribution: '200000.000000',
      dealId: 'deal-a',
      securityId: 'security-a',
      proceeds: '300000.000000',
    });
    // Preference weights (10k/34k) deliberately differ from settled-capital
    // weights (lp-1 holds all settled capital), so a settled-capital-weighted
    // allocation would misallocate and fail the per-partner assertions.
    seedAccruedPreference(state, { 'lp-1': '10000.000000', 'gp-1': '34000.000000' });

    const result = runDealByDealWaterfall(input, state);
    if (!result.ok) throw new Error('expected deal-by-deal waterfall to succeed');

    const pref = result.tierAllocations.find((tier) => tier.kind === 'preferred_return');
    if (!pref) throw new Error('expected preferred_return tier');

    expect(pref.totalAllocated.toFixed(6)).toBe('44000.000000');
    const perPartnerTotal = Array.from(pref.perPartner.values()).reduce(
      (total, amount) => total.plus(amount),
      new Decimal(0)
    );
    expect(perPartnerTotal.toFixed(6)).toBe(pref.totalAllocated.toFixed(6));
    expect(pref.perPartner.get('lp-1')!.toFixed(6)).toBe('10000.000000');
    expect(pref.perPartner.get('gp-1')!.toFixed(6)).toBe('34000.000000');
    expect(pref.totalAllocated.lte(new Decimal('44000.000000'))).toBe(true);
  });

  it('matches whole-fund output for a clean-opening single pool', () => {
    const { input, state } = setupCatchUpState();
    processDealLifecycle(state, {
      partnerId: 'lp-1',
      contribution: '200000.000000',
      dealId: 'deal-a',
      securityId: 'security-a',
      proceeds: '300000.000003',
    });
    seedAccruedPreference(state, { 'lp-1': '40000.000000', 'gp-1': '4000.000000' });

    const dealResult = runDealByDealWaterfall(input, state);
    const wholeResult = runWholeFundWaterfall(input, state);
    if (!dealResult.ok || !wholeResult.ok) {
      throw new Error('expected both waterfall engines to succeed');
    }

    expect(dealResult.pools.map((pool) => `${pool.dealId}:${pool.securityId}`)).toEqual([
      'deal-a:security-a',
    ]);
    expect(toTierAllocationsV2(dealResult.tierAllocations)).toEqual(
      toWholeFundTierAllocationsV2(wholeResult.tierAllocations)
    );
    expect(dealResult.totalDistributed.toFixed(6)).toBe(wholeResult.totalDistributed.toFixed(6));

    for (const partnerId of ['lp-1', 'gp-1']) {
      expect(dealResult.partnerDistributions.get(partnerId)!.toFixed(6)).toBe(
        wholeResult.partnerDistributions.get(partnerId)!.toFixed(6)
      );
    }
  });

  it('conserves catch-up and carry through quantized partner allocation', () => {
    const { input, state } = setupCatchUpState();
    processDealLifecycle(state, {
      partnerId: 'lp-1',
      contribution: '200000.000000',
      dealId: 'deal-a',
      securityId: 'security-a',
      proceeds: '300000.000003',
    });
    seedAccruedPreference(state, { 'lp-1': '40000.000000', 'gp-1': '4000.000000' });

    const result = runDealByDealWaterfall(input, state);
    if (!result.ok) throw new Error('expected deal-by-deal waterfall to succeed');

    const roc = result.tierAllocations.find((tier) => tier.kind === 'return_of_capital');
    const pref = result.tierAllocations.find((tier) => tier.kind === 'preferred_return');
    const catchUp = result.tierAllocations.find((tier) => tier.kind === 'gp_catch_up');
    const carry = result.tierAllocations.find((tier) => tier.kind === 'carry');
    if (!roc || !pref || !catchUp || !carry) {
      throw new Error('expected all waterfall tiers');
    }

    for (const tier of [catchUp, carry]) {
      expect(tier.gpShare.plus(tier.lpShare).toFixed(6)).toBe(tier.totalAllocated.toFixed(6));
      const perPartnerTotal = Array.from(tier.perPartner.values()).reduce(
        (total, amount) => total.plus(amount),
        new Decimal(0)
      );
      expect(perPartnerTotal.toFixed(6)).toBe(tier.totalAllocated.toFixed(6));
    }

    const remainingAtCatchUp = new Decimal('300000.000003')
      .minus(roc.totalAllocated)
      .minus(pref.totalAllocated);
    expect(catchUp.totalAllocated.plus(carry.totalAllocated).toFixed(6)).toBe(
      remainingAtCatchUp.toFixed(6)
    );
    expect(result.totalDistributed.toFixed(6)).toBe('300000.000003');
  });

  it('throws when positive catch-up GP bucket has no eligible GP cohort', () => {
    const { input, state } = setupCatchUpState();
    processDealLifecycle(state, {
      partnerId: 'lp-1',
      contribution: '200000.000000',
      dealId: 'deal-a',
      securityId: 'security-a',
      proceeds: '300000.000000',
    });
    state.partnerLedgers.delete('gp-1');
    seedAccruedPreference(state, { 'lp-1': '40000.000000' });

    expect(() => runDealByDealWaterfall(input, state)).toThrow(
      /Catch-up GP bucket invariant violated: no eligible GP partners/
    );
  });

  it('throws when positive carry LP bucket has no eligible LP cohort', () => {
    const { input, state } = setupCatchUpState();
    processDealLifecycle(state, {
      partnerId: 'lp-1',
      contribution: '200000.000000',
      dealId: 'deal-a',
      securityId: 'security-a',
      proceeds: '300000.000000',
    });
    state.partnerLedgers.delete('lp-1');

    expect(() => runDealByDealWaterfall(input, state)).toThrow(
      /Carry LP bucket invariant violated: no eligible LP partners/
    );
  });

  it('throws internal error for opening profit history when gp_catch_up consumes it', () => {
    const wire = buildMinimalV2Input({ waterfallPolicy: CATCH_UP_POLICY });
    const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
    if (!normalizeResult.ok) throw new Error(`normalization failed: ${normalizeResult.code}`);

    const input = {
      ...normalizeResult.input,
      openingState: {
        ...normalizeResult.input.openingState,
        profitDecomposition: {
          ...normalizeResult.input.openingState.profitDecomposition,
          openingCumulativeLpProfitDistributions: '1.000000',
        },
      },
    };
    const state = initializeEventStreamState(input);

    expect(() => runDealByDealWaterfall(input, state)).toThrow(
      /nonzero scalar opening profit-decomposition history with gp_catch_up/
    );
  });
});
