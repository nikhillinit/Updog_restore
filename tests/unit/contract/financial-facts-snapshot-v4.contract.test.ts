import { describe, expect, it } from 'vitest';

import {
  AdmissionReceiptCoreV1Schema,
  EMPTY_SELECTION_SET_HASH,
  EmbeddedFundAccountingStateSnapshotRefV1_1Schema,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_2,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_3,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_4,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
  FINANCIAL_FACTS_POLICY_VERSION_1_0_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_0_1,
  FINANCIAL_FACTS_POLICY_VERSION_1_1_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_2_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_3_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
  FinancialFactsPayloadV1Schema,
  FinancialFactsPayloadV1_0_0Schema,
  FinancialFactsPayloadV2Schema,
  FinancialFactsPayloadV3Schema,
  FinancialFactsPayloadV4Schema,
  FinancialFactsPayloadV5Schema,
  FinancialFactsSnapshotInputHashPreimageSchema,
  FinancialFactsSnapshotInputHashPreimageV1_0_0Schema,
  FinancialFactsSnapshotInputHashPreimageV4Schema,
  FinancialFactsSnapshotInputHashPreimageV5Schema,
  FinancialFactsSnapshotV4Schema,
  FinancialFactsSnapshotV5Schema,
  PersistedFinancialFactsSnapshotV1Schema,
  buildSnapshotInputHash,
  type FinancialFactsPayloadV1,
  type FinancialFactsPayloadV2,
  type FinancialFactsPayloadV3,
  type FinancialFactsPayloadV4,
  type FinancialFactsPayloadV5,
  type FinancialFactsSnapshotInputHashPreimageV4,
  type FinancialFactsSnapshotInputHashPreimageV5,
  type FinancialFactsSnapshotV4,
  type PersistedFinancialFactsSnapshotInputHashPreimage,
} from '../../../shared/contracts/financial-facts-snapshot-v1.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import {
  ConsumerEvaluationReasonV3Schema,
  ConsumerEvaluationSchema,
  ConsumerEvaluationV2Schema,
  ConsumerEvaluationV3Schema,
} from '../../../shared/contracts/financial-facts-consumer-policies';

/**
 * Raw (frozen-input-shape) v1.1 embedded ref: no derived
 * lpUnreturnedContributedCapitalUsd. Uses the G20 founding fixture numbers
 * (paidIn 10,000,000 / ROC 3,500,000 -> derived 6,500,000).
 */
function rawEmbeddedRef() {
  return {
    sourceArtifactId: 42,
    sourceArtifactSha256: 'd'.repeat(64),
    sourceArtifactCreatedAt: '2026-06-30T20:15:00.000Z',
    attestedByActorId: 7,
    observation: {
      contractVersion: 'fund-accounting-state-observation/1.1.0',
      cutoverInstant: '2026-06-30T23:59:59.000Z',
      currency: 'USD',
      cashBalanceUsd: '1250000.000000',
      cumulativeLpPaidInUsd: '10000000.000000',
      cumulativeGpPaidInUsd: '250000.000000',
      gpUnreturnedContributedCapitalUsd: '150000.000000',
      lpDistributionsReturnOfCapitalUsd: '3500000.000000',
      lpDistributionsProfitUsd: '875000.000000',
      actualLpDistributionsCumulativeUsd: '4375000.000000',
      gpInvestmentDistributionsPaidUsd: '125000.000000',
      gpCarryPaidUsd: '200000.000000',
      accruedPreferredReturnUsd: '325000.000000',
      accruedPreferredReturnThroughInstant: '2026-06-30T23:59:59.000Z',
      recallableDistributionsCumulativeUsd: '600000.000000',
      recallableDistributionsOutstandingUsd: '400000.000000',
      recycledProceedsCumulativeUsd: '250000.000000',
      realizedProceedsCumulativeUsd: '5000000.000000',
      methodologyVersion: 'fund-accounting-methodology/1.0.0',
    },
  };
}

const DERIVED_LP_UNRETURNED = '6500000.000000';

function emptyPayload(): FinancialFactsPayloadV1 {
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
  });
}

function emptyPayloadV2(): FinancialFactsPayloadV2 {
  return FinancialFactsPayloadV2Schema.parse({
    ...emptyPayload(),
    participationTermRefs: [],
    positionRefs: [],
    positionComponentRefs: [],
    ownershipRefs: [],
    valuationRefs: [],
    observationRefs: [],
  });
}

