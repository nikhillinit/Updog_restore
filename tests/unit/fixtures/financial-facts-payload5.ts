import {
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
  FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
  FinancialFactsPayloadV5Schema,
  PersistedFinancialFactsSnapshotV1Schema,
  type ActualsAvailabilityReasonV1,
  type PersistedFinancialFactsSnapshotV1,
} from '../../../shared/contracts/financial-facts-snapshot-v1.contract';
import type { FinancialFactsSnapshot } from '../../../shared/schema/financial-facts-snapshots';

const FUND_ID = 1;
const AS_OF_DATE = '2026-07-21';
const KNOWLEDGE_CUTOFF = '2026-07-22T02:00:00.000Z';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function unavailableMoney(reason: ActualsAvailabilityReasonV1 = 'SOURCE_NOT_SUPPLIED') {
  return {
    value: null,
    availability: 'unavailable' as const,
    reasonCodes: [reason],
    sourceRefs: [],
  };
}

function availableMoney(value: string) {
  return {
    value,
    availability: 'available' as const,
    reasonCodes: [],
    sourceRefs: ['fixture:payload-5'],
  };
}

export function financialFactsPayloadV5() {
  const payload = FinancialFactsPayloadV5Schema.parse({
    companyActuals: {
      fundId: FUND_ID,
      asOfDate: AS_OF_DATE,
      facts: [
        {
          fundId: FUND_ID,
          companyId: 11,
          companyName: 'Alpha',
          investmentIds: [101],
          activeRoundIds: [201],
          approvedPlanningFmvMarkId: 501,
          planningFmvStatus: 'active',
          initialInvestmentAmount: '1000000.000000',
          followOnInvestmentAmount: '0.000000',
          amountOnlyNonEquityAmount: '0.000000',
          latestRoundDate: '2026-01-01',
          latestRoundValuation: '10000000.000000',
          latestPlanningFmvDate: AS_OF_DATE,
          latestPlanningFmvValue: '55000000.000000',
          currency: 'USD',
          currencyStatus: 'base_currency',
          supersedeLineage: [{ roundId: 201, supersedesRoundId: null }],
          warnings: [],
          provenance: {
            trustState: 'LIVE',
            core: {
              sourceKind: 'computed',
              actionability: 'actionable',
              sourceEngine: 'rounds-to-model',
              engineVersion: '1.0.0',
              inputHash: HASH_A,
              assumptionsHash: HASH_B,
              isFinanciallyActionable: true,
              warnings: [],
            },
            structuredWarnings: [],
          },
          inputHash: HASH_C,
        },
      ],
      inputHash: HASH_A,
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
    marksSeries: {
      marks: [
        {
          markId: 501,
          companyId: 11,
          vehicleId: 11,
          effectiveAt: AS_OF_DATE,
          fairValue: '55000000.000000',
          currency: 'USD',
        },
      ],
      periodNav: [
        {
          periodEnd: '2026-06-30',
          nav: '55000000.000000',
          warnings: [
            {
              code: 'PERIOD_NAV_IS_POSITION_VALUE',
              severity: 'warning',
              message: 'Position-value NAV fixture.',
              source: 'fixture:payload-5',
            },
          ],
        },
      ],
      warnings: [],
    },
    vehicleRoster: [
      {
        vehicleId: 11,
        vehicleType: 'main_fund',
        vehicleSlug: 'main-fund',
        name: 'Main Fund',
        currency: 'USD',
      },
    ],
    positionRefs: [],
    positionComponentRefs: [],
    ownershipRefs: [],
    valuationRefs: [],
    observationRefs: [],
    openingAccountingState: null,
    capitalActuals: {
      ledgerCoverage: 'complete',
      committedCapital: availableMoney('100000000.000000'),
      calledCapitalIssued: unavailableMoney('CALL_NOTICE_NOT_IMPORTED'),
      paidInCapital: availableMoney('50000000.000000'),
      deployedCapital: availableMoney('40000000.000000'),
      initialDeployedCapital: availableMoney('40000000.000000'),
      followOnDeployedCapital: unavailableMoney(),
      secondaryDeployedCapital: unavailableMoney(),
      otherDeployedCapital: unavailableMoney(),
      managementFeesPaid: unavailableMoney(),
      otherExpensesPaid: unavailableMoney(),
      realizedFundProceeds: unavailableMoney(),
      distributionsToPartners: unavailableMoney(),
      recallableDistributions: unavailableMoney(),
      netCalledCapital: unavailableMoney('CALL_NOTICE_NOT_IMPORTED'),
      uncalledCapital: unavailableMoney('CALL_NOTICE_NOT_IMPORTED'),
      availableRecallCapacity: unavailableMoney('RECALL_LIFECYCLE_UNAVAILABLE'),
      portfolioFmv: availableMoney('55000000.000000'),
      fundCash: unavailableMoney(),
      otherAssets: unavailableMoney(),
      liabilities: unavailableMoney(),
      nav: unavailableMoney('NAV_UNAVAILABLE'),
      dpi: unavailableMoney('PAID_IN_ZERO'),
      rvpi: unavailableMoney('NAV_UNAVAILABLE'),
      tvpi: unavailableMoney('NAV_UNAVAILABLE'),
    },
    valuationActuals: {
      valuationDate: AS_OF_DATE,
      roster: [{ vehicleId: 11, companyId: 11 }],
      marks: [
        {
          markId: 501,
          vehicleId: 11,
          companyId: 11,
          positionFairValue: '55000000.000000',
          markSource: 'gp_estimate',
          confidenceLevel: 'high',
          externalRefHash: HASH_A,
        },
      ],
      coverage: 'complete',
      missingCompanyIds: [],
    },
    admissionReceiptCore: {
      contractVersion: 'actuals-pilot-publish-receipt/1.0.0',
      operationHash: HASH_A,
      fundId: FUND_ID,
      asOfDate: AS_OF_DATE,
      coverage: {
        ledger: 'inception_to_date',
        priorFactsSnapshotId: null,
        evidenceNote: 'Payload-5 consumer fixture.',
      },
      admitted: {
        ledger: {
          sourceArtifactId: 401,
          payloadSha256: HASH_B,
          canonicalRowsHash: HASH_C,
          previewHash: HASH_A,
          approvedRowIds: [601],
          approvedCount: 1,
        },
        valuation: {
          sourceArtifactId: 402,
          payloadSha256: HASH_B,
          canonicalRowsHash: HASH_C,
          previewHash: HASH_A,
          approvedMarkIds: [501],
          approvedCount: 1,
        },
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

  return payload;
}

export function financialFactsSnapshotV5(
  overrides: Partial<PersistedFinancialFactsSnapshotV1> = {}
): PersistedFinancialFactsSnapshotV1 {
  return PersistedFinancialFactsSnapshotV1Schema.parse({
    fundId: FUND_ID,
    asOfDate: AS_OF_DATE,
    knowledgeCutoff: KNOWLEDGE_CUTOFF,
    vehicleScope: 'fund_all',
    vehicleIds: [11],
    selectionSetHash: HASH_A,
    sourceFactsInputHash: HASH_C,
    snapshotInputHash: HASH_B,
    consumerEvaluations: [
      { consumer: 'forecast', status: 'accepted', reasons: [] },
      { consumer: 'reserve', status: 'accepted', reasons: [] },
    ],
    actorId: 7,
    createdAt: KNOWLEDGE_CUTOFF,
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
    payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
    payload: financialFactsPayloadV5(),
    ...overrides,
  });
}

export function financialFactsRowV5(id = 31): FinancialFactsSnapshot {
  const snapshot = financialFactsSnapshotV5();
  return {
    id,
    fundId: snapshot.fundId,
    policyVersion: snapshot.policyVersion,
    payloadSchemaId: snapshot.payloadSchemaId ?? FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
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
    idempotencyKey: `facts-${id}`,
    requestHash: HASH_A,
    supersedesSnapshotId: null,
    createdAt: new Date(snapshot.createdAt),
  };
}
