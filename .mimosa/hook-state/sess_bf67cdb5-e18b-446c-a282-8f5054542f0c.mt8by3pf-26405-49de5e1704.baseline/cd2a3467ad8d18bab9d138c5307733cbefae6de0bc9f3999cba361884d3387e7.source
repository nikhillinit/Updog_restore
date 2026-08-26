import { describe, expect, it } from 'vitest';

import {
  DYNAMIC_RESERVE_INTELLIGENCE_CONTRACT_VERSION,
  DynamicReserveIntelligencePayloadV1Schema,
  DynamicReserveIntelligenceRunRequestV1Schema,
} from '../../../shared/contracts/dynamic-reserve-intelligence-v1.contract';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);

function factsSnapshot() {
  return {
    policyVersion: 'financial-facts-policy/1.0.1' as const,
    fundId: 1,
    asOfDate: '2026-07-29',
    knowledgeCutoff: '2026-07-29T12:00:00.000Z',
    vehicleScope: 'fund_all' as const,
    vehicleIds: [],
    selectionSetHash: SHA_A,
    sourceFactsInputHash: SHA_B,
    snapshotInputHash: SHA_C,
    consumerEvaluations: [
      { consumer: 'reserve' as const, status: 'accepted' as const, reasons: [] },
    ],
    payload: {
      companyActuals: {
        fundId: 1,
        asOfDate: '2026-07-29',
        facts: [],
        inputHash: SHA_A,
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
    },
    actorId: 7,
    createdAt: '2026-07-29T12:00:00.000Z',
  };
}

function validPayload() {
  return {
    contractVersion: DYNAMIC_RESERVE_INTELLIGENCE_CONTRACT_VERSION,
    fundId: 1,
    actionability: 'actionable' as const,
    companies: [
      {
        companyId: 11,
        name: 'Alpha',
        canonicalStage: 'seed' as const,
        status: 'actionable' as const,
        rank: 1,
        marginalMoic: '2.5',
        systemAllocatedCents: 75_00,
        overlayPlannedCents: 70_00,
        deltaCents: -5_00,
        concentration: '0.75',
      },
    ],
    fund: {
      totalSystemAllocatedCents: 75_00,
      totalOverlayPlannedCents: 70_00,
      totalDeltaCents: -5_00,
      followOnCapacityCents: 25_00,
      failSafe: false,
      failSafeReason: null,
      excluded: [],
      disclosedDefaults: ['maxPerCompany:Infinity'],
      neutralPolicies: [
        { stage: 'seed' as const, reserveMultiple: 1 as const, weight: 1 as const },
      ],
    },
    constraintFindings: [],
    provenance: {
      financialFactsSnapshotId: 31,
      factsInputHash: SHA_A,
      assumptionsHash: SHA_B,
      envelopeInputHash: SHA_C,
      effectiveMode: 'on' as const,
      h9Actionability: 'actionable' as const,
      overlayProvenance: {
        suppliedBy: 7,
        suppliedAt: '2026-07-29T20:00:00.000Z',
      },
      overlay: [{ companyId: 11, plannedReserveCents: 70_00 }],
      idempotencyKey: 'reserve-run-31',
      requestHash: SHA_A,
      calcVersion: 'reserve-intel-v1',
      asOfDate: '2026-07-29',
      factsSnapshot: factsSnapshot(),
      marginalNonFactsSources: {
        sourceSnapshotDate: '2026-07-29',
        baseCurrency: 'USD',
        companies: [],
        approvedAllocations: [],
        publishedAssumptions: null,
      },
      envelopeSources: {
        fund: {
          sizeDollars: '100',
          deployedCapitalDollars: '0',
          managementFeeRate: '0',
          baseCurrency: 'USD',
        },
        investments: [],
        config: null,
      },
    },
  };
}

describe('dynamic reserve intelligence v1 contract', () => {
  it('accepts the strict cents-and-decimal-string wire shape', () => {
    const parsed = DynamicReserveIntelligencePayloadV1Schema.parse(validPayload());

    expect(parsed.contractVersion).toBe('dynamic-reserve-intelligence-v1');
    expect(parsed.companies[0]?.systemAllocatedCents).toBe(75_00);
    expect(parsed.companies[0]?.marginalMoic).toBe('2.5');
  });

  it('rejects duplicate overlay company ids at the request boundary', () => {
    const parsed = DynamicReserveIntelligenceRunRequestV1Schema.safeParse({
      financialFactsSnapshotId: 31,
      overlay: [
        { companyId: 11, plannedReserveCents: 10_00 },
        { companyId: 11, plannedReserveCents: 20_00 },
      ],
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ['overlay', 1, 'companyId'] })])
      );
    }
  });

  it('rejects unknown fields at request and nested response boundaries', () => {
    expect(
      DynamicReserveIntelligenceRunRequestV1Schema.safeParse({
        financialFactsSnapshotId: 31,
        unexpected: true,
      }).success
    ).toBe(false);

    const payload = validPayload();
    payload.companies[0] = { ...payload.companies[0], unexpected: true } as never;
    expect(DynamicReserveIntelligencePayloadV1Schema.safeParse(payload).success).toBe(false);
  });

  it('rejects fractional cents and numeric ratio fields', () => {
    const fractionalCents = validPayload();
    fractionalCents.companies[0] = {
      ...fractionalCents.companies[0],
      systemAllocatedCents: 1.5,
    };
    expect(DynamicReserveIntelligencePayloadV1Schema.safeParse(fractionalCents).success).toBe(
      false
    );

    const numericRatio = validPayload();
    numericRatio.companies[0] = {
      ...numericRatio.companies[0],
      concentration: 0.75,
    } as never;
    expect(DynamicReserveIntelligencePayloadV1Schema.safeParse(numericRatio).success).toBe(false);
  });

  it('rejects cents outside JavaScript safe-integer precision', () => {
    expect(
      DynamicReserveIntelligenceRunRequestV1Schema.safeParse({
        financialFactsSnapshotId: 31,
        overlay: [
          {
            companyId: 11,
            plannedReserveCents: Number.MAX_SAFE_INTEGER + 1,
          },
        ],
      }).success
    ).toBe(false);

    const unsafeFundTotal = validPayload();
    unsafeFundTotal.fund.totalSystemAllocatedCents = Number.MAX_SAFE_INTEGER + 1;
    expect(DynamicReserveIntelligencePayloadV1Schema.safeParse(unsafeFundTotal).success).toBe(
      false
    );
  });
});
