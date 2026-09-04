import { describe, expect, it } from 'vitest';

import {
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
  FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
  FinancialFactsPayloadV5Schema,
  type FinancialFactsPayloadV5,
} from '../../../../shared/contracts/financial-facts-snapshot-v1.contract';
import { ConsumerEvaluationV3Schema } from '../../../../shared/contracts/financial-facts-consumer-policies';
import { evaluatePayload5Consumers } from '../../../../shared/lib/financial-facts/payload5-consumer-evaluator';

const AS_OF_DATE = '2026-09-04';
const KNOWLEDGE_CUTOFF = '2026-09-04T12:00:00.000Z';

const CAPITAL_MONEY_FIELDS = [
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
] as const;

const CAPITAL_RATIO_FIELDS = ['dpi', 'rvpi', 'tvpi'] as const;

function unavailableValue() {
  return {
    value: null,
    availability: 'unavailable',
    reasonCodes: ['SOURCE_NOT_SUPPLIED'],
    sourceRefs: [],
  };
}

function capitalActuals(ledgerCoverage: 'complete' | 'partial') {
  return {
    ledgerCoverage,
    ...Object.fromEntries(CAPITAL_MONEY_FIELDS.map((field) => [field, unavailableValue()])),
    ...Object.fromEntries(CAPITAL_RATIO_FIELDS.map((field) => [field, unavailableValue()])),
  };
}

function companyFact(companyId: number, investmentIds: number[]) {
  return {
    fundId: 10,
    companyId,
    companyName: `Company ${companyId}`,
    investmentIds,
    activeRoundIds: [],
    approvedPlanningFmvMarkId: null,
    planningFmvStatus: 'none',
    initialInvestmentAmount: '0.000000',
    followOnInvestmentAmount: '0.000000',
    amountOnlyNonEquityAmount: '0.000000',
    latestRoundDate: null,
    latestRoundValuation: null,
    latestPlanningFmvDate: null,
    latestPlanningFmvValue: null,
    currency: 'USD',
    currencyStatus: 'base_currency',
    supersedeLineage: [],
    warnings: [],
    provenance: {
      trustState: 'LIVE',
      core: {
        sourceKind: 'computed',
        actionability: 'actionable',
        sourceEngine: 'payload5-consumer-evaluator-test',
        engineVersion: '1.0.0',
        inputHash: 'b'.repeat(64),
        assumptionsHash: 'c'.repeat(64),
        isFinanciallyActionable: true,
        warnings: [],
      },
      structuredWarnings: [],
    },
    inputHash: 'd'.repeat(64),
  };
}

type PayloadFixtureOptions = {
  ledgerCoverage?: 'complete' | 'partial';
  valuationCoverage?: 'complete' | 'partial' | 'not_supplied';
  periodNav?: boolean;
  rosterCompanyIds?: number[];
  investmentIdsByCompany?: Record<number, number[]>;
};

