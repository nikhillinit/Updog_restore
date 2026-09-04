import { describe, expect, it } from 'vitest';

import {
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_2,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_3,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_4,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
  FINANCIAL_FACTS_POLICY_VERSION_1_0_1,
  FINANCIAL_FACTS_POLICY_VERSION_1_1_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_2_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_3_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
  FinancialFactsPayloadV1Schema,
  FinancialFactsPayloadV2Schema,
  FinancialFactsPayloadV3Schema,
  FinancialFactsPayloadV4Schema,
  FinancialFactsPayloadV5Schema,
  PersistedFinancialFactsSnapshotV1Schema,
  type PersistedFinancialFactsSnapshotV1,
} from '../../../../shared/contracts/financial-facts-snapshot-v1.contract';
import type { FinancialFactsSnapshot } from '../../../../shared/schema/financial-facts-snapshots';
import { parsePersistedFactsRow } from '../../../../server/services/financial-facts/parse-persisted-facts-row';

const AS_OF_DATE = '2026-09-04';
const KNOWLEDGE_CUTOFF = '2026-09-04T12:00:00.000Z';

function basePayload() {
  return {
    companyActuals: {
      fundId: 10,
      asOfDate: AS_OF_DATE,
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
  };
}

function payloadV1() {
  return FinancialFactsPayloadV1Schema.parse(basePayload());
}

function payloadV2() {
  return FinancialFactsPayloadV2Schema.parse({
    ...basePayload(),
    positionRefs: [],
    positionComponentRefs: [],
    ownershipRefs: [],
    valuationRefs: [],
    observationRefs: [],
  });
}

function payloadV3() {
  return FinancialFactsPayloadV3Schema.parse({
    ...payloadV2(),
    openingAccountingState: null,
  });
}

function payloadV4() {
  return FinancialFactsPayloadV4Schema.parse({
    ...payloadV3(),
    openingAccountingState: null,
  });
}

function unavailableValue() {
  return {
    value: null,
    availability: 'unavailable' as const,
    reasonCodes: ['SOURCE_NOT_SUPPLIED' as const],
    sourceRefs: [],
  };
}

function payloadV5() {
  const moneyFields = [
    'committedCapital',
    'calledCapitalIssued',
    'paidInCapital',
    'deployedCapital',
    'initialDeployedCapital',
    'followOnDeployedCapital',
    'secondaryDeployedCapital',
    'otherDeployedCapital',
    'managementFeesPaid',
    'otherExpensesPaid',
    'realizedFundProceeds',
    'distributionsToPartners',
    'recallableDistributions',
    'netCalledCapital',
    'uncalledCapital',
    'availableRecallCapacity',
    'portfolioFmv',
    'fundCash',
    'otherAssets',
    'liabilities',
    'nav',
  ];
  const ratioFields = ['dpi', 'rvpi', 'tvpi'];

  return FinancialFactsPayloadV5Schema.parse({
    ...payloadV4(),
    capitalActuals: {
      ledgerCoverage: 'complete',
      ...Object.fromEntries(moneyFields.map((field) => [field, unavailableValue()])),
      ...Object.fromEntries(ratioFields.map((field) => [field, unavailableValue()])),
    },
    valuationActuals: {
      valuationDate: null,
      roster: [],
      marks: [],
      coverage: 'not_supplied',
      missingCompanyIds: [],
    },
    admissionReceiptCore: {
      contractVersion: 'actuals-pilot-publish-receipt/1.0.0',
      operationHash: 'b'.repeat(64),
      fundId: 10,
      asOfDate: AS_OF_DATE,
      coverage: {
        ledger: 'inception_to_date',
        priorFactsSnapshotId: null,
        evidenceNote: 'Codec fixture.',
      },
      admitted: {
        ledger: {
          sourceArtifactId: 1,
          payloadSha256: 'c'.repeat(64),
          canonicalRowsHash: 'd'.repeat(64),
          previewHash: 'e'.repeat(64),
          approvedRowIds: [],
          approvedCount: 0,
        },
        valuation: null,
        importBatchId: '11111111-2222-3333-4444-555555555555',
      },
      facts: {
        policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
        payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
        supersedesSnapshotId: null,
        knowledgeCutoff: KNOWLEDGE_CUTOFF,
      },
      actor: { userId: 7 },
    },
  });
}

function persistedSnapshot(
  policyVersion: PersistedFinancialFactsSnapshotV1['policyVersion'],
  payload: PersistedFinancialFactsSnapshotV1['payload'],
  payloadSchemaId?: string
): PersistedFinancialFactsSnapshotV1 {
  return PersistedFinancialFactsSnapshotV1Schema.parse({
    fundId: 10,
    asOfDate: AS_OF_DATE,
    knowledgeCutoff: KNOWLEDGE_CUTOFF,
    vehicleScope: 'fund_all',
    vehicleIds: [],
    selectionSetHash: 'f'.repeat(64),
    sourceFactsInputHash: '1'.repeat(64),
    snapshotInputHash: '2'.repeat(64),
    consumerEvaluations: [],
    actorId: 7,
    createdAt: KNOWLEDGE_CUTOFF,
    policyVersion,
    ...(payloadSchemaId === undefined ? {} : { payloadSchemaId }),
    payload,
  });
}

function rowFromSnapshot(snapshot: PersistedFinancialFactsSnapshotV1, id: number): FinancialFactsSnapshot {
  return {
    id,
    fundId: snapshot.fundId,
    policyVersion: snapshot.policyVersion,
    payloadSchemaId: snapshot.payloadSchemaId ?? 'financial-facts-payload/1',
    asOfDate: snapshot.asOfDate,
    knowledgeCutoff: new Date(snapshot.knowledgeCutoff),
    vehicleScope: snapshot.vehicleScope,
    vehicleIds: snapshot.vehicleIds,
    selectionSetHash: snapshot.selectionSetHash,
    sourceFactsInputHash: snapshot.sourceFactsInputHash,
    snapshotInputHash: snapshot.snapshotInputHash,
    payload: snapshot.payload,
    consumerEvaluations: snapshot.consumerEvaluations,
    actorId: snapshot.actorId,
    idempotencyKey: `codec-${id}`,
    requestHash: '3'.repeat(64),
    supersedesSnapshotId: null,
    createdAt: new Date(snapshot.createdAt),
  };
}

const snapshots = [
  persistedSnapshot(FINANCIAL_FACTS_POLICY_VERSION_1_0_1, payloadV1()),
  persistedSnapshot(
    FINANCIAL_FACTS_POLICY_VERSION_1_1_0,
    payloadV2(),
    FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_2
  ),
  persistedSnapshot(
    FINANCIAL_FACTS_POLICY_VERSION_1_2_0,
    payloadV3(),
    FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_3
  ),
  persistedSnapshot(
    FINANCIAL_FACTS_POLICY_VERSION_1_3_0,
    payloadV4(),
    FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_4
  ),
  persistedSnapshot(
    FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
    payloadV5(),
    FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5
  ),
];

describe('parsePersistedFactsRow', () => {
  it('round-trips payloads 1 through 5 as facts and carries row identity', () => {
    for (const [index, snapshot] of snapshots.entries()) {
      const id = index + 31;
      const result = parsePersistedFactsRow(rowFromSnapshot(snapshot, id));

      expect(result).toMatchObject({ kind: 'facts' });
      if (result.kind !== 'facts') throw new Error('Expected a supported facts snapshot.');
      expect(result.snapshot.id).toBe(id);
      const { id: _id, ...withoutId } = result.snapshot;
      expect(JSON.stringify(withoutId)).toBe(JSON.stringify(snapshot));
    }
  });

  it('returns unsupported for an unknown policy without parsing JSONB', () => {
    const row = rowFromSnapshot(snapshots[0]!, 99);
    row.policyVersion = 'financial-facts-policy/9.9.9';
    row.payload = { malformed: true };

    expect(parsePersistedFactsRow(row)).toEqual({
      kind: 'unsupported',
      policyVersion: 'financial-facts-policy/9.9.9',
    });
  });

  it('throws for malformed payloads under a known policy', () => {
    const row = rowFromSnapshot(snapshots[4]!, 100);
    row.payload = { malformed: true };

    expect(() => parsePersistedFactsRow(row)).toThrow();
  });
});
