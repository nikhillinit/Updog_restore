import { describe, expect, it } from 'vitest';

import {
  EMPTY_SELECTION_SET_HASH,
  FINANCIAL_FACTS_POLICY_VERSION,
  FinancialFactsPayloadV1Schema,
  FinancialFactsSelectionSetHashPreimageSchema,
  FinancialFactsSnapshotInputHashPreimageSchema,
  FinancialFactsSnapshotV1Schema,
  VolatileStrippedFundCompanyActualsFactsResponseSchema,
  buildSelectionSetHash,
  buildSnapshotInputHash,
  type FinancialFactsPayloadV1,
} from '../../../shared/contracts/financial-facts-snapshot-v1.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import { Decimal } from '../../../shared/lib/decimal-config';
import {
  MoneyDecimalStringSchema,
  assertDecimalStringLeaves,
  canonicalizeDecimalLeaves,
  toFixedDecimalString,
} from '../../../shared/lib/decimal-string';

function emptyPayload(overrides: Partial<FinancialFactsPayloadV1> = {}): FinancialFactsPayloadV1 {
  return FinancialFactsPayloadV1Schema.parse({
    companyActuals: {
      fundId: 10,
      asOfDate: '2026-07-21',
      facts: [],
      inputHash: 'a'.repeat(64),
    },
    sourceObservationIds: [],
    workingValueSelectionIds: [],
    participationTermRefs: [],
    cashFlowSeries: {
      series: [],
      totals: {
        contributions: '0.000000',
        distributions: '0.000000',
        recallableDistributions: '0.000000',
      },
      warnings: [],
    },
    marksSeries: { marks: [], periodNav: [], warnings: [] },
    vehicleRoster: [],
    ...overrides,
  });
}

function stripGeneratedAt(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripGeneratedAt);
  if (value === null || typeof value !== 'object') return value;

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key !== 'generatedAt') result[key] = stripGeneratedAt(child);
  }
  return result;
}

function rawCompanyActuals(generatedAt: string) {
  return {
    fundId: 10,
    asOfDate: '2026-07-21',
    facts: [
      {
        fundId: 10,
        companyId: 20,
        companyName: 'Example Co',
        investmentIds: [30],
        activeRoundIds: [40],
        approvedPlanningFmvMarkId: null,
        planningFmvStatus: 'none',
        initialInvestmentAmount: '10.000000',
        followOnInvestmentAmount: '0.000000',
        amountOnlyNonEquityAmount: '0.000000',
        latestRoundDate: '2026-01-15',
        latestRoundValuation: '100.000000',
        latestPlanningFmvDate: null,
        latestPlanningFmvValue: null,
        currency: 'USD',
        currencyStatus: 'base_currency',
        supersedeLineage: [{ roundId: 40, supersedesRoundId: null }],
        warnings: [],
        provenance: {
          trustState: 'LIVE',
          core: {
            sourceKind: 'computed',
            actionability: 'actionable',
            sourceEngine: 'rounds-to-model',
            engineVersion: '1.0.0',
            inputHash: 'b'.repeat(64),
            assumptionsHash: 'c'.repeat(64),
            generatedAt,
            isFinanciallyActionable: true,
            warnings: [],
          },
          structuredWarnings: [],
        },
        inputHash: 'd'.repeat(64),
      },
    ],
    inputHash: 'a'.repeat(64),
    generatedAt,
  };
}

describe('canonical decimal-string primitives', () => {
  it('formats money with exactly six decimal places without a number conversion', () => {
    expect(toFixedDecimalString(new Decimal('123456789012345.1234564'), 6)).toBe(
      '123456789012345.123456'
    );
    expect(MoneyDecimalStringSchema.parse('123456789012345.123456')).toBe('123456789012345.123456');
    expect(MoneyDecimalStringSchema.safeParse('123456789012345.12345').success).toBe(false);
  });

  it('rejects scientific notation anywhere in a decimal hash leaf', () => {
    expect(() => assertDecimalStringLeaves({ amount: '1e+3' })).toThrowError(
      /scientific notation/i
    );
    expect(() => toFixedDecimalString('1e+3', 6)).toThrowError(/scientific notation/i);
  });

  it('rejects money leaves that do not satisfy the six-place schema', () => {
    expect(() => assertDecimalStringLeaves({ amount: '10.25' })).toThrowError(
      /decimal-string schema/i
    );
  });

  it('returns a validated, key-sorted hash input without changing decimal bytes', () => {
    const canonical = canonicalizeDecimalLeaves({
      z: { amount: '10.250000' },
      a: ['3.140000'],
    }) as Record<string, unknown>;

    expect(Object.keys(canonical)).toEqual(['a', 'z']);
    expect(canonical).toEqual({ a: ['3.140000'], z: { amount: '10.250000' } });
  });
});

