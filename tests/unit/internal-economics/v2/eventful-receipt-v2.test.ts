import { describe, expect, it } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import { sha256CanonicalJson } from '../../../../shared/lib/canonical-json';
import type {
  InternalEconomicsInputV2Wire,
  NormalizedInternalEconomicsInputV2,
  V2Event,
} from '../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';
import {
  certifyInternalEconomicsDualLaneV2,
  processEventsV2ForTest,
} from '../../../../shared/lib/internal-economics/v2/derive-composite-v2';
import {
  initializeEventStreamState,
  processDeployment,
  processRealization,
  processSettledContribution,
  type EventStreamState,
} from '../../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
import {
  runDealByDealWaterfall,
  toTierAllocationsV2 as dealToTierAllocations,
} from '../../../../shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2';
import {
  buildReceipt,
  countReceiptRows,
} from '../../../../shared/lib/internal-economics/v2/liquidity-receipt-builder-v2';
import { V2_ADMISSION_LIMITS } from '../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';
import { runWholeFundWaterfall } from '../../../../shared/lib/internal-economics/v2/waterfall-whole-fund-v2';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../../shared/lib/internal-economics/v2/normalize-input-v2';
import { buildMinimalV2Input } from '../../../helpers/v2-input-builder';

type ReceiptLike = {
  receiptVersion: string;
  componentVersions: Record<string, string>;
  fundCashEquation: Record<string, string>;
  journal: ReadonlyArray<{
    source: 'event' | 'distribution';
    postings: ReadonlyArray<{ account: string; amountUsd: string }>;
    eventId?: string;
    chronologyOrdinal?: number;
    lane?: string;
    tierKind?: string;
    tierOrdinal?: number;
    partnerId?: string;
    instant?: string;
  }>;
  partnerLedgers: ReadonlyArray<{
    partnerId: string;
    calledCapital: string;
    cumulativeDistributions: string;
    cumulativeExpenses: string;
    cashFlowVector: ReadonlyArray<Record<string, string>>;
  }>;
  classLedgers: ReadonlyArray<{
    lpClassId: string;
    cumulativeExpenses: string;
  }>;
  lineage: {
    cashLots: ReadonlyArray<{
      lotId: string;
      consumingEventIds: readonly string[];
    }>;
    investmentSlices: ReadonlyArray<{
      investmentLotId: string;
      fundingAllocations: ReadonlyArray<{ lotId: string; amount: string }>;
    }>;
  };
};

function normalized(input: InternalEconomicsInputV2Wire): NormalizedInternalEconomicsInputV2 {
  const result = verifyAndNormalizeInternalEconomicsInputV2(input);
  if (!result.ok) throw new Error(`${result.refusal.code}/${result.refusal.stage}`);
  return result.input;
}

function eventfulInput(
  selectedLane: 'deal_by_deal' | 'whole_fund' = 'deal_by_deal',
  events: readonly V2Event[] = lifecycleEvents()
): InternalEconomicsInputV2Wire {
  const input = buildMinimalV2Input({
    selectedLane,
    events: [...events],
    waterfallPolicy: [
      { kind: 'return_of_capital', priority: 1 },
      { kind: 'carry', priority: 2, gpShare: '0.200000000000' },
    ],
  });
  input.lpClasses[0]!.feeProfile.managementFeeSchedule = [];
  return input;
}

function lifecycleEvents(): V2Event[] {
  return [
    {
      eventId: 'contribution-1',
      instant: '2025-02-01T00:00:00Z',
      amountUsd: '100.000000',
      kind: 'settled_contribution',
      partnerId: 'lp-1',
      purpose: 'deployment',
      settlementSourceRef: 'settlement:1',
    },
    {
      eventId: 'deployment-1',
      instant: '2025-03-01T00:00:00Z',
      amountUsd: '100.000000',
      kind: 'deployment',
      dealId: 'deal-1',
      securityId: 'security-1',
      cashSourceAllocations: [{ lotId: 'csl:contribution-1', amount: '100.000000' }],
    },
    {
      eventId: 'realization-1',
      instant: '2025-04-01T00:00:00Z',
      amountUsd: '150.000000',
      kind: 'realization',
      dealId: 'deal-1',
      reliefRows: [
        {
          investmentLotId: 'inv:deal-1:security-1:deployment-1',
          relievedCostBasis: '100.000000',
          allocatedProceeds: '150.000000',
        },
      ],
      recyclingTag: 'none',
    },
  ];
}