function emptyPayloadV3(): FinancialFactsPayloadV3 {
  return FinancialFactsPayloadV3Schema.parse({
    ...emptyPayloadV2(),
    openingAccountingState: null,
  });
}

function emptyPayloadV4(openingAccountingState: unknown = null): FinancialFactsPayloadV4 {
  return FinancialFactsPayloadV4Schema.parse({
    ...emptyPayloadV2(),
    openingAccountingState,
  });
}

function snapshotEnvelopeCommon() {
  return {
    fundId: 10,
    asOfDate: '2026-07-21',
    knowledgeCutoff: '2026-07-22T01:42:44.186Z',
    vehicleScope: 'fund_all' as const,
    vehicleIds: [] as number[],
    selectionSetHash: EMPTY_SELECTION_SET_HASH,
    sourceFactsInputHash: 'a'.repeat(64),
    snapshotInputHash: 'b'.repeat(64),
    actorId: 7,
    createdAt: '2026-07-22T01:42:44.186Z',
  };
}

function snapshotV4(): FinancialFactsSnapshotV4 {
  return FinancialFactsSnapshotV4Schema.parse({
    ...snapshotEnvelopeCommon(),
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_3_0,
    payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_4,
    consumerEvaluations: [],
    payload: emptyPayloadV4(rawEmbeddedRef()),
  });
}

function preimageV4(): FinancialFactsSnapshotInputHashPreimageV4 {
  return FinancialFactsSnapshotInputHashPreimageV4Schema.parse({
    fundId: 10,
    vehicleIds: [20, 10],
    asOfDate: '2026-07-21',
    knowledgeCutoff: '2026-07-22T01:42:44.186Z',
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_3_0,
    payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_4,
    selectionSetHash: EMPTY_SELECTION_SET_HASH,
    payload: emptyPayloadV4(rawEmbeddedRef()),
  });
}

function governedMoney(value: string) {
  return {
    value,
    availability: 'available' as const,
    reasonCodes: [],
    sourceRefs: ['fixture:payload-5'],
  };
}

function unavailableMoney(reason = 'SOURCE_NOT_SUPPLIED') {
  return {
    value: null,
    availability: 'unavailable' as const,
    reasonCodes: [reason],
    sourceRefs: ['fixture:payload-5'],
  };
}

function payloadV5(): FinancialFactsPayloadV5 {
  return FinancialFactsPayloadV5Schema.parse({
    ...emptyPayloadV4(rawEmbeddedRef()),
    capitalActuals: {
      ledgerCoverage: 'complete',
      committedCapital: governedMoney('100.000000'),
      calledCapitalIssued: unavailableMoney('CALL_NOTICE_NOT_IMPORTED'),
      paidInCapital: governedMoney('50.000000'),
      deployedCapital: governedMoney('40.000000'),
      initialDeployedCapital: governedMoney('40.000000'),
      followOnDeployedCapital: governedMoney('0.000000'),
      secondaryDeployedCapital: governedMoney('0.000000'),
      otherDeployedCapital: governedMoney('0.000000'),
      managementFeesPaid: governedMoney('0.000000'),
      otherExpensesPaid: governedMoney('0.000000'),
      realizedFundProceeds: governedMoney('12.000000'),
      distributionsToPartners: governedMoney('8.000000'),
      recallableDistributions: governedMoney('5.000000'),
      netCalledCapital: unavailableMoney('CALL_NOTICE_NOT_IMPORTED'),
      uncalledCapital: unavailableMoney('CALL_NOTICE_NOT_IMPORTED'),
      availableRecallCapacity: unavailableMoney('RECALL_LIFECYCLE_UNAVAILABLE'),
      portfolioFmv: governedMoney('55.000000'),
      fundCash: unavailableMoney('SOURCE_NOT_SUPPLIED'),
      otherAssets: unavailableMoney('SOURCE_NOT_SUPPLIED'),
      liabilities: unavailableMoney('SOURCE_NOT_SUPPLIED'),
      nav: unavailableMoney('NAV_UNAVAILABLE'),
      dpi: {
        value: '0.160000000000',
        availability: 'available',
        reasonCodes: [],
        sourceRefs: ['fixture:payload-5'],
      },
      rvpi: unavailableMoney('NAV_UNAVAILABLE'),
      tvpi: unavailableMoney('NAV_UNAVAILABLE'),
    },
    valuationActuals: {
      valuationDate: '2026-07-21',
      roster: [{ vehicleId: 11, companyId: 20 }],
      marks: [
        {
          markId: 21,
          vehicleId: 11,
          companyId: 20,
          positionFairValue: '55.000000',
          markSource: 'gp_estimate',
          confidenceLevel: 'high',
          externalRefHash: 'f'.repeat(64),
        },
      ],
      coverage: 'complete',
      missingCompanyIds: [],
    },
    admissionReceiptCore: AdmissionReceiptCoreV1Schema.parse({
      contractVersion: 'actuals-pilot-publish-receipt/1.0.0',
      operationHash: 'e'.repeat(64),
      fundId: 10,
      asOfDate: '2026-07-21',
      coverage: {
        ledger: 'inception_to_date',
        priorFactsSnapshotId: null,
        evidenceNote: 'Payload 5 contract fixture.',
      },
      admitted: {
        ledger: {
          sourceArtifactId: 41,
          payloadSha256: 'a'.repeat(64),
          canonicalRowsHash: 'b'.repeat(64),
          previewHash: 'c'.repeat(64),
          approvedRowIds: [51],
          approvedCount: 1,
        },
        valuation: {
          sourceArtifactId: 42,
          payloadSha256: 'd'.repeat(64),
          canonicalRowsHash: 'e'.repeat(64),
          previewHash: 'f'.repeat(64),
          approvedMarkIds: [21],
          approvedCount: 1,
        },
        importBatchId: '11111111-2222-3333-4444-555555555555',
      },
      facts: {
        policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
        payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
        supersedesSnapshotId: null,
        knowledgeCutoff: '2026-07-22T01:42:44.186Z',
      },
      actor: { userId: 7 },
    }),
  });
}

