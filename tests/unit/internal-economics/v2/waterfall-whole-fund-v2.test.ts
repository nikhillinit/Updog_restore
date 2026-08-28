import { describe, it, expect } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import type { InternalEconomicsInputV2Wire } from '../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';
import {
  runWholeFundWaterfall,
  toTierAllocationsV2,
} from '../../../../shared/lib/internal-economics/v2/waterfall-whole-fund-v2';
import { computeGpCatchUpAllocationV2 } from '../../../../shared/lib/internal-economics/v2/catch-up-allocation-v2';
import type { EventStreamState } from '../../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
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

function setupCatchUpState() {
  const wire = buildMinimalV2Input({
    selectedLane: 'whole_fund',
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

describe('runWholeFundWaterfall gp_catch_up tier (F_2.0.4)', () => {
  it('uses emitted preferred-return amounts as cumulative profit before catch-up', () => {
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
    if (!result.ok) throw new Error('expected whole-fund waterfall to succeed');

    const roc = result.tierAllocations.find((tier) => tier.kind === 'return_of_capital')!;
    const pref = result.tierAllocations.find((tier) => tier.kind === 'preferred_return')!;
    const catchUp = result.tierAllocations.find((tier) => tier.kind === 'gp_catch_up')!;
    const carry = result.tierAllocations.find((tier) => tier.kind === 'carry')!;

    expect(roc.totalAllocated.toFixed(6)).toBe('200000.000000');
    expect(pref.totalAllocated.toFixed(6)).toBe('44000.000000');
    expect(pref.gpShare.toFixed(6)).toBe('4000.000000');
    expect(pref.lpShare.toFixed(6)).toBe('40000.000000');

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
    expect(carry.totalAllocated.toFixed(6)).toBe('48000.000000');
    expect(pref.gpShare.plus(catchUp.gpShare).plus(carry.gpShare).toFixed(6)).toBe('20000.000000');
    expect(pref.lpShare.plus(catchUp.lpShare).plus(carry.lpShare).toFixed(6)).toBe('80000.000000');
  });

  it('conserves catch-up and carry amounts through quantized partner allocation', () => {
    const { input, state } = setupCatchUpState();
    processDealLifecycle(state, {
      partnerId: 'lp-1',
      contribution: '200000.000000',
      dealId: 'd-1',
      securityId: 's-1',
      proceeds: '300000.000003',
    });
    seedAccruedPreference(state, { 'lp-1': '40000.000000', 'gp-1': '4000.000000' });

    const result = runWholeFundWaterfall(input, state);
    if (!result.ok) throw new Error('expected whole-fund waterfall to succeed');

    const roc = result.tierAllocations.find((tier) => tier.kind === 'return_of_capital')!;
    const pref = result.tierAllocations.find((tier) => tier.kind === 'preferred_return')!;
    const catchUp = result.tierAllocations.find((tier) => tier.kind === 'gp_catch_up')!;
    const carry = result.tierAllocations.find((tier) => tier.kind === 'carry')!;

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
      dealId: 'd-1',
      securityId: 's-1',
      proceeds: '300000.000000',
    });
    state.partnerLedgers.delete('gp-1');
    seedAccruedPreference(state, { 'lp-1': '40000.000000' });

    expect(() => runWholeFundWaterfall(input, state)).toThrow(/no eligible GP partners/);
  });

  it('throws when positive carry LP bucket has no eligible LP cohort', () => {
    const { input, state } = setupCatchUpState();
    processDealLifecycle(state, {
      partnerId: 'lp-1',
      contribution: '200000.000000',
      dealId: 'd-1',
      securityId: 's-1',
      proceeds: '300000.000000',
    });
    state.partnerLedgers.delete('lp-1');
    seedAccruedPreference(state, { 'gp-1': '4000.000000' });

    expect(() => runWholeFundWaterfall(input, state)).toThrow(/no eligible LP partners/);
  });

  it('throws for pari-passu resume with nonzero opening preferred paid and gp_catch_up', () => {
    const wire = buildMinimalV2Input({
      selectedLane: 'whole_fund',
      waterfallPolicy: CATCH_UP_POLICY,
      gpCashPreferredReturnTreatment: 'pari_passu',
    });
    const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(wire);
    if (!normalizeResult.ok) throw new Error(`normalization failed: ${normalizeResult.code}`);

    const input = {
      ...normalizeResult.input,
      openingState: {
        ...normalizeResult.input.openingState,
        profitDecomposition: {
          ...normalizeResult.input.openingState.profitDecomposition,
          openingCumulativePreferredPaid: '1.000000',
        },
      },
    };
    const state = initializeEventStreamState(input);

    expect(() => runWholeFundWaterfall(input, state)).toThrow(
      /pari-passu resume with nonzero opening preferred paid/
    );
  });
});
