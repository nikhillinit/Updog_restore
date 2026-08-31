/**
 * F_2.0.7 conformance-closure matrix tests (DECISIONS.md ADR-090 A1
 * amendment):
 *
 * - A3: positive caller-event magnitudes for all nine V2Event kinds
 *   (zero/negative refuse SCHEMA_VALIDATION_FAILED at normalization; positive
 *   passes the amount boundary; reserved equalization kinds then refuse
 *   UNSUPPORTED_V2_EQUALIZATION at equalization).
 * - A4: conditional description for `other` fund expenses (validation only,
 *   never transformation).
 * - Byte identity: the A3/A4 tightening leaves already-conformant parsed
 *   bytes and normalizedInputHash unchanged.
 * - A5: `expenseTotalsByCategory` receipt field (five keys, six-decimal
 *   zero-filled values, three-way conservation, canonical hash coverage).
 */
import { describe, expect, it } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import type {
  InternalEconomicsInputV2Wire,
  V2Event,
} from '../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../../shared/lib/internal-economics/v2/normalize-input-v2';
import {
  certifyInternalEconomicsDualLaneV2,
  deriveInternalEconomicsV2,
} from '../../../../shared/lib/internal-economics/v2/derive-composite-v2';
import { buildMinimalV2Input } from '../../../helpers/v2-input-builder';
import { CANONICAL_RECEIPT_CHANGED_CASE_MANIFEST_V1 } from './support/canonical-receipt-changed-case-manifest-v1';
import { oracleHash } from './support/canonical-receipt-oracle-v1';

const INSTANT = '2025-02-01T00:00:00Z';

type EventBuilder = (amountUsd: string) => V2Event;

const ADMITTED_EVENT_BUILDERS: ReadonlyArray<readonly [string, EventBuilder]> = [
  [
    'settled_contribution',
    (amountUsd) => ({
      eventId: 'a3-settled-contribution',
      instant: INSTANT,
      amountUsd,
      kind: 'settled_contribution',
      partnerId: 'lp-1',
      purpose: 'deployment',
      settlementSourceRef: 'settlement:a3',
    }),
  ],
  [
    'contribution_correction',
    (amountUsd) => ({
      eventId: 'a3-contribution-correction',
      instant: INSTANT,
      amountUsd,
      kind: 'contribution_correction',
      correctsEventId: 'a3-settled-contribution',
    }),
  ],
  [
    'fund_expense_payment',
    (amountUsd) => ({
      eventId: 'a3-fund-expense',
      instant: INSTANT,
      amountUsd,
      kind: 'fund_expense_payment',
      expenseCategory: 'legal',
      cashSourceAllocations: [{ lotId: 'csl:a3-settled-contribution', amount: amountUsd }],
    }),
  ],
  [
    'realization',
    (amountUsd) => ({
      eventId: 'a3-realization',
      instant: INSTANT,
      amountUsd,
      kind: 'realization',
      dealId: 'd-1',
      reliefRows: [
        {
          investmentLotId: 'inv:d-1:s-1:a3-deployment',
          relievedCostBasis: '1.000000',
          allocatedProceeds: amountUsd,
        },
      ],
      recyclingTag: 'none',
    }),
  ],
  [
    'write_off',
    (amountUsd) => ({
      eventId: 'a3-write-off',
      instant: INSTANT,
      amountUsd,
      kind: 'write_off',
      dealId: 'd-1',
      reliefRows: [
        {
          investmentLotId: 'inv:d-1:s-1:a3-deployment',
          relievedCostBasis: '1.000000',
          allocatedProceeds: '0.000000',
        },
      ],
    }),
  ],
  [
    'conversion',
    (amountUsd) => ({
      eventId: 'a3-conversion',
      instant: INSTANT,
      amountUsd,
      kind: 'conversion',
      dealId: 'd-1',
      reliefRows: [
        {
          investmentLotId: 'inv:d-1:s-1:a3-deployment',
          relievedCostBasis: '1.000000',
          allocatedProceeds: '0.000000',
        },
      ],
      successorLot: { investmentLotId: 'inv:successor', costBasis: '1.000000' },
    }),
  ],
  [
    'deployment',
    (amountUsd) => ({
      eventId: 'a3-deployment',
      instant: INSTANT,
      amountUsd,
      kind: 'deployment',
      dealId: 'd-1',
      securityId: 's-1',
      cashSourceAllocations: [{ lotId: 'csl:a3-settled-contribution', amount: amountUsd }],
    }),
  ],
];