function snapshotV5(): FinancialFactsSnapshotV5 {
  return FinancialFactsSnapshotV5Schema.parse({
    ...snapshotEnvelopeCommon(),
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
    payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
    consumerEvaluations: [
      {
        consumer: 'forecast',
        status: 'blocked',
        reasons: ['unsupported_payload_policy'],
      },
    ],
    payload: payloadV5(),
  });
}

function preimageV5(): FinancialFactsSnapshotInputHashPreimageV5 {
  return FinancialFactsSnapshotInputHashPreimageV5Schema.parse({
    fundId: 10,
    vehicleIds: [20, 10],
    asOfDate: '2026-07-21',
    knowledgeCutoff: '2026-07-22T01:42:44.186Z',
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
    payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
    selectionSetHash: EMPTY_SELECTION_SET_HASH,
    payload: payloadV5(),
  });
}

describe('embedded v1.1 snapshot-ref adapter (T-D1, R10)', () => {
  it('derives unreturned LP capital from a raw-shape v1.1 ref via the frozen schema', () => {
    const resolved = EmbeddedFundAccountingStateSnapshotRefV1_1Schema.parse(rawEmbeddedRef());

    expect(resolved.observation.lpUnreturnedContributedCapitalUsd).toBe(DERIVED_LP_UNRETURNED);
    expect(resolved.observation.contractVersion).toBe('fund-accounting-state-observation/1.1.0');
  });

  it('is byte-stable when parsing its own resolved output again', () => {
    const first = EmbeddedFundAccountingStateSnapshotRefV1_1Schema.parse(rawEmbeddedRef());
    const second = EmbeddedFundAccountingStateSnapshotRefV1_1Schema.parse(first);
    const roundTripped = EmbeddedFundAccountingStateSnapshotRefV1_1Schema.parse(
      JSON.parse(JSON.stringify(first)) as unknown
    );

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(roundTripped)).toBe(JSON.stringify(first));
  });

  it('rejects a supplied derived value that differs from the frozen recomputation', () => {
    const resolved = EmbeddedFundAccountingStateSnapshotRefV1_1Schema.parse(rawEmbeddedRef());
    const tampered = {
      ...resolved,
      observation: {
        ...resolved.observation,
        lpUnreturnedContributedCapitalUsd: '6500000.000001',
      },
    };
    const nonString = {
      ...resolved,
      observation: {
        ...resolved.observation,
        lpUnreturnedContributedCapitalUsd: 6_500_000,
      },
    };

    expect(EmbeddedFundAccountingStateSnapshotRefV1_1Schema.safeParse(tampered).success).toBe(
      false
    );
    expect(EmbeddedFundAccountingStateSnapshotRefV1_1Schema.safeParse(nonString).success).toBe(
      false
    );
  });

  it('delegates every other validation to the frozen v1.1 schema in both shapes', () => {
    const rawBrokenIdentity = rawEmbeddedRef();
    rawBrokenIdentity.observation.actualLpDistributionsCumulativeUsd = '4375000.000001';

    const resolved = EmbeddedFundAccountingStateSnapshotRefV1_1Schema.parse(rawEmbeddedRef());
    const resolvedBrokenIdentity = {
      ...resolved,
      observation: {
        ...resolved.observation,
        actualLpDistributionsCumulativeUsd: '4375000.000001',
      },
    };

    expect(
      EmbeddedFundAccountingStateSnapshotRefV1_1Schema.safeParse(rawBrokenIdentity).success
    ).toBe(false);
    expect(
      EmbeddedFundAccountingStateSnapshotRefV1_1Schema.safeParse(resolvedBrokenIdentity).success
    ).toBe(false);
  });
});