function payloadV5(options: PayloadFixtureOptions = {}): FinancialFactsPayloadV5 {
  const rosterCompanyIds = options.rosterCompanyIds ?? [101, 102];
  const investmentIdsByCompany =
    options.investmentIdsByCompany ??
    Object.fromEntries(rosterCompanyIds.map((companyId, index) => [companyId, [1001 + index]]));
  const valuationRoster = rosterCompanyIds.map((companyId) => ({ vehicleId: 11, companyId }));
  const marks = rosterCompanyIds.map((companyId, index) => ({
    markId: 200 + index,
    vehicleId: 11,
    companyId,
    positionFairValue: '10.000000',
    markSource: 'fixture',
    confidenceLevel: 'high' as const,
    externalRefHash: 'e'.repeat(64),
  }));

  return FinancialFactsPayloadV5Schema.parse({
    companyActuals: {
      fundId: 10,
      asOfDate: AS_OF_DATE,
      facts: rosterCompanyIds.map((companyId) =>
        companyFact(companyId, investmentIdsByCompany[companyId] ?? [])
      ),
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
    marksSeries: {
      marks: marks.map(({ markId, companyId, vehicleId }) => ({
        markId,
        companyId,
        vehicleId,
        effectiveAt: AS_OF_DATE,
        fairValue: '10.000000',
        currency: 'USD',
      })),
      periodNav: options.periodNav === false
        ? []
        : [{ periodEnd: AS_OF_DATE, nav: '20.000000', warnings: [] }],
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
    capitalActuals: capitalActuals(options.ledgerCoverage ?? 'complete'),
    valuationActuals: {
      valuationDate: options.valuationCoverage === 'not_supplied' ? null : AS_OF_DATE,
      roster: valuationRoster,
      marks,
      coverage: options.valuationCoverage ?? 'complete',
      missingCompanyIds:
        options.valuationCoverage === 'complete' || options.valuationCoverage === undefined
          ? []
          : rosterCompanyIds,
    },
    admissionReceiptCore: {
      contractVersion: 'actuals-pilot-publish-receipt/1.0.0',
      operationHash: 'f'.repeat(64),
      fundId: 10,
      asOfDate: AS_OF_DATE,
      coverage: {
        ledger: 'inception_to_date',
        priorFactsSnapshotId: null,
        evidenceNote: 'Payload 5 evaluator fixture.',
      },
      admitted: {
        ledger: {
          sourceArtifactId: 1,
          payloadSha256: '1'.repeat(64),
          canonicalRowsHash: '2'.repeat(64),
          previewHash: '3'.repeat(64),
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

function evaluate(payload: FinancialFactsPayloadV5) {
  return ConsumerEvaluationV3Schema.array().parse(evaluatePayload5Consumers(payload));
}

function evaluationFor(
  evaluations: ReturnType<typeof evaluate>,
  consumer: 'forecast' | 'reserve' | 'economics' | 'periodic_analysis'
) {
  const evaluation = evaluations.find((candidate) => candidate.consumer === consumer);
  expect(evaluation).toBeDefined();
  return evaluation!;
}

describe('evaluatePayload5Consumers', () => {
  it('accepts forecast and reserve under complete coverage', () => {
    const evaluations = evaluate(payloadV5());

    expect(evaluationFor(evaluations, 'forecast')).toEqual({
      consumer: 'forecast',
      status: 'accepted',
      reasons: [],
    });
    expect(evaluationFor(evaluations, 'reserve')).toEqual({
      consumer: 'reserve',
      status: 'accepted',
      reasons: [],
    });
  });

  it.each([
    ['ledger coverage', { ledgerCoverage: 'partial' }, 'ledger_coverage_partial'],
    ['valuation coverage', { valuationCoverage: 'partial' }, 'position_valuation_incomplete'],
    ['period NAV', { periodNav: false }, 'period_nav_unavailable'],
  ] as const)('blocks forecast when %s is unavailable', (_name, options, reason) => {
    expect(evaluationFor(evaluate(payloadV5(options)), 'forecast')).toEqual({
      consumer: 'forecast',
      status: 'blocked',
      reasons: [reason],
    });
  });

  it('blocks reserve for incomplete valuation coverage', () => {
    expect(
      evaluationFor(evaluate(payloadV5({ valuationCoverage: 'not_supplied' })), 'reserve')
    ).toEqual({
      consumer: 'reserve',
      status: 'blocked',
      reasons: ['position_valuation_incomplete'],
    });
  });

  it('blocks reserve with details naming roster companies without investment lineage', () => {
    expect(
      evaluationFor(
        evaluate(
          payloadV5({
            rosterCompanyIds: [102, 101],
            investmentIdsByCompany: { 101: [], 102: [] },
          })
        ),
        'reserve'
      )
    ).toEqual({
      consumer: 'reserve',
      status: 'blocked',
      reasons: ['investment_lineage_unresolved'],
      details: [
        {
          code: 'investment_lineage_unresolved',
          companyIds: [101, 102],
        },
      ],
    });
  });

  it('always blocks economics and periodic analysis for payload 5', () => {
    const evaluations = evaluate(payloadV5());

    for (const consumer of ['economics', 'periodic_analysis'] as const) {
      expect(evaluationFor(evaluations, consumer)).toEqual({
        consumer,
        status: 'blocked',
        reasons: ['unsupported_payload_policy'],
      });
    }
  });
});