function runEvents(input: NormalizedInternalEconomicsInputV2): EventStreamState {
  const initial = initializeEventStreamState(input);
  const result = processEventsV2ForTest(input, initial);
  if (!result.ok) throw new Error(`${result.refusal.code}/${result.refusal.stage}`);
  return result.state;
}

function eventEntries(receipt: ReceiptLike) {
  return receipt.journal.filter((entry) => entry.source === 'event');
}

function sumPostings(postings: readonly { amountUsd: string }[]): Decimal {
  return postings.reduce(
    (sum, posting) => sum.plus(new Decimal(posting.amountUsd)),
    new Decimal(0)
  );
}

describe('F3b eventful receipt contract', () => {
  it('certifies both lanes and binds lane-correct 2.3.0 receipts', () => {
    const result = certifyInternalEconomicsDualLaneV2(eventfulInput('whole_fund'));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const deal = result.certification.dealByDeal as unknown as ReceiptLike;
    const whole = result.certification.wholeFund as unknown as ReceiptLike;
    expect(deal.receiptVersion).toBe('internal-economics-receipt/2.3.0');
    expect(whole.receiptVersion).toBe('internal-economics-receipt/2.3.0');
    expect(deal.componentVersions.selectedWaterfall).toBe(
      'internal-economics-waterfall-deal-by-deal/2.2.0'
    );
    expect(whole.componentVersions.selectedWaterfall).toBe(
      'internal-economics-waterfall-whole-fund/2.2.0'
    );
    expect(deal.componentVersions.composite).toBe('internal-economics-composite/2.3.0');
    expect(whole.componentVersions.eventEngine).toBe('internal-economics-event-engine/2.3.0');
  });

  it.each([
    [
      {
        eventId: 'unsupported-correction',
        instant: '2025-02-01T00:00:00Z',
        amountUsd: '100.000000',
        kind: 'contribution_correction',
        correctsEventId: 'missing-event',
      },
      'UNSUPPORTED_V2_CONTRIBUTION_CORRECTION',
    ],
    [
      {
        eventId: 'unsupported-write-off',
        instant: '2025-02-01T00:00:00Z',
        amountUsd: '100.000000',
        kind: 'write_off',
        dealId: 'deal-1',
        reliefRows: [
          {
            investmentLotId: 'missing-lot',
            relievedCostBasis: '100.000000',
            allocatedProceeds: '0.000000',
          },
        ],
      },
      'UNSUPPORTED_V2_WRITE_OFF',
    ],
    [
      {
        eventId: 'unsupported-conversion',
        instant: '2025-02-01T00:00:00Z',
        amountUsd: '100.000000',
        kind: 'conversion',
        dealId: 'deal-1',
        reliefRows: [
          {
            investmentLotId: 'missing-lot',
            relievedCostBasis: '100.000000',
            allocatedProceeds: '0.000000',
          },
        ],
        successorLot: { investmentLotId: 'successor-lot', costBasis: '100.000000' },
      },
      'UNSUPPORTED_V2_CONVERSION',
    ],
  ] as const)('refuses unsupported capability %s before either lane runs', (event, code) => {
    const result = certifyInternalEconomicsDualLaneV2(
      eventfulInput('deal_by_deal', [event as V2Event])
    );

    expect(result).toMatchObject({
      ok: false,
      refusal: { code, stage: 'admission' },
    });
    expect('certification' in result).toBe(false);
  });

  it('posts every event with seven-account zero-sum journal entries', () => {
    const result = certifyInternalEconomicsDualLaneV2(eventfulInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const receipt = result.certification.dealByDeal as unknown as ReceiptLike;
    expect(eventEntries(receipt)).toHaveLength(3);
    expect(
      new Set(eventEntries(receipt).flatMap((entry) => entry.postings.map((p) => p.account)))
    ).toEqual(new Set(['cash', 'contributed_capital', 'invested_basis', 'realized_gain_loss']));
    for (const entry of receipt.journal) {
      expect(sumPostings(entry.postings).isZero()).toBe(true);
    }

    const contribution = eventEntries(receipt).find((entry) => entry.eventId === 'contribution-1');
    expect(contribution?.postings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ account: 'cash', amountUsd: '100.000000' }),
        expect.objectContaining({ account: 'contributed_capital', amountUsd: '-100.000000' }),
      ])
    );
    const realization = eventEntries(receipt).find((entry) => entry.eventId === 'realization-1');
    expect(realization?.postings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ account: 'cash', amountUsd: '150.000000' }),
        expect.objectContaining({ account: 'invested_basis', amountUsd: '-100.000000' }),
        expect.objectContaining({ account: 'realized_gain_loss', amountUsd: '-50.000000' }),
      ])
    );
  });

  it('posts a loss with positive realized gain-loss amount', () => {
    const events = lifecycleEvents().map((event) =>
      event.kind === 'realization'
        ? {
            ...event,
            amountUsd: '50.000000',
            reliefRows: event.reliefRows.map((row) => ({
              ...row,
              allocatedProceeds: '50.000000',
            })),
          }
        : event
    );
    const result = certifyInternalEconomicsDualLaneV2(eventfulInput('deal_by_deal', events));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const realization = eventEntries(
      result.certification.dealByDeal as unknown as ReceiptLike
    ).find((entry) => entry.eventId === 'realization-1');
    expect(realization?.postings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ account: 'realized_gain_loss', amountUsd: '50.000000' }),
      ])
    );
  });

  it('retains lineage and derives called capital from staged trackers', () => {
    const input = normalized(eventfulInput());
    const state = runEvents(input);
    const result = certifyInternalEconomicsDualLaneV2(eventfulInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const receipt = result.certification.dealByDeal as unknown as ReceiptLike;
    expect(
      receipt.partnerLedgers.find((ledger) => ledger.partnerId === 'lp-1')?.calledCapital
    ).toBe('500100.000000');
    expect(receipt.lineage.investmentSlices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          investmentLotId: 'inv:deal-1:security-1:deployment-1',
          fundingAllocations: [{ lotId: 'csl:contribution-1', amount: '100.000000' }],
        }),
      ])
    );
    expect(receipt.lineage.cashLots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lotId: 'csl:contribution-1',
          consumingEventIds: ['deployment-1'],
        }),
      ])
    );
    expect(state.consumptionRecords.map((record) => record.eventId)).toEqual(['deployment-1']);
  });

  it('keeps contribution-purpose cash inflows distinct from fund-expense payments', () => {
    const events: V2Event[] = [
      {
        eventId: 'expense-contribution',
        instant: '2025-02-01T00:00:00Z',
        amountUsd: '25.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'fund_expense',
        settlementSourceRef: 'settlement:expense',
      },
      {
        eventId: 'expense-payment',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '10.000000',
        kind: 'fund_expense_payment',
        expenseCategory: 'legal',
        cashSourceAllocations: [{ lotId: 'csl:expense-contribution', amount: '10.000000' }],
      },
    ];
    const result = certifyInternalEconomicsDualLaneV2(eventfulInput('deal_by_deal', events));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const receipt = result.certification.dealByDeal as unknown as ReceiptLike;
    expect(receipt.fundCashEquation).toMatchObject({
      contributions: '25.000000',
      expenses: '10.000000',
      endingCash: '550015.000000',
    });
    expect(
      eventEntries(receipt).find((entry) => entry.eventId === 'expense-contribution')?.postings
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ account: 'cash', amountUsd: '25.000000' }),
        expect.objectContaining({ account: 'contributed_capital', amountUsd: '-25.000000' }),
      ])
    );
    expect(
      eventEntries(receipt).find((entry) => entry.eventId === 'expense-payment')?.postings
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ account: 'cash', amountUsd: '-10.000000' }),
        expect.objectContaining({ account: 'fund_expenses', amountUsd: '10.000000' }),
      ])
    );
  });

  it('attributes fund expenses to owning partner and class ledgers', () => {
    const events: V2Event[] = [
      {
        eventId: 'expense-contribution',
        instant: '2025-02-01T00:00:00Z',
        amountUsd: '10.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'fund_expense',
        settlementSourceRef: 'settlement:expense',
      },
      {
        eventId: 'expense-payment',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '10.000000',
        kind: 'fund_expense_payment',
        expenseCategory: 'legal',
        cashSourceAllocations: [{ lotId: 'csl:expense-contribution', amount: '10.000000' }],
      },
    ];

    const result = certifyInternalEconomicsDualLaneV2(eventfulInput('deal_by_deal', events));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const receipt = result.certification.dealByDeal as unknown as ReceiptLike;
    expect(receipt.fundCashEquation.expenses).toBe('10.000000');
    expect(
      receipt.partnerLedgers.find((ledger) => ledger.partnerId === 'lp-1')?.cumulativeExpenses
    ).toBe('10.000000');
    expect(
      receipt.partnerLedgers.find((ledger) => ledger.partnerId === 'gp-1')?.cumulativeExpenses
    ).toBe('0.000000');
    expect(
      receipt.classLedgers.find((ledger) => ledger.lpClassId === 'class-a')?.cumulativeExpenses
    ).toBe('10.000000');
  });

  it('attributes exact expense allocations across multiple partners', () => {
    const events: V2Event[] = [
      {
        eventId: 'expense-contribution-lp',
        instant: '2025-02-01T00:00:00Z',
        amountUsd: '4.250000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'fund_expense',
        settlementSourceRef: 'settlement:expense-lp',
      },
      {
        eventId: 'expense-contribution-gp',
        instant: '2025-02-02T00:00:00Z',
        amountUsd: '5.750000',
        kind: 'settled_contribution',
        partnerId: 'gp-1',
        purpose: 'fund_expense',
        settlementSourceRef: 'settlement:expense-gp',
      },
      {
        eventId: 'expense-payment-multi',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '10.000000',
        kind: 'fund_expense_payment',
        expenseCategory: 'legal',
        cashSourceAllocations: [
          { lotId: 'csl:expense-contribution-lp', amount: '4.250000' },
          { lotId: 'csl:expense-contribution-gp', amount: '5.750000' },
        ],
      },
    ];

    const result = certifyInternalEconomicsDualLaneV2(eventfulInput('deal_by_deal', events));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const receipt = result.certification.dealByDeal as unknown as ReceiptLike;
    expect(
      receipt.partnerLedgers.find((ledger) => ledger.partnerId === 'lp-1')?.cumulativeExpenses
    ).toBe('4.250000');
    expect(
      receipt.partnerLedgers.find((ledger) => ledger.partnerId === 'gp-1')?.cumulativeExpenses
    ).toBe('5.750000');
  });

  it('refuses fund expenses funded by opening cash lots', () => {
    const eventId = 'opening-expense-payment';
    const result = certifyInternalEconomicsDualLaneV2(
      eventfulInput('deal_by_deal', [
        {
          eventId,
          instant: '2025-02-01T00:00:00Z',
          amountUsd: '10.000000',
          kind: 'fund_expense_payment',
          expenseCategory: 'legal',
          cashSourceAllocations: [{ lotId: 'opening-cash:lp-1', amount: '10.000000' }],
        },
      ])
    );

    expect(result).toMatchObject({
      ok: false,
      refusal: {
        code: 'SCHEMA_VALIDATION_FAILED',
        stage: 'provenance',
        diagnostics: { eventId },
      },
    });
  });

  it('refuses fund expenses funded by realization proceeds lots', () => {
    const eventId = 'proceeds-expense-payment';
    const result = certifyInternalEconomicsDualLaneV2(
      eventfulInput('deal_by_deal', [
        ...lifecycleEvents(),
        {
          eventId,
          instant: '2025-05-01T00:00:00Z',
          amountUsd: '10.000000',
          kind: 'fund_expense_payment',
          expenseCategory: 'legal',
          cashSourceAllocations: [{ lotId: 'proceeds:realization-1', amount: '10.000000' }],
        },
      ])
    );

    expect(result).toMatchObject({
      ok: false,
      refusal: {
        code: 'SCHEMA_VALIDATION_FAILED',
        stage: 'provenance',
        diagnostics: { eventId },
      },
    });
  });

  it('discloses source-discriminated event and distribution cash flows in order', () => {
    const result = certifyInternalEconomicsDualLaneV2(eventfulInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const receipt = result.certification.wholeFund as unknown as ReceiptLike;
    const flows = receipt.partnerLedgers.flatMap((ledger) => ledger.cashFlowVector);
    expect(
      flows.some((entry) => entry.source === 'event' && entry.eventId === 'contribution-1')
    ).toBe(true);
    expect(
      flows.some((entry) => entry.source === 'distribution' && entry.lane === 'whole_fund')
    ).toBe(true);
    // Ordering is guaranteed within each partner's vector: every distribution
    // entry follows every event entry.
    for (const ledger of receipt.partnerLedgers) {
      const lastEventIndex = ledger.cashFlowVector.reduce(
        (last, entry, index) => (entry.source === 'event' ? index : last),
        -1
      );
      const firstDistributionIndex = ledger.cashFlowVector.findIndex(
        (entry) => entry.source === 'distribution'
      );
      if (lastEventIndex !== -1 && firstDistributionIndex !== -1) {
        expect(firstDistributionIndex).toBeGreaterThan(lastEventIndex);
      }
    }
    expect(
      flows
        .filter((entry) => entry.source === 'distribution')
        .every((entry) => entry.instant === '2025-04-01T00:00:00Z')
    ).toBe(true);
  });

  it('retains one distribution cash-flow row per deal-by-deal pool allocation', () => {
    const events: V2Event[] = [
      ...lifecycleEvents(),
      {
        eventId: 'contribution-2',
        instant: '2025-02-02T00:00:00Z',
        amountUsd: '100.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'deployment',
        settlementSourceRef: 'settlement:2',
      },
      {
        eventId: 'deployment-2',
        instant: '2025-03-02T00:00:00Z',
        amountUsd: '100.000000',
        kind: 'deployment',
        dealId: 'deal-2',
        securityId: 'security-2',
        cashSourceAllocations: [{ lotId: 'csl:contribution-2', amount: '100.000000' }],
      },
      {
        eventId: 'realization-2',
        instant: '2025-04-02T00:00:00Z',
        amountUsd: '150.000000',
        kind: 'realization',
        dealId: 'deal-2',
        reliefRows: [
          {
            investmentLotId: 'inv:deal-2:security-2:deployment-2',
            relievedCostBasis: '100.000000',
            allocatedProceeds: '150.000000',
          },
        ],
        recyclingTag: 'none',
      },
    ];
    const result = certifyInternalEconomicsDualLaneV2(eventfulInput('deal_by_deal', events));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const receipt = result.certification.dealByDeal as unknown as ReceiptLike;
    const distributions = receipt.journal.filter((entry) => entry.source === 'distribution');
    expect(distributions).toHaveLength(8);
    expect(
      distributions
        .reduce(
          (total, entry) =>
            total.plus(
              new Decimal(
                entry.postings.find((posting) => posting.account === 'distributions')!.amountUsd
              )
            ),
          new Decimal(0)
        )
        .toFixed(6)
    ).toBe('300.000000');
    expect(
      receipt.partnerLedgers.flatMap((ledger) =>
        ledger.cashFlowVector.filter((entry) => entry.source === 'distribution')
      )
    ).toHaveLength(8);
  });

  it('counts nested lineage rows against the output-row limit at the exact boundary', () => {
    const base = certifyInternalEconomicsDualLaneV2(eventfulInput());
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const receipt = base.certification.dealByDeal;

    const nestedConsumingEventIds = receipt.lineage.cashLots.reduce(
      (count, lot) => count + lot.consumingEventIds.length,
      0
    );
    const nestedFundingAllocations = receipt.lineage.investmentSlices.reduce(
      (count, slice) => count + slice.fundingAllocations.length,
      0
    );
    // The boundary below is only meaningful if nested lineage rows exist.
    expect(nestedConsumingEventIds).toBeGreaterThan(0);
    expect(nestedFundingAllocations).toBeGreaterThan(0);

    const baseRows = countReceiptRows({
      componentVersionCount: Object.keys(receipt.componentVersions).length,
      openingCashLotCount: receipt.openingPositions.cashLots.length,
      openingInvestmentSliceCount: receipt.openingPositions.investmentSlices.length,
      openingEntitlementPoolCount: receipt.openingPositions.entitlementPools.length,
      journalEntryCount: receipt.journal.length,
      journalPostingCount: receipt.journal.reduce(
        (count, entry) => count + entry.postings.length,
        0
      ),
      tierAllocationCount: receipt.tierAllocations.length,
      partnerLedgerCount: receipt.partnerLedgers.length,
      classLedgerCount: receipt.classLedgers.length,
      partnerCashFlowEntryCount: receipt.partnerLedgers.reduce(
        (count, ledger) => count + ledger.cashFlowVector.length,
        0
      ),
      classCashFlowEntryCount: receipt.classLedgers.reduce(
        (count, ledger) => count + ledger.cashFlowVector.length,
        0
      ),
      sourceRefCount: 0,
      upstreamReceiptIdCount: receipt.upstreamReceiptIds.length,
      cashLotLineageCount: receipt.lineage.cashLots.length + nestedConsumingEventIds,
      investmentSliceLineageCount:
        receipt.lineage.investmentSlices.length + nestedFundingAllocations,
    });
    const paddingCount = V2_ADMISSION_LIMITS.MAX_OUTPUT_ROWS - baseRows;
    const refs = Array.from({ length: paddingCount }, (_, index) => `ref:${index}`);

    const exact = certifyInternalEconomicsDualLaneV2({ ...eventfulInput(), sourceRefs: refs });
    expect(exact.ok).toBe(true);

    const over = certifyInternalEconomicsDualLaneV2({
      ...eventfulInput(),
      sourceRefs: [...refs, 'ref:over'],
    });
    expect(over).toMatchObject({
      ok: false,
      refusal: { code: 'ADMISSION_LIMIT_EXCEEDED', stage: 'receipt' },
    });
  });

  it('refuses a contribution from a partner not declared in partners', () => {
    const events: V2Event[] = [
      {
        eventId: 'ghost-contribution',
        instant: '2025-02-01T00:00:00Z',
        amountUsd: '100.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-ghost',
        purpose: 'deployment',
        settlementSourceRef: 'settlement:ghost',
      },
    ];
    const result = certifyInternalEconomicsDualLaneV2(eventfulInput('deal_by_deal', events));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
    expect(result.refusal.stage).toBe('settlement');
    expect(result.refusal.diagnostics?.partnerId).toBe('lp-ghost');

    const input = normalized(eventfulInput('deal_by_deal', events));
    const state = initializeEventStreamState(input);
    const direct = processSettledContribution(
      events[0] as Extract<V2Event, { kind: 'settled_contribution' }>,
      state
    );
    expect(direct?.code).toBe('SCHEMA_VALIDATION_FAILED');
    expect(state.cashSourceLots.has('csl:ghost-contribution')).toBe(false);
  });

  it('refuses a realization whose relief row belongs to a different deal', () => {
    const events: V2Event[] = [
      ...lifecycleEvents().slice(0, 2),
      {
        eventId: 'cross-deal-realization',
        instant: '2025-04-01T00:00:00Z',
        amountUsd: '150.000000',
        kind: 'realization',
        dealId: 'deal-2',
        reliefRows: [
          {
            investmentLotId: 'inv:deal-1:security-1:deployment-1',
            relievedCostBasis: '100.000000',
            allocatedProceeds: '150.000000',
          },
        ],
        recyclingTag: 'none',
      },
    ];
    const result = certifyInternalEconomicsDualLaneV2(eventfulInput('deal_by_deal', events));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('INVESTMENT_LOT_RELIEF_VIOLATION');
    expect(result.refusal.stage).toBe('provenance');
    expect(result.refusal.message).toContain("belongs to deal 'deal-1', not event deal 'deal-2'");
  });

  it('fails closed when ROC distribution would overdraw staged unreturned capital', () => {
    const input = normalized(eventfulInput());
    const state = runEvents(input);
    state.partnerLedgers.get('lp-1')!.unreturnedSettledCashCapital = new Decimal('1.000000');

    const waterfall = runDealByDealWaterfall(input, state);
    expect(waterfall.ok).toBe(true);
    if (!waterfall.ok) return;

    const tierPartnerAllocations = waterfall.tierAllocations.flatMap((tier) =>
      Array.from(tier.perPartner.entries())
        .filter(([, amount]) => amount.gt(0))
        .map(([partnerId, amount]) => ({
          lane: 'deal_by_deal' as const,
          tierKind: tier.kind,
          tierOrdinal: tier.priority,
          partnerId,
          amountUsd: amount.toFixed(6),
        }))
    );
    const result = buildReceipt(
      input,
      state,
      'deal_by_deal',
      dealToTierAllocations(waterfall.tierAllocations),
      tierPartnerAllocations,
      waterfall.totalDistributed,
      waterfall.partnerDistributions
    );

    expect(result).toMatchObject({
      ok: false,
      refusal: { code: 'RECEIPT_CONSERVATION_VIOLATION', stage: 'receipt' },
    });
  });
});