describe('financial facts payload v4 and persisted cascade (T-D1)', () => {
  it('parses payload v4 with a null or raw opening state and resolves the derived field', () => {
    expect(emptyPayloadV4(null).openingAccountingState).toBeNull();

    const resolved = emptyPayloadV4(rawEmbeddedRef());
    expect(resolved.openingAccountingState?.observation.lpUnreturnedContributedCapitalUsd).toBe(
      DERIVED_LP_UNRETURNED
    );
  });

  it('round-trips payload v4 byte-identically through a reparse of its resolved output', () => {
    const first = emptyPayloadV4(rawEmbeddedRef());
    const second = FinancialFactsPayloadV4Schema.parse(JSON.parse(JSON.stringify(first)));

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('parses a persisted 1.3.0 snapshot through the union and back from stored bytes', () => {
    const snapshot = snapshotV4();
    const viaUnion = PersistedFinancialFactsSnapshotV1Schema.parse(snapshot);
    const readback = PersistedFinancialFactsSnapshotV1Schema.parse(
      JSON.parse(JSON.stringify(snapshot)) as unknown
    );

    expect(snapshot.policyVersion).toBe('financial-facts-policy/1.3.0');
    expect(snapshot.payloadSchemaId).toBe('financial-facts-payload/4');
    expect(JSON.stringify(viaUnion)).toBe(JSON.stringify(snapshot));
    expect(JSON.stringify(readback)).toBe(JSON.stringify(snapshot));
  });

  it('keeps stored v1/v2/v3 snapshot fixtures parsing through the widened union', () => {
    const v1 = {
      ...snapshotEnvelopeCommon(),
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_0_1,
      consumerEvaluations: [],
      payload: emptyPayload(),
    };
    const v2 = {
      ...snapshotEnvelopeCommon(),
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_1_0,
      payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_2,
      consumerEvaluations: [],
      payload: emptyPayloadV2(),
    };
    const v3 = {
      ...snapshotEnvelopeCommon(),
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_2_0,
      payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_3,
      consumerEvaluations: [],
      payload: emptyPayloadV3(),
    };

    for (const stored of [v1, v2, v3]) {
      expect(PersistedFinancialFactsSnapshotV1Schema.parse(stored)).toEqual(stored);
    }
  });

  it('round-trips payload v5 through its persisted and preimage unions', () => {
    const snapshot = snapshotV5();
    const preimage = preimageV5();

    expect(
      PersistedFinancialFactsSnapshotV1Schema.parse(JSON.parse(JSON.stringify(snapshot)) as unknown)
    ).toEqual(snapshot);
    expect(
      FinancialFactsSnapshotInputHashPreimageV5Schema.parse(
        JSON.parse(JSON.stringify(preimage)) as unknown
      )
    ).toEqual(preimage);
    expect(buildSnapshotInputHash(preimage)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('parses V1, V2, and V3 evaluation fixtures without rewriting earlier shapes', () => {
    const v1 = {
      consumer: 'forecast',
      status: 'blocked',
      reasons: ['unattributed_legacy_direct'],
    } as const;
    const v2 = {
      consumer: 'reserve',
      status: 'blocked',
      reasons: ['position_valuation_incomplete'],
      details: [{ code: 'position_valuation_incomplete', companyIdentityId: 42 }],
    } as const;
    const v3 = {
      consumer: 'reserve',
      status: 'blocked',
      reasons: ['investment_lineage_unresolved'],
      details: [{ code: 'investment_lineage_unresolved', companyIds: [42] }],
    } as const;

    expect(ConsumerEvaluationSchema.parse(v1)).toEqual(v1);
    expect(ConsumerEvaluationV2Schema.parse(v2)).toEqual(v2);
    expect(ConsumerEvaluationV3Schema.parse(v3)).toEqual(v3);
  });

  it('rejects an unknown V3 evaluation reason', () => {
    expect(ConsumerEvaluationReasonV3Schema.safeParse('unknown_v3_reason').success).toBe(false);
    expect(() =>
      ConsumerEvaluationV3Schema.parse({
        consumer: 'forecast',
        status: 'blocked',
        reasons: ['unknown_v3_reason'],
      })
    ).toThrow();
  });

  it('rejects cross-version tuples on both discriminant axes', () => {
    const snapshot = snapshotV4();

    expect(
      FinancialFactsSnapshotV4Schema.safeParse({
        ...snapshot,
        payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_3,
      }).success
    ).toBe(false);
    expect(
      PersistedFinancialFactsSnapshotV1Schema.safeParse({
        ...snapshot,
        policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_2_0,
      }).success
    ).toBe(false);
  });
});

describe('buildSnapshotInputHash totality (T-D3 contract slice, R9)', () => {
  it('returns, not throws, for a SHA-rich schema-valid V4 preimage carrying the be150 empty-selection hash', () => {
    expect(EMPTY_SELECTION_SET_HASH.startsWith('be150')).toBe(true);

    const preimage = preimageV4();
    expect(preimage.selectionSetHash).toBe(EMPTY_SELECTION_SET_HASH);

    let hash = '';
    expect(() => {
      hash = buildSnapshotInputHash(preimage);
    }).not.toThrow();
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('hashes the explicit schema-parsed preimage object exactly as canonicalSha256', () => {
    const preimage = preimageV4();
    const expected = canonicalSha256({
      fundId: preimage.fundId,
      vehicleIds: [...preimage.vehicleIds].sort((left, right) => left - right),
      asOfDate: preimage.asOfDate,
      knowledgeCutoff: preimage.knowledgeCutoff,
      policyVersion: preimage.policyVersion,
      selectionSetHash: preimage.selectionSetHash,
      payloadSchemaId: preimage.payloadSchemaId,
      payload: preimage.payload,
    });

    expect(buildSnapshotInputHash(preimage)).toBe(expected);
    expect(
      buildSnapshotInputHash(FinancialFactsSnapshotInputHashPreimageV4Schema.parse(preimage))
    ).toBe(expected);
  });

  it('dispatches V4 preimages to the V4 member, never silently to V3', () => {
    const preimage = preimageV4();
    const nullOpeningState = FinancialFactsSnapshotInputHashPreimageV4Schema.parse({
      ...preimage,
      payload: emptyPayloadV4(null),
    });

    expect(buildSnapshotInputHash(nullOpeningState)).not.toBe(buildSnapshotInputHash(preimage));
    expect(() =>
      buildSnapshotInputHash({
        ...preimage,
        policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_2_0,
        payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_3,
      } as PersistedFinancialFactsSnapshotInputHashPreimage)
    ).toThrow();
  });

  it('keeps the pinned legacy hash fixtures byte-identical after the totality change', () => {
    const identity = {
      fundId: 10,
      vehicleIds: [20, 10],
      asOfDate: '2026-07-21',
      knowledgeCutoff: '2026-07-22T01:42:44.186Z',
      selectionSetHash: 'a'.repeat(64),
    };
    const legacy = FinancialFactsSnapshotInputHashPreimageV1_0_0Schema.parse({
      ...identity,
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_0_0,
      payload: FinancialFactsPayloadV1_0_0Schema.parse(emptyPayload()),
    });
    const current = FinancialFactsSnapshotInputHashPreimageSchema.parse({
      ...identity,
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_0_1,
      payload: emptyPayload(),
    });

    expect(buildSnapshotInputHash(legacy)).toBe(
      'ea4cc7f7765abc2240d72df3a8cb7affde14fa235219fd3705fdad153b63c4ed'
    );
    expect(buildSnapshotInputHash(current)).toBe(
      '9a51f1cbc1beba5aa659c5bd2817e8ea908508d560ce2f92728ecac13f502e62'
    );
  });
});