describe('financial facts snapshot hashes', () => {
  it('pins the policy 1.0.0 empty selection-set hash', () => {
    expect(EMPTY_SELECTION_SET_HASH).toBe(
      'be150e55440d5748ad85f67b7c5a1ace54bbd847880a4ec7aa10bc85b6777230'
    );
    expect(buildSelectionSetHash({ sourceObservationIds: [], workingValueSelectionIds: [] })).toBe(
      EMPTY_SELECTION_SET_HASH
    );
  });

  it('defines the source, selection, and snapshot preimages and hashes them stably under key reordering', () => {
    const sourceLeft = { fundId: 10, asOfDate: '2026-07-21', rows: [{ id: 1 }] };
    const sourceRight = { rows: [{ id: 1 }], asOfDate: '2026-07-21', fundId: 10 };
    expect(canonicalSha256(sourceRight)).toBe(canonicalSha256(sourceLeft));

    const selectionLeft = FinancialFactsSelectionSetHashPreimageSchema.parse({
      sourceObservationIds: [2, 1],
      workingValueSelectionIds: ['b', 'a'],
    });
    const selectionRight = FinancialFactsSelectionSetHashPreimageSchema.parse({
      workingValueSelectionIds: ['a', 'b'],
      sourceObservationIds: [1, 2],
    });
    expect(buildSelectionSetHash(selectionRight)).toBe(buildSelectionSetHash(selectionLeft));

    const snapshotLeft = FinancialFactsSnapshotInputHashPreimageSchema.parse({
      fundId: 10,
      vehicleIds: [20, 10],
      asOfDate: '2026-07-21',
      knowledgeCutoff: '2026-07-22T01:42:44.186Z',
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION,
      selectionSetHash: 'a'.repeat(64),
      payload: emptyPayload(),
    });
    const snapshotRight = FinancialFactsSnapshotInputHashPreimageSchema.parse({
      payload: emptyPayload(),
      selectionSetHash: 'a'.repeat(64),
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION,
      knowledgeCutoff: '2026-07-22T01:42:44.186Z',
      asOfDate: '2026-07-21',
      vehicleIds: [10, 20],
      fundId: 10,
    });
    expect(buildSnapshotInputHash(snapshotRight)).toBe(buildSnapshotInputHash(snapshotLeft));
  });

  it('holds the cutoff constant and ignores only stripped generatedAt clock variation', () => {
    const firstActuals = VolatileStrippedFundCompanyActualsFactsResponseSchema.parse(
      stripGeneratedAt(rawCompanyActuals('2026-07-22T01:42:44.186Z'))
    );
    const secondActuals = VolatileStrippedFundCompanyActualsFactsResponseSchema.parse(
      stripGeneratedAt(rawCompanyActuals('2026-07-23T08:00:00.000Z'))
    );
    const fixedIdentity = {
      fundId: 10,
      vehicleIds: [] as number[],
      asOfDate: '2026-07-21',
      knowledgeCutoff: '2026-07-22T01:42:44.186Z',
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION,
      selectionSetHash: 'a'.repeat(64),
    };

    expect(
      buildSnapshotInputHash({
        ...fixedIdentity,
        payload: emptyPayload({ companyActuals: secondActuals }),
      })
    ).toBe(
      buildSnapshotInputHash({
        ...fixedIdentity,
        payload: emptyPayload({ companyActuals: firstActuals }),
      })
    );
  });

  it('throws when wrapper hashing receives a scientific-notation money leaf', () => {
    const payload = emptyPayload();
    const unsafePayload = {
      ...payload,
      cashFlowSeries: {
        ...payload.cashFlowSeries,
        totals: { ...payload.cashFlowSeries.totals, contributions: '1e+3' },
      },
    };

    expect(() =>
      buildSnapshotInputHash({
        fundId: 10,
        vehicleIds: [],
        asOfDate: '2026-07-21',
        knowledgeCutoff: '2026-07-22T01:42:44.186Z',
        policyVersion: FINANCIAL_FACTS_POLICY_VERSION,
        selectionSetHash: 'a'.repeat(64),
        payload: unsafePayload as FinancialFactsPayloadV1,
      })
    ).toThrow();
  });

  it('validates the wrapper and preserves decimal bytes through a JSONB round trip', () => {
    const payload = emptyPayload({
      cashFlowSeries: {
        series: [
          {
            eventType: 'lp_capital_call',
            vehicleId: null,
            perspective: 'lp_net',
            points: [
              {
                eventId: 1,
                effectiveAt: '2026-06-30T00:00:00.000Z',
                amount: '123456789012345.123456',
              },
            ],
          },
        ],
        totals: {
          contributions: '123456789012345.123456',
          distributions: '0.000000',
          recallableDistributions: '0.000000',
        },
        warnings: [],
      },
    });
    const snapshot = FinancialFactsSnapshotV1Schema.parse({
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION,
      fundId: 10,
      asOfDate: '2026-07-21',
      knowledgeCutoff: '2026-07-22T01:42:44.186Z',
      vehicleScope: 'fund_all',
      vehicleIds: [],
      selectionSetHash: EMPTY_SELECTION_SET_HASH,
      sourceFactsInputHash: 'a'.repeat(64),
      snapshotInputHash: 'b'.repeat(64),
      consumerEvaluations: [],
      payload,
      actorId: 7,
      createdAt: '2026-07-22T01:42:44.186Z',
    });
    const before = JSON.stringify(snapshot);
    const after = JSON.stringify(
      FinancialFactsSnapshotV1Schema.parse(JSON.parse(before) as unknown)
    );

    expect(after).toBe(before);
    expect(after).toContain('"amount":"123456789012345.123456"');
  });
});
