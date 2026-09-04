import { describe, expect, it } from 'vitest';

import {
  EMPTY_SELECTION_SET_HASH,
  FINANCIAL_FACTS_POLICY_VERSION,
  FINANCIAL_FACTS_POLICY_VERSION_1_0_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_0_1,
  FINANCIAL_FACTS_POLICY_VERSION_1_1_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_2_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_3_0,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_1,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_2,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_3,
  FinancialFactsPayloadV1_0_0Schema,
  FinancialFactsPayloadV1Schema,
  FinancialFactsPayloadV2Schema,
  FinancialFactsPayloadV3Schema,
  FinancialFactsSnapshotInputHashPreimageV1_0_0Schema,
  FinancialFactsSelectionSetHashPreimageSchema,
  FinancialFactsSnapshotInputHashPreimageSchema,
  FinancialFactsSnapshotInputHashPreimageV2Schema,
  FinancialFactsSnapshotInputHashPreimageV3Schema,
  FinancialFactsSnapshotV1_0_0Schema,
  FinancialFactsSnapshotV1Schema,
  FinancialFactsSnapshotV2Schema,
  FinancialFactsSnapshotV3Schema,
  PersistedFinancialFactsSnapshotV1Schema,
  VolatileStrippedFundCompanyActualsFactsResponseSchema,
  type FinancialFactsPayloadV1,
  type FinancialFactsPayloadV2,
  type FinancialFactsPayloadV3,
  type FinancialFactsSnapshotInputHashPreimageV3,
} from '../../../shared/contracts/financial-facts-snapshot-v1.contract';
import {
  buildSelectionSetHash,
  buildSnapshotInputHash,
} from '../../../shared/lib/financial-facts/snapshot-hashes';
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

function emptyPayloadV2(overrides: Partial<FinancialFactsPayloadV2> = {}): FinancialFactsPayloadV2 {
  return FinancialFactsPayloadV2Schema.parse({
    ...emptyPayload(),
    participationTermRefs: [],
    positionRefs: [],
    positionComponentRefs: [],
    ownershipRefs: [],
    valuationRefs: [],
    observationRefs: [],
    ...overrides,
  });
}

function openingAccountingState(
  overrides: Partial<NonNullable<FinancialFactsPayloadV3['openingAccountingState']>> = {}
): NonNullable<FinancialFactsPayloadV3['openingAccountingState']> {
  return {
    sourceArtifactId: 41,
    sourceArtifactSha256: 'd'.repeat(64),
    sourceArtifactCreatedAt: '2026-07-21T23:00:00.000Z',
    attestedByActorId: 7,
    observation: {
      contractVersion: 'fund-accounting-state-observation/1.0.0',
      cutoverInstant: '2026-07-21T23:59:59.000Z',
      currency: 'USD',
      cashBalanceUsd: '10.000000',
      cumulativeLpPaidInUsd: '20.000000',
      cumulativeGpPaidInUsd: '3.000000',
      lpUnreturnedContributedCapitalUsd: '12.000000',
      gpUnreturnedContributedCapitalUsd: '2.000000',
      lpDistributionsReturnOfCapitalUsd: '4.000000',
      lpDistributionsProfitUsd: '5.000000',
      actualLpDistributionsCumulativeUsd: '9.000000',
      gpInvestmentDistributionsPaidUsd: '1.000000',
      gpCarryPaidUsd: '2.000000',
      accruedPreferredReturnUsd: '3.000000',
      accruedPreferredReturnThroughInstant: '2026-07-21T23:59:59.000Z',
      recallableDistributionsCumulativeUsd: '6.000000',
      recallableDistributionsOutstandingUsd: '2.000000',
      recycledProceedsCumulativeUsd: '4.000000',
      realizedProceedsCumulativeUsd: '8.000000',
      methodologyVersion: 'manual-opening-state/1.0.0',
    },
    ...overrides,
  };
}

