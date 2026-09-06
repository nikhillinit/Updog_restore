import { Decimal } from '../../../shared/lib/decimal-config';
import type {
  InternalEconomicsInputV2Wire,
  NormalizedInternalEconomicsInputV2,
  V2Event,
} from '../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';
import type { InternalEconomicsReceiptV2 } from '../../../shared/contracts/internal-economics/internal-economics-receipt-v2.contract';
import {
  certifyInternalEconomicsDualLaneV2,
  processEventsV2ForTest,
} from '../../../shared/lib/internal-economics/v2/derive-composite-v2';
import {
  initializeEventStreamState,
  processRealization,
  type EventStreamState,
} from '../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../shared/lib/internal-economics/v2/normalize-input-v2';
import {
  runDealByDealWaterfall,
  toTierAllocationsV2 as dealTierAllocations,
} from '../../../shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2';
import {
  runWholeFundWaterfall,
  toTierAllocationsV2 as wholeTierAllocations,
} from '../../../shared/lib/internal-economics/v2/waterfall-whole-fund-v2';
import { describe, expect, it } from 'vitest';
import {
  buildMinimalV2Input,
  buildMultiSecurityRealizationV2Input,
  MULTI_SECURITY_REALIZATION_PRE_FIX_HASHES,
} from '../../helpers/v2-input-builder';
import { CANONICAL_RECEIPT_CHANGED_CASE_MANIFEST_V3 } from '../internal-economics/v2/support/canonical-receipt-changed-case-manifest-v3';

function stage(inputWire: InternalEconomicsInputV2Wire): {
  input: NormalizedInternalEconomicsInputV2;
  state: EventStreamState;
} {
  const normalized = verifyAndNormalizeInternalEconomicsInputV2(inputWire);
  if (!normalized.ok) throw new Error(normalized.refusal.message);
  const processed = processEventsV2ForTest(
    normalized.input,
    initializeEventStreamState(normalized.input)
  );
  if (!processed.ok) throw new Error(processed.refusal.message);
  return { input: normalized.input, state: processed.state };
}

function reversedInput(): InternalEconomicsInputV2Wire {
  const input = buildMultiSecurityRealizationV2Input();
  input.events = input.events
    .map((event): V2Event => {
      if (event.eventId === 'deployment-a') return { ...event, instant: '2025-02-03T00:00:00Z' };
      if (event.eventId === 'deployment-b') return { ...event, instant: '2025-02-02T00:00:00Z' };
      if (event.kind === 'realization')
        return { ...event, reliefRows: [...event.reliefRows].reverse() };
      return { ...event };
    })
    .reverse();
  return input;
}

function canonical(value: unknown): unknown {
  if (value instanceof Decimal) return value.toFixed(6);
  if (value instanceof Map) {
    return [...value.entries()]
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
      .map(([key, entry]) => [key, canonical(entry)]);
  }
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)])
    );
  }
  return value;
}

function proceeds(state: EventStreamState) {
  return [...state.cashSourceLots.values()]
    .filter((lot) => lot.origin === 'event' && lot.sourceKind === 'realization_proceeds')
    .map((lot) => ({
      lotId: lot.lotId,
      dealId: lot.dealId,
      securityId: lot.securityId,
      originalAmount: lot.originalAmount.toFixed(6),
      remainingBalance: lot.remainingBalance.toFixed(6),
    }));
}

function pools(result: ReturnType<typeof runDealByDealWaterfall>) {
  if (!result.ok) throw new Error(result.refusal.message);
  return Object.fromEntries(
    result.pools.map((pool) => [
      JSON.stringify([pool.dealId, pool.securityId]),
      {
        proceeds: pool.proceedsAvailable.toFixed(6),
        basis: pool.costBasisRelieved.toFixed(6),
        gainLoss: pool.gainLoss.toFixed(6),
      },
    ])
  );
}

function partnerSummary(receipt: InternalEconomicsReceiptV2) {
  return Object.fromEntries(
    receipt.partnerLedgers.map((ledger) => [
      ledger.partnerId,
      {
        cumulativeDistributions: ledger.cumulativeDistributions,
        returnOfCapital: ledger.returnOfCapital,
        carryPaid: ledger.carryPaid,
      },
    ])
  );
}

function partialRecyclingInput(reverse = false): InternalEconomicsInputV2Wire {
  const input = reverse ? reversedInput() : buildMultiSecurityRealizationV2Input();
  input.events.push({
    eventId: 'deployment-2',
    instant: '2025-05-01T00:00:00Z',
    amountUsd: '100.000000',
    kind: 'deployment',
    dealId: 'deal-2',
    securityId: 'security-c',
    cashSourceAllocations: [{ lotId: 'proceeds:realization-1:security-a', amount: '100.000000' }],
  });
  return input;
}