const RESERVED_EVENT_BUILDERS: ReadonlyArray<readonly [string, EventBuilder]> = [
  [
    'equalization_principal',
    (amountUsd) => ({
      eventId: 'a3-equalization-principal',
      instant: INSTANT,
      amountUsd,
      kind: 'equalization_principal',
    }),
  ],
  [
    'equalization_interest',
    (amountUsd) => ({
      eventId: 'a3-equalization-interest',
      instant: INSTANT,
      amountUsd,
      kind: 'equalization_interest',
    }),
  ],
];

const ALL_EVENT_BUILDERS = [...ADMITTED_EVENT_BUILDERS, ...RESERVED_EVENT_BUILDERS];

function normalizeEvents(events: V2Event[]) {
  return verifyAndNormalizeInternalEconomicsInputV2(buildMinimalV2Input({ events }));
}

describe('F_2.0.7 A3 positive caller-event magnitudes', () => {
  it.each(ALL_EVENT_BUILDERS)('refuses a zero amount for %s at normalization', (_kind, build) => {
    const result = normalizeEvents([build('0.000000')]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
    expect(result.refusal.stage).toBe('normalization');
  });

  it.each(ALL_EVENT_BUILDERS)(
    'refuses a negative amount for %s at normalization',
    (_kind, build) => {
      const result = normalizeEvents([build('-25.000000')]);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
      expect(result.refusal.stage).toBe('normalization');
    }
  );

  it.each(ADMITTED_EVENT_BUILDERS)(
    'passes the amount boundary for a positive %s amount',
    (_kind, build) => {
      const result = normalizeEvents([build('25.000000')]);

      // The positive six-decimal amount clears the schema boundary; existing
      // downstream validation (admission, provenance, balances) still applies.
      expect(result.ok).toBe(true);
    }
  );

  it.each(RESERVED_EVENT_BUILDERS)(
    'passes the amount boundary for positive %s, then refuses the reserved kind',
    (_kind, build) => {
      const result = normalizeEvents([build('25.000000')]);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.refusal.code).toBe('UNSUPPORTED_V2_EQUALIZATION');
      expect(result.refusal.stage).toBe('equalization');
    }
  );
});

function expenseEvent(
  expenseCategory: 'legal' | 'audit' | 'admin' | 'custody' | 'other',
  description?: string
): V2Event {
  return {
    eventId: 'a4-expense',
    instant: INSTANT,
    amountUsd: '10.000000',
    kind: 'fund_expense_payment',
    expenseCategory,
    ...(description === undefined ? {} : { description }),
    cashSourceAllocations: [{ lotId: 'csl:a4-funding', amount: '10.000000' }],
  };
}