function emptyPayloadV3(overrides: Partial<FinancialFactsPayloadV3> = {}): FinancialFactsPayloadV3 {
  return FinancialFactsPayloadV3Schema.parse({
    ...emptyPayloadV2(),
    openingAccountingState: null,
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
  it('pins the byte-identical policy 1.0.0 empty selection-set hash under current policy', () => {
    expect(FINANCIAL_FACTS_POLICY_VERSION).toBe(FINANCIAL_FACTS_POLICY_VERSION_1_3_0);
    expect(EMPTY_SELECTION_SET_HASH).toBe(
      'be150e55440d5748ad85f67b7c5a1ace54bbd847880a4ec7aa10bc85b6777230'
    );
    expect(buildSelectionSetHash({ sourceObservationIds: [], workingValueSelectionIds: [] })).toBe(
      EMPTY_SELECTION_SET_HASH
    );
  });

  it('keeps legacy 1.0.0 selection arrays empty while current 1.0.1 accepts lineage IDs', () => {
    const currentPayload = emptyPayload({
      sourceObservationIds: [7],
      workingValueSelectionIds: [11],
    });

    expect(currentPayload.sourceObservationIds).toEqual([7]);
    expect(currentPayload.workingValueSelectionIds).toEqual([11]);
    expect(() => FinancialFactsPayloadV1_0_0Schema.parse(currentPayload)).toThrow();
  });

  it('parses persisted 1.0.0 and current 1.0.1 snapshots without rewriting legacy bytes', () => {
    const common = {
      fundId: 10,
      asOfDate: '2026-07-21',
      knowledgeCutoff: '2026-07-22T01:42:44.186Z',
      vehicleScope: 'fund_all' as const,
      vehicleIds: [] as number[],
      selectionSetHash: EMPTY_SELECTION_SET_HASH,
      sourceFactsInputHash: 'a'.repeat(64),
      snapshotInputHash: 'b'.repeat(64),
      consumerEvaluations: [],
      actorId: 7,
      createdAt: '2026-07-22T01:42:44.186Z',
    };
    const legacy = FinancialFactsSnapshotV1_0_0Schema.parse({
      ...common,
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_0_0,
      payload: FinancialFactsPayloadV1_0_0Schema.parse(emptyPayload()),
    });
    const current = FinancialFactsSnapshotV1Schema.parse({
      ...common,
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_0_1,
      payload: emptyPayload({
        sourceObservationIds: [7],
        workingValueSelectionIds: [11],
      }),
    });
    const legacyBytes = JSON.stringify(legacy);

    expect(JSON.stringify(PersistedFinancialFactsSnapshotV1Schema.parse(legacy))).toBe(legacyBytes);
    expect(PersistedFinancialFactsSnapshotV1Schema.parse(current)).toEqual(current);
  });

  it('keeps the legacy 1.0.0 input hash byte-identical and separates current 1.0.1', () => {
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

  it('rejects invalid policy and payload-schema tuples', () => {
    expect(() =>
      FinancialFactsSnapshotInputHashPreimageSchema.parse({
        fundId: 10,
        vehicleIds: [],
        asOfDate: '2026-07-21',
        knowledgeCutoff: '2026-07-22T01:42:44.186Z',
        policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_0_1,
        payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_2,
        selectionSetHash: 'a'.repeat(64),
        payload: emptyPayload(),
      })
    ).toThrow();
    expect(() =>
      FinancialFactsSnapshotInputHashPreimageV2Schema.parse({
        fundId: 10,
        vehicleIds: [],
        asOfDate: '2026-07-21',
        knowledgeCutoff: '2026-07-22T01:42:44.186Z',
        policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_1_0,
        payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_1,
        selectionSetHash: 'a'.repeat(64),
        payload: emptyPayloadV2(),
      })
    ).toThrow();
  });

  it('hashes payload 2 lineage blocks as part of the tuple preimage', () => {
    const base = {
      fundId: 10,
      vehicleIds: [20, 10],
      asOfDate: '2026-07-21',
      knowledgeCutoff: '2026-07-22T01:42:44.186Z',
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_1_0,
      payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_2,
      selectionSetHash: 'a'.repeat(64),
    } as const;
    const left = buildSnapshotInputHash({
      ...base,
      payload: emptyPayloadV2({
        positionRefs: [
          {
            positionEventId: 1,
            eventType: 'acquisition',
            vehicleId: 2,
            companyIdentityId: 3,
            vehicleParticipationId: 4,
            resultingParticipationId: null,
            sourceObservationId: 5,
            effectiveDate: '2026-01-01',
            recordedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      }),
    });
    const right = buildSnapshotInputHash({
      ...base,
      payload: emptyPayloadV2({
        positionRefs: [
          {
            positionEventId: 2,
            eventType: 'acquisition',
            vehicleId: 2,
            companyIdentityId: 3,
            vehicleParticipationId: 4,
            resultingParticipationId: null,
            sourceObservationId: 5,
            effectiveDate: '2026-01-01',
            recordedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      }),
    });

    expect(left).not.toBe(right);
  });

  it('requires payload 3 opening accounting state and accepts null or a valid snapshot ref', () => {
    expect(emptyPayloadV3().openingAccountingState).toBeNull();
    expect(
      emptyPayloadV3({ openingAccountingState: openingAccountingState() }).openingAccountingState
    ).toEqual(openingAccountingState());
    expect(() =>
      FinancialFactsPayloadV3Schema.parse({
        ...emptyPayloadV2(),
      })
    ).toThrow();
    expect(() =>
      FinancialFactsPayloadV3Schema.parse({
        ...emptyPayloadV2(),
        openingAccountingState: {
          ...openingAccountingState(),
          sourceArtifactSha256: 'not-a-sha256',
        },
      })
    ).toThrow();
  });

  it('hashes every opening-state money field plus source, cutover, and attestation identity', () => {
    const baseOpeningState = openingAccountingState();
    const base: FinancialFactsSnapshotInputHashPreimageV3 = {
      fundId: 10,
      vehicleIds: [20, 10],
      asOfDate: '2026-07-21',
      knowledgeCutoff: '2026-07-22T01:42:44.186Z',
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_2_0,
      payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_3,
      selectionSetHash: 'a'.repeat(64),
      payload: emptyPayloadV3({ openingAccountingState: baseOpeningState }),
    };
    const baselineHash = buildSnapshotInputHash(base);
    const moneyMutations: Array<
      Partial<NonNullable<FinancialFactsPayloadV3['openingAccountingState']>['observation']>
    > = [
      { cashBalanceUsd: '11.000000' },
      { cumulativeLpPaidInUsd: '21.000000' },
      { cumulativeGpPaidInUsd: '4.000000' },
      { lpUnreturnedContributedCapitalUsd: '13.000000' },
      { gpUnreturnedContributedCapitalUsd: '3.000000' },
      {
        lpDistributionsReturnOfCapitalUsd: '5.000000',
        actualLpDistributionsCumulativeUsd: '10.000000',
      },
      {
        lpDistributionsProfitUsd: '6.000000',
        actualLpDistributionsCumulativeUsd: '10.000000',
      },
      {
        actualLpDistributionsCumulativeUsd: '10.000000',
        lpDistributionsProfitUsd: '6.000000',
      },
      { gpInvestmentDistributionsPaidUsd: '2.000000' },
      { gpCarryPaidUsd: '3.000000' },
      { accruedPreferredReturnUsd: '4.000000' },
      { recallableDistributionsCumulativeUsd: '7.000000' },
      { recallableDistributionsOutstandingUsd: '3.000000' },
      { recycledProceedsCumulativeUsd: '5.000000' },
      { realizedProceedsCumulativeUsd: '9.000000' },
    ];

    for (const observationOverrides of moneyMutations) {
      const changedOpeningState = openingAccountingState({
        observation: {
          ...baseOpeningState.observation,
          ...observationOverrides,
        },
      });
      expect(
        buildSnapshotInputHash({
          ...base,
          payload: emptyPayloadV3({ openingAccountingState: changedOpeningState }),
        })
      ).not.toBe(baselineHash);
    }

    const identityMutations = [
      openingAccountingState({ sourceArtifactSha256: 'e'.repeat(64) }),
      openingAccountingState({ attestedByActorId: 8 }),
      openingAccountingState({
        observation: {
          ...baseOpeningState.observation,
          cutoverInstant: '2026-07-21T23:58:59.000Z',
          accruedPreferredReturnThroughInstant: '2026-07-21T23:58:59.000Z',
        },
      }),
    ];

    for (const changedOpeningState of identityMutations) {
      expect(
        buildSnapshotInputHash({
          ...base,
          payload: emptyPayloadV3({ openingAccountingState: changedOpeningState }),
        })
      ).not.toBe(baselineHash);
    }
  });

  it('parses persisted policy 1.2.0 snapshots through the versioned union', () => {
    const snapshot = FinancialFactsSnapshotV3Schema.parse({
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_2_0,
      payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_3,
      fundId: 10,
      asOfDate: '2026-07-21',
      knowledgeCutoff: '2026-07-22T01:42:44.186Z',
      vehicleScope: 'fund_all',
      vehicleIds: [],
      selectionSetHash: EMPTY_SELECTION_SET_HASH,
      sourceFactsInputHash: 'a'.repeat(64),
      snapshotInputHash: 'b'.repeat(64),
      consumerEvaluations: [],
      payload: emptyPayloadV3({ openingAccountingState: openingAccountingState() }),
      actorId: 7,
      createdAt: '2026-07-22T01:42:44.186Z',
    });
    const preimage = FinancialFactsSnapshotInputHashPreimageV3Schema.parse({
      fundId: snapshot.fundId,
      vehicleIds: snapshot.vehicleIds,
      asOfDate: snapshot.asOfDate,
      knowledgeCutoff: snapshot.knowledgeCutoff,
      policyVersion: snapshot.policyVersion,
      payloadSchemaId: snapshot.payloadSchemaId,
      selectionSetHash: 'a'.repeat(64),
      payload: snapshot.payload,
    });

    expect(PersistedFinancialFactsSnapshotV1Schema.parse(snapshot)).toEqual(snapshot);
    expect(buildSnapshotInputHash(preimage)).toMatch(/^[a-f0-9]{64}$/);
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
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_0_1,
      selectionSetHash: 'a'.repeat(64),
      payload: emptyPayload(),
    });
    const snapshotRight = FinancialFactsSnapshotInputHashPreimageSchema.parse({
      payload: emptyPayload(),
      selectionSetHash: 'a'.repeat(64),
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_0_1,
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
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_0_1,
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
        policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_0_1,
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
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_0_1,
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

  it('parses persisted payload 2 snapshots with typed Task 11 references', () => {
    const snapshot = FinancialFactsSnapshotV2Schema.parse({
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_1_0,
      payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_2,
      fundId: 10,
      asOfDate: '2026-07-21',
      knowledgeCutoff: '2026-07-22T01:42:44.186Z',
      vehicleScope: 'fund_all',
      vehicleIds: [],
      selectionSetHash: EMPTY_SELECTION_SET_HASH,
      sourceFactsInputHash: 'a'.repeat(64),
      snapshotInputHash: 'b'.repeat(64),
      consumerEvaluations: [
        {
          consumer: 'forecast',
          status: 'blocked',
          reasons: ['position_valuation_incomplete'],
          details: [{ code: 'position_valuation_incomplete', companyIdentityId: 42 }],
        },
      ],
      payload: emptyPayloadV2({
        participationTermRefs: [
          {
            participationId: 1,
            participationVersion: 2,
            financingTrancheId: 3,
            trancheVersion: 4,
          },
        ],
      }),
      actorId: 7,
      createdAt: '2026-07-22T01:42:44.186Z',
    });

    expect(PersistedFinancialFactsSnapshotV1Schema.parse(snapshot)).toEqual(snapshot);
  });

  it('keeps policy 1.0.x consumer evaluations strict against payload 2 details', () => {
    const legacySnapshot = {
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_0_1,
      payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_1,
      fundId: 10,
      asOfDate: '2026-07-21',
      knowledgeCutoff: '2026-07-22T01:42:44.186Z',
      vehicleScope: 'fund_all',
      vehicleIds: [],
      selectionSetHash: EMPTY_SELECTION_SET_HASH,
      sourceFactsInputHash: 'a'.repeat(64),
      snapshotInputHash: 'b'.repeat(64),
      consumerEvaluations: [
        {
          consumer: 'forecast',
          status: 'blocked',
          reasons: ['position_valuation_incomplete'],
          details: [{ code: 'position_valuation_incomplete', companyIdentityId: 42 }],
        },
      ],
      payload: emptyPayload(),
      actorId: 7,
      createdAt: '2026-07-22T01:42:44.186Z',
    };

    expect(() => PersistedFinancialFactsSnapshotV1Schema.parse(legacySnapshot)).toThrow();
  });

  it('pins EMPTY_SELECTION_SET_HASH to the empty selection-set preimage hash', () => {
    expect(buildSelectionSetHash({ sourceObservationIds: [], workingValueSelectionIds: [] })).toBe(
      EMPTY_SELECTION_SET_HASH
    );
  });
});