function collidingPoolKeyInput(reverseWindows = false): InternalEconomicsInputV2Wire {
  const first = reverseWindows
    ? ['2025-03-01T00:00:00Z', '2025-04-01T00:00:00Z']
    : ['2025-02-02T00:00:00Z', '2025-02-03T00:00:00Z'];
  const second = reverseWindows
    ? ['2025-02-02T00:00:00Z', '2025-02-03T00:00:00Z']
    : ['2025-03-01T00:00:00Z', '2025-04-01T00:00:00Z'];
  const input = buildMinimalV2Input({
    waterfallPolicy: [
      { kind: 'return_of_capital', priority: 1 },
      { kind: 'carry', priority: 2, gpShare: '0.200000000000' },
    ],
    events: [
      {
        eventId: 'contribution-collision',
        instant: '2025-02-01T00:00:00Z',
        amountUsd: '200.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'deployment',
        settlementSourceRef: 'settlement:collision',
      },
      {
        eventId: 'deployment-ab',
        instant: first[0]!,
        amountUsd: '100.000000',
        kind: 'deployment',
        dealId: 'a:b',
        securityId: 'c',
        cashSourceAllocations: [{ lotId: 'csl:contribution-collision', amount: '100.000000' }],
      },
      {
        eventId: 'realization-ab',
        instant: first[1]!,
        amountUsd: '120.000000',
        kind: 'realization',
        dealId: 'a:b',
        recyclingTag: 'none',
        reliefRows: [
          {
            investmentLotId: 'inv:a:b:c:deployment-ab',
            relievedCostBasis: '100.000000',
            allocatedProceeds: '120.000000',
          },
        ],
      },
      {
        eventId: 'deployment-a',
        instant: second[0]!,
        amountUsd: '100.000000',
        kind: 'deployment',
        dealId: 'a',
        securityId: 'b:c',
        cashSourceAllocations: [{ lotId: 'csl:contribution-collision', amount: '100.000000' }],
      },
      {
        eventId: 'realization-a',
        instant: second[1]!,
        amountUsd: '80.000000',
        kind: 'realization',
        dealId: 'a',
        recyclingTag: 'none',
        reliefRows: [
          {
            investmentLotId: 'inv:a:b:c:deployment-a',
            relievedCostBasis: '100.000000',
            allocatedProceeds: '80.000000',
          },
        ],
      },
    ],
  });
  input.lpClasses[0]!.feeProfile.managementFeeSchedule = [];
  return input;
}

function aliasSeedState(): EventStreamState {
  const input = buildMinimalV2Input({
    events: [
      {
        eventId: 'alias-contribution',
        instant: '2025-02-01T00:00:00Z',
        amountUsd: '400.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'deployment',
        settlementSourceRef: 'settlement:alias',
      },
      ...[
        ['deployment-xy', 'x:y'],
        ['deployment-a', 'a'],
        ['deployment-y', 'y'],
        ['deployment-b', 'b'],
      ].map(([eventId, securityId], index) => ({
        eventId: eventId!,
        instant: `2025-02-0${index + 2}T00:00:00Z`,
        amountUsd: '100.000000',
        kind: 'deployment' as const,
        dealId: 'deal-alias',
        securityId: securityId!,
        cashSourceAllocations: [{ lotId: 'csl:alias-contribution', amount: '100.000000' }],
      })),
    ],
  });
  input.lpClasses[0]!.feeProfile.managementFeeSchedule = [];
  return stage(input).state;
}

const plainAliasEvent = {
  eventId: 'alias',
  instant: '2025-04-01T00:00:00Z',
  amountUsd: '200.000000',
  kind: 'realization',
  dealId: 'deal-alias',
  recyclingTag: 'none',
  reliefRows: [
    {
      investmentLotId: 'inv:deal-alias:x:y:deployment-xy',
      relievedCostBasis: '100.000000',
      allocatedProceeds: '100.000000',
    },
    {
      investmentLotId: 'inv:deal-alias:a:deployment-a',
      relievedCostBasis: '100.000000',
      allocatedProceeds: '100.000000',
    },
  ],
} satisfies V2Event & { kind: 'realization' };