describe('F3b origin-based proceeds selection', () => {
  function stateWithPartialProceeds(lane: 'deal_by_deal' | 'whole_fund') {
    const input = normalized(eventfulInput(lane, lifecycleEvents().slice(0, 2)));
    const state = initializeEventStreamState(input);
    const contribution = processSettledContribution(
      lifecycleEvents()[0] as Extract<V2Event, { kind: 'settled_contribution' }>,
      state
    );
    expect(contribution).toBeNull();
    const deployment = processDeployment(
      lifecycleEvents()[1] as Extract<V2Event, { kind: 'deployment' }>,
      state
    );
    expect(deployment).toBeNull();
    const realizationEvent = lifecycleEvents()[2] as Extract<V2Event, { kind: 'realization' }>;
    const realization = processRealization(
      {
        ...realizationEvent,
        amountUsd: '100.000000',
        reliefRows: realizationEvent.reliefRows.map((row) => ({
          ...row,
          allocatedProceeds: '100.000000',
        })),
      },
      state
    );
    expect(realization).toBeNull();
    const proceedsDeployment = processDeployment(
      {
        eventId: 'recycle-1',
        instant: '2025-05-01T00:00:00Z',
        amountUsd: '40.000000',
        kind: 'deployment',
        dealId: 'deal-2',
        securityId: 'security-2',
        cashSourceAllocations: [{ lotId: 'proceeds:realization-1', amount: '40.000000' }],
      },
      state
    );
    expect(proceedsDeployment).toBeNull();
    return { input, state };
  }

  it.each(['deal_by_deal', 'whole_fund'] as const)(
    'uses remaining proceeds balance for %s waterfall',
    (lane) => {
      const { input, state } = stateWithPartialProceeds(lane);
      const result =
        lane === 'deal_by_deal'
          ? runDealByDealWaterfall(input, state)
          : runWholeFundWaterfall(input, state);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.totalDistributed.toFixed(6)).toBe('60.000000');
    }
  );

  it.each(['deal_by_deal', 'whole_fund'] as const)(
    'does not select a proceeds-shaped opening lot for %s',
    (lane) => {
      const inputWire = eventfulInput(lane, []);
      inputWire.openingState.openingCash = '550000.000000';
      inputWire.openingState.openingCashClassification = {
        paidIn: '550000.000000',
        recycling: '0.000000',
        unclassified: '0.000000',
      };
      inputWire.openingState.openingProvenance.cashLots[0]!.lotId = 'proceeds:opening-shaped';
      const input = normalized(inputWire);
      const state = initializeEventStreamState(input);
      const result =
        lane === 'deal_by_deal'
          ? runDealByDealWaterfall(input, state)
          : runWholeFundWaterfall(input, state);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.totalDistributed.toFixed(6)).toBe('0.000000');
    }
  );

  it.each(['deal_by_deal', 'whole_fund'] as const)(
    'does not select an event-origin contribution lot for %s',
    (lane) => {
      const input = normalized(eventfulInput(lane, []));
      const state = initializeEventStreamState(input);
      expect(
        processSettledContribution(
          {
            eventId: 'contribution-only',
            instant: '2025-02-01T00:00:00Z',
            amountUsd: '100.000000',
            kind: 'settled_contribution',
            partnerId: 'lp-1',
            purpose: 'deployment',
            settlementSourceRef: 'settlement:contribution-only',
          },
          state
        )
      ).toBeNull();

      const result =
        lane === 'deal_by_deal'
          ? runDealByDealWaterfall(input, state)
          : runWholeFundWaterfall(input, state);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.totalDistributed.toFixed(6)).toBe('0.000000');
    }
  );

  it('round-trips source-discriminated cash flows and preserves receipt preimage hash', () => {
    const result = certifyInternalEconomicsDualLaneV2(eventfulInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const receipt = result.certification.dealByDeal;
    const roundTripped = JSON.parse(JSON.stringify(receipt)) as typeof receipt;
    expect(roundTripped.partnerLedgers).toEqual(receipt.partnerLedgers);
    expect(
      roundTripped.partnerLedgers
        .flatMap((ledger) => ledger.cashFlowVector)
        .some((entry) => entry.source === 'distribution' && !('eventId' in entry))
    ).toBe(true);
    const { resultHash, ...preimage } = roundTripped;
    expect(sha256CanonicalJson(preimage)).toBe(resultHash);
  });
});