describe('F_2.0.7 A4 conditional other-category description', () => {
  it.each([
    ['A4-01 missing', undefined],
    ['A4-02 empty string', ''],
    ['A4-03 whitespace-only string', '   '],
  ] as const)('refuses an other-category expense with %s description', (_id, description) => {
    const result = normalizeEvents([expenseEvent('other', description)]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
    expect(result.refusal.stage).toBe('normalization');
  });

  it('A4-04 accepts an other-category expense with a non-empty description', () => {
    const result = normalizeEvents([expenseEvent('other', 'External legal advisory')]);

    expect(result.ok).toBe(true);
  });

  it.each([
    ['legal', undefined],
    ['legal', ''],
    ['legal', '   '],
    ['audit', undefined],
    ['audit', ''],
    ['audit', '   '],
    ['admin', undefined],
    ['admin', ''],
    ['admin', '   '],
    ['custody', undefined],
    ['custody', ''],
    ['custody', '   '],
  ] as const)(
    'A4-05/06/07 accepts %s expense with description %j (optional metadata)',
    (category, description) => {
      const result = normalizeEvents([expenseEvent(category, description)]);

      expect(result.ok).toBe(true);
    }
  );
});

function buildV2S0101Input(): InternalEconomicsInputV2Wire {
  const input = buildMinimalV2Input({
    selectedLane: 'deal_by_deal',
    events: [],
    waterfallPolicy: [{ kind: 'carry', priority: 1, gpShare: '0.200000000000' }],
    gpCashPreferredReturnTreatment: 'pari_passu',
  });
  for (const lpClass of input.lpClasses) {
    lpClass.feeProfile.managementFeeSchedule = [];
    lpClass.feeProfile.feeRecyclingEnabled = false;
    delete lpClass.feeProfile.feeRecyclingCapUsd;
    lpClass.feeProfile.exitRecyclingEnabled = false;
    delete lpClass.feeProfile.exitRecyclingCapUsd;
  }
  delete input.sourceRefs;
  delete input.upstreamReceiptIds;
  return input;
}

describe('F_2.0.7 A3/A4 tightening is validation-only (byte identity)', () => {
  it('keeps conformant parsed event bytes verbatim (no trim transform)', () => {
    const paddedDescription = '  padded but conformant description  ';
    const result = normalizeEvents([expenseEvent('other', paddedDescription)]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const event = result.input.events.find((candidate) => candidate.eventId === 'a4-expense');
    expect(event?.kind).toBe('fund_expense_payment');
    if (event?.kind !== 'fund_expense_payment') return;
    expect(event.description).toBe(paddedDescription);
    expect(event.amountUsd).toBe('10.000000');
  });

  it('leaves the frozen V2-S-0101 normalizedInputHash unchanged by the tightening', () => {
    const manifest = CANONICAL_RECEIPT_CHANGED_CASE_MANIFEST_V1[0]!;
    const result = verifyAndNormalizeInternalEconomicsInputV2(buildV2S0101Input());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(manifest.caseId).toBe('V2-S-0101');
    expect(result.input._normalizedInputHash).toBe(manifest.normalizedInputHash);
  });
});

function expenseScenarioInput(): InternalEconomicsInputV2Wire {
  const input = buildMinimalV2Input({
    selectedLane: 'deal_by_deal',
    events: [
      {
        eventId: 'a5-contribution',
        instant: '2025-02-01T00:00:00Z',
        amountUsd: '20.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'fund_expense',
        settlementSourceRef: 'settlement:a5',
      },
      {
        eventId: 'a5-legal-expense',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '10.500000',
        kind: 'fund_expense_payment',
        expenseCategory: 'legal',
        cashSourceAllocations: [{ lotId: 'csl:a5-contribution', amount: '10.500000' }],
      },
      {
        eventId: 'a5-other-expense',
        instant: '2025-04-01T00:00:00Z',
        amountUsd: '4.250000',
        kind: 'fund_expense_payment',
        expenseCategory: 'other',
        description: 'Annual meeting facilities',
        cashSourceAllocations: [{ lotId: 'csl:a5-contribution', amount: '4.250000' }],
      },
    ],
    waterfallPolicy: [
      { kind: 'return_of_capital', priority: 1 },
      { kind: 'carry', priority: 2, gpShare: '0.200000000000' },
    ],
  });
  input.lpClasses[0]!.feeProfile.managementFeeSchedule = [];
  return input;
}

const FIVE_CATEGORY_KEYS = ['admin', 'audit', 'custody', 'legal', 'other'] as const;

function categorySum(totals: Record<string, string>): Decimal {
  return FIVE_CATEGORY_KEYS.reduce(
    (total, key) => total.plus(new Decimal(totals[key]!)),
    new Decimal(0)
  );
}

describe('F_2.0.7 A5 expenseTotalsByCategory receipt field', () => {
  it('A5-01/A5-02 always emits exactly five six-decimal keys, zero-filled', () => {
    const result = certifyInternalEconomicsDualLaneV2(expenseScenarioInput());

    expect(
      result.ok,
      result.ok ? undefined : `${result.refusal.code}/${result.refusal.stage}`
    ).toBe(true);
    if (!result.ok) return;
    const totals = result.certification.dealByDeal.expenseTotalsByCategory;
    expect(Object.keys(totals).sort()).toEqual([...FIVE_CATEGORY_KEYS]);
    for (const key of FIVE_CATEGORY_KEYS) {
      expect(totals[key]).toMatch(/^\d+\.\d{6}$/);
    }
    expect(totals).toEqual({
      legal: '10.500000',
      audit: '0.000000',
      admin: '0.000000',
      custody: '0.000000',
      other: '4.250000',
    });

    const expenseFree = deriveInternalEconomicsV2(buildV2S0101Input());
    expect(expenseFree.ok).toBe(true);
    if (!expenseFree.ok) return;
    expect(expenseFree.receipt.expenseTotalsByCategory).toEqual({
      legal: '0.000000',
      audit: '0.000000',
      admin: '0.000000',
      custody: '0.000000',
      other: '0.000000',
    });
  });

  it('A5-03 conserves the five-key sum against the journal fund_expenses total', () => {
    const result = certifyInternalEconomicsDualLaneV2(expenseScenarioInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const receipt = result.certification.dealByDeal;

    const journalFundExpenses = receipt.journal
      .flatMap((entry) => entry.postings as readonly { account: string; amountUsd: string }[])
      .filter((posting) => posting.account === 'fund_expenses')
      .reduce((total, posting) => total.plus(new Decimal(posting.amountUsd)), new Decimal(0));

    expect(categorySum(receipt.expenseTotalsByCategory).toFixed(6)).toBe('14.750000');
    expect(journalFundExpenses.toFixed(6)).toBe('14.750000');
  });

  it('A5-04 conserves the five-key sum against total partner cumulativeExpenses', () => {
    const result = certifyInternalEconomicsDualLaneV2(expenseScenarioInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const receipt = result.certification.dealByDeal;

    const partnerExpenses = receipt.partnerLedgers.reduce(
      (total, ledger) => total.plus(new Decimal(ledger.cumulativeExpenses)),
      new Decimal(0)
    );

    expect(categorySum(receipt.expenseTotalsByCategory).toFixed(6)).toBe(
      partnerExpenses.toFixed(6)
    );
  });

  it('A5-05 conserves the five-key sum against the admitted fund-expense event total', () => {
    const input = expenseScenarioInput();
    const result = certifyInternalEconomicsDualLaneV2(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const receipt = result.certification.dealByDeal;

    const admittedEventTotal = input.events
      .filter((event) => event.kind === 'fund_expense_payment')
      .reduce((total, event) => total.plus(new Decimal(event.amountUsd)), new Decimal(0));

    expect(categorySum(receipt.expenseTotalsByCategory).toFixed(6)).toBe(
      admittedEventTotal.toFixed(6)
    );
  });

  it('A5-06 includes the field in the canonical hash preimage', () => {
    const result = certifyInternalEconomicsDualLaneV2(expenseScenarioInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { resultHash, ...preimage } = result.certification.dealByDeal;
    expect(Object.prototype.hasOwnProperty.call(preimage, 'expenseTotalsByCategory')).toBe(true);
    expect(oracleHash(preimage)).toBe(resultHash);
    expect(
      oracleHash({
        ...preimage,
        expenseTotalsByCategory: {
          ...preimage.expenseTotalsByCategory,
          legal: '11.500000',
        },
      })
    ).not.toBe(resultHash);
  });
});