const colonAliasEvent = {
  eventId: 'alias:x',
  instant: '2025-04-02T00:00:00Z',
  amountUsd: '200.000000',
  kind: 'realization',
  dealId: 'deal-alias',
  recyclingTag: 'none',
  reliefRows: [
    {
      investmentLotId: 'inv:deal-alias:y:deployment-y',
      relievedCostBasis: '100.000000',
      allocatedProceeds: '100.000000',
    },
    {
      investmentLotId: 'inv:deal-alias:b:deployment-b',
      relievedCostBasis: '100.000000',
      allocatedProceeds: '100.000000',
    },
  ],
} satisfies V2Event & { kind: 'realization' };

describe('Internal Economics V2 multi-security realization routing', () => {
  it('routes exact security proceeds and preserves order-invariant conservation', () => {
    const base = stage(buildMultiSecurityRealizationV2Input());
    expect(proceeds(base.state)).toEqual([
      {
        lotId: 'proceeds:realization-1:security-a',
        dealId: 'deal-1',
        securityId: 'security-a',
        originalAmount: '120.000000',
        remainingBalance: '120.000000',
      },
      {
        lotId: 'proceeds:realization-1:security-b',
        dealId: 'deal-1',
        securityId: 'security-b',
        originalAmount: '80.000000',
        remainingBalance: '80.000000',
      },
    ]);

    const deal = runDealByDealWaterfall(base.input, base.state);
    expect(pools(deal)).toEqual({
      [JSON.stringify(['deal-1', 'security-a'])]: {
        proceeds: '120.000000',
        basis: '60.000000',
        gainLoss: '60.000000',
      },
      [JSON.stringify(['deal-1', 'security-b'])]: {
        proceeds: '80.000000',
        basis: '40.000000',
        gainLoss: '40.000000',
      },
    });
    if (!deal.ok) throw new Error(deal.refusal.message);
    expect(deal.totalDistributed.toFixed(6)).toBe('200.000000');

    const whole = runWholeFundWaterfall(base.input, base.state);
    if (!whole.ok) throw new Error(whole.refusal.message);
    expect(whole.totalDistributed.toFixed(6)).toBe('200.000000');

    const reversed = stage(reversedInput());
    const reversedDeal = runDealByDealWaterfall(reversed.input, reversed.state);
    const reversedWhole = runWholeFundWaterfall(reversed.input, reversed.state);
    expect(pools(reversedDeal)).toEqual(pools(deal));
    if (!reversedDeal.ok || !reversedWhole.ok) throw new Error('reversed waterfall refused');
    expect(dealTierAllocations(reversedDeal.tierAllocations)).toEqual(
      dealTierAllocations(deal.tierAllocations)
    );
    expect(wholeTierAllocations(reversedWhole.tierAllocations)).toEqual(
      wholeTierAllocations(whole.tierAllocations)
    );

    const live = certifyInternalEconomicsDualLaneV2(buildMultiSecurityRealizationV2Input());
    if (!live.ok) throw new Error(live.refusal.message);
    expect(live.certification.dealByDeal.normalizedInputHash).toBe(
      MULTI_SECURITY_REALIZATION_PRE_FIX_HASHES.normalizedInputHash
    );
    const dealManifest = CANONICAL_RECEIPT_CHANGED_CASE_MANIFEST_V3.find(
      (entry) => entry.caseId === 'V2-S-0102-deal-by-deal'
    )!;
    const wholeManifest = CANONICAL_RECEIPT_CHANGED_CASE_MANIFEST_V3.find(
      (entry) => entry.caseId === 'V2-S-0102-whole-fund'
    )!;
    expect(dealManifest.beforeResultHash).toBe(
      MULTI_SECURITY_REALIZATION_PRE_FIX_HASHES.dealByDealResultHash
    );
    expect(wholeManifest.beforeResultHash).toBe(
      MULTI_SECURITY_REALIZATION_PRE_FIX_HASHES.wholeFundResultHash
    );
    expect(live.certification.dealByDeal.resultHash).toBe(dealManifest.afterResultHash);
    expect(live.certification.wholeFund.resultHash).toBe(wholeManifest.afterResultHash);
  });

  it('keeps single-security lot IDs compatible and groups relief rows by security', () => {
    const single = buildMultiSecurityRealizationV2Input();
    single.events = single.events
      .filter((event) => event.eventId !== 'deployment-b')
      .map((event) =>
        event.kind === 'settled_contribution'
          ? { ...event, amountUsd: '120.000000' }
          : event.kind === 'realization'
            ? { ...event, amountUsd: '120.000000', reliefRows: [event.reliefRows[0]!] }
            : event
      );
    expect(proceeds(stage(single).state)[0]!.lotId).toBe('proceeds:realization-1');

    const grouped = buildMultiSecurityRealizationV2Input();
    grouped.events = grouped.events.map((event) => {
      if (event.eventId === 'deployment-b' && event.kind === 'deployment') {
        return {
          ...event,
          securityId: 'security-a',
          amountUsd: '30.000000',
          cashSourceAllocations: [{ lotId: 'csl:contribution-1', amount: '30.000000' }],
        };
      }
      if (event.eventId === 'contribution-1') return { ...event, amountUsd: '150.000000' };
      if (event.kind === 'realization') {
        return {
          ...event,
          amountUsd: '150.000000',
          reliefRows: [
            event.reliefRows[0]!,
            {
              ...event.reliefRows[1]!,
              investmentLotId: 'inv:deal-1:security-a:deployment-b',
              relievedCostBasis: '15.000000',
              allocatedProceeds: '30.000000',
            },
          ],
        };
      }
      return event;
    });
    expect(proceeds(stage(grouped).state)).toEqual([
      {
        lotId: 'proceeds:realization-1',
        dealId: 'deal-1',
        securityId: 'security-a',
        originalAmount: '150.000000',
        remainingBalance: '150.000000',
      },
    ]);
  });

  it('refuses a zero-proceeds security group atomically', () => {
    const input = buildMultiSecurityRealizationV2Input();
    const realization = input.events.find((event) => event.kind === 'realization')! as V2Event & {
      kind: 'realization';
    };
    input.events = input.events.filter((event) => event.kind !== 'realization');
    const staged = stage(input);
    const before = canonical(staged.state);
    const refusal = processRealization(
      {
        ...realization,
        amountUsd: '120.000000',
        reliefRows: [
          realization.reliefRows[0]!,
          { ...realization.reliefRows[1]!, allocatedProceeds: '0.000000' },
        ],
      },
      staged.state
    );
    expect(refusal).toMatchObject({
      code: 'INVESTMENT_LOT_RELIEF_VIOLATION',
      stage: 'provenance',
      diagnostics: { eventId: 'realization-1', securityId: 'security-b' },
    });
    expect(canonical(staged.state)).toEqual(before);
  });

  it('prioritizes proceeds lot collisions over grouped-total mismatch atomically', () => {
    const input = buildMultiSecurityRealizationV2Input();
    const realization = input.events.find((event) => event.kind === 'realization')! as V2Event & {
      kind: 'realization';
    };
    input.events = input.events.filter((event) => event.kind !== 'realization');
    const staged = stage(input);
    staged.state.cashSourceLots.set('proceeds:realization-1:security-a', {
      origin: 'event',
      sourceKind: 'realization_proceeds',
      lotId: 'proceeds:realization-1:security-a',
      sourceEventId: 'existing-realization',
      dealId: 'deal-1',
      securityId: 'security-a',
      originalAmount: new Decimal('1.000000'),
      remainingBalance: new Decimal('1.000000'),
    });
    const before = canonical(staged.state);

    const refusal = processRealization({ ...realization, amountUsd: '199.000000' }, staged.state);

    expect(refusal).toMatchObject({
      code: 'CASH_SOURCE_ALLOCATION_VIOLATION',
      stage: 'provenance',
      diagnostics: { eventId: 'realization-1' },
    });
    expect(canonical(staged.state)).toEqual(before);
  });

  it('refuses a proceeds lot whose exact entitlement pool is absent without mutation', () => {
    const staged = stage(buildMultiSecurityRealizationV2Input());
    expect(staged.state.investmentLots.delete('inv:deal-1:security-b:deployment-b')).toBe(true);
    const before = canonical(staged.state);
    const result = runDealByDealWaterfall(staged.input, staged.state);
    expect(result).toMatchObject({
      ok: false,
      refusal: {
        code: 'INVESTMENT_LOT_RELIEF_VIOLATION',
        stage: 'waterfall',
        diagnostics: { dealId: 'deal-1', securityId: 'security-b' },
      },
    });
    expect(canonical(staged.state)).toEqual(before);
  });

  it('keeps delimiter-colliding deal/security pairs separate and order invariant', () => {
    const forward = stage(collidingPoolKeyInput());
    const reverse = stage(collidingPoolKeyInput(true));
    const forwardResult = runDealByDealWaterfall(forward.input, forward.state);
    const reverseResult = runDealByDealWaterfall(reverse.input, reverse.state);
    expect(pools(forwardResult)).toEqual({
      [JSON.stringify(['a:b', 'c'])]: {
        proceeds: '120.000000',
        basis: '100.000000',
        gainLoss: '20.000000',
      },
      [JSON.stringify(['a', 'b:c'])]: {
        proceeds: '80.000000',
        basis: '100.000000',
        gainLoss: '-20.000000',
      },
    });
    expect(pools(reverseResult)).toEqual(pools(forwardResult));
  });

  it.each([
    ['plain-first', plainAliasEvent, colonAliasEvent],
    ['colon-first', colonAliasEvent, plainAliasEvent],
  ])('refuses generated lot-ID alias atomically in %s chronology', (_label, first, second) => {
    const state = aliasSeedState();
    expect(processRealization(first, state)).toBeNull();
    const before = canonical(state);
    expect(processRealization(second, state)).toMatchObject({
      code: 'CASH_SOURCE_ALLOCATION_VIOLATION',
      stage: 'provenance',
      diagnostics: { eventId: second.eventId },
    });
    expect(canonical(state)).toEqual(before);
  });

  it('certifies partial recycling without crossing security lineage', () => {
    const input = partialRecyclingInput();
    const staged = stage(input);
    const lots = proceeds(staged.state);
    expect(lots.find((lot) => lot.securityId === 'security-a')!.remainingBalance).toBe('20.000000');
    expect(lots.find((lot) => lot.securityId === 'security-b')!.remainingBalance).toBe('80.000000');
    const live = certifyInternalEconomicsDualLaneV2(input);
    if (!live.ok) throw new Error(live.refusal.message);
    const lineage = new Map(
      live.certification.dealByDeal.lineage.cashLots.map((lot) => [
        lot.lotId,
        lot.consumingEventIds,
      ])
    );
    expect(lineage.get('proceeds:realization-1:security-a')).toContain('deployment-2');
    expect(lineage.get('proceeds:realization-1:security-b')).toEqual([]);
    expect(live.certification.dealByDeal.fundCashEquation).toEqual({
      openingCash: '550000.000000',
      contributions: '200.000000',
      deployments: '300.000000',
      realizations: '200.000000',
      fees: '0.000000',
      expenses: '0.000000',
      distributions: '100.000000',
      endingCash: '550000.000000',
    });
    expect(live.certification.wholeFund.fundCashEquation).toEqual(
      live.certification.dealByDeal.fundCashEquation
    );
    expect(live.certification.dealByDeal.tierAllocations).toEqual([
      {
        kind: 'return_of_capital',
        priority: 1,
        totalAllocated: '60.000000',
        gpShare: '5.452563',
        lpShare: '54.547437',
      },
      {
        kind: 'carry',
        priority: 2,
        totalAllocated: '40.000000',
        gpShare: '8.000000',
        lpShare: '32.000000',
      },
    ]);
    expect(live.certification.dealByDeal.partnerLedgers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          partnerId: 'gp-1',
          unreturnedSettledCashCapital: '49994.547437',
          cumulativeDistributions: '13.452563',
          returnOfCapital: '5.452563',
          carryPaid: '8.000000',
        }),
        expect.objectContaining({
          partnerId: 'lp-1',
          unreturnedSettledCashCapital: '500145.452563',
          cumulativeDistributions: '86.547437',
          returnOfCapital: '54.547437',
          carryPaid: '32.000000',
        }),
      ])
    );
    expect(live.certification.dealByDeal.classLedgers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lpClassId: 'class-a',
          cumulativeDistributions: '86.547437',
          returnOfCapital: '54.547437',
          carryPaid: '32.000000',
        }),
      ])
    );
    expect(live.certification.wholeFund.tierAllocations).toEqual([
      {
        kind: 'return_of_capital',
        priority: 1,
        totalAllocated: '100.000000',
        gpShare: '9.087605',
        lpShare: '90.912395',
      },
    ]);

    const reversed = certifyInternalEconomicsDualLaneV2(partialRecyclingInput(true));
    if (!reversed.ok) throw new Error(reversed.refusal.message);
    expect(reversed.certification.dealByDeal.tierAllocations).toEqual(
      live.certification.dealByDeal.tierAllocations
    );
    expect(partnerSummary(reversed.certification.dealByDeal)).toEqual(
      partnerSummary(live.certification.dealByDeal)
    );
    expect(reversed.certification.wholeFund.tierAllocations).toEqual(
      live.certification.wholeFund.tierAllocations
    );
    expect(partnerSummary(reversed.certification.wholeFund)).toEqual(
      partnerSummary(live.certification.wholeFund)
    );
  });
});
