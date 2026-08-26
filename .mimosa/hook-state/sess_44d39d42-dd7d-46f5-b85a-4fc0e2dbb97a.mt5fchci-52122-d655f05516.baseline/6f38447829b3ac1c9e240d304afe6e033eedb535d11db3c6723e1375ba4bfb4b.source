import {
  DynamicReserveIntelligenceRunV1Schema,
  type DynamicReserveIntelligenceRunV1,
} from '../../../shared/contracts/dynamic-reserve-intelligence-v1.contract';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

type PolicyVersion =
  | 'financial-facts-policy/1.0.1'
  | 'financial-facts-policy/1.1.0'
  | 'financial-facts-policy/1.2.0'
  | 'financial-facts-policy/1.3.0';

function companyFact(companyId: number, companyName: string, withWarning: boolean) {
  const warnings = withWarning
    ? [
        {
          code: 'PLANNING_FMV_STALE',
          severity: 'warning',
          message: `${companyName} planning FMV is stale.`,
        },
      ]
    : [];

  return {
    fundId: 7,
    companyId,
    companyName,
    investmentIds: [companyId + 100],
    activeRoundIds: [companyId + 200],
    approvedPlanningFmvMarkId: null,
    planningFmvStatus: withWarning ? 'stale' : 'active',
    initialInvestmentAmount: '1000000.000000',
    followOnInvestmentAmount: '250000.000000',
    amountOnlyNonEquityAmount: '0.000000',
    latestRoundDate: '2026-06-01',
    latestRoundValuation: '10000000.000000',
    latestPlanningFmvDate: '2026-07-15',
    latestPlanningFmvValue: '12000000.000000',
    currency: 'USD',
    currencyStatus: 'base_currency',
    supersedeLineage: [{ roundId: companyId + 200, supersedesRoundId: null }],
    warnings,
    provenance: withWarning
      ? {
          trustState: 'PARTIAL',
          core: {
            sourceKind: 'computed',
            actionability: 'input_only',
            sourceEngine: 'rounds-to-model',
            engineVersion: '1.0.0',
            inputHash: HASH_A,
            assumptionsHash: HASH_B,
            isFinanciallyActionable: false,
            warnings: [],
          },
          structuredWarnings: warnings,
        }
      : {
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
    inputHash: companyId === 11 ? HASH_A : HASH_B,
  };
}

function sharedFactsPayload() {
  return {
    companyActuals: {
      fundId: 7,
      asOfDate: '2026-07-29',
      facts: [companyFact(11, 'Alpha', true), companyFact(12, 'Beta', false)],
      inputHash: HASH_A,
    },
    sourceObservationIds: [101],
    workingValueSelectionIds: [201],
    cashFlowSeries: {
      series: [],
      totals: {
        contributions: '1000000.000000',
        distributions: '250000.000000',
        recallableDistributions: '0.000000',
      },
      warnings: [
        {
          code: 'NON_USD_CASH_FLOW_EXCLUDED',
          severity: 'warning',
          message: 'One non-USD cash flow was excluded.',
        },
      ],
    },
    marksSeries: {
      marks: [],
      periodNav: [
        {
          periodEnd: '2026-06-30',
          nav: '12000000.000000',
          warnings: [
            {
              code: 'VALUATION_MARK_STALE',
              severity: 'warning',
              message: 'Quarter-end NAV contains a stale mark.',
            },
          ],
        },
      ],
      warnings: [
        {
          code: 'VALUATION_MARK_STALE',
          severity: 'warning',
          message: 'One valuation mark is stale.',
        },
      ],
    },
    vehicleRoster: [],
  };
}

function factsSnapshot(policyVersion: PolicyVersion) {
  const common = {
    fundId: 7,
    asOfDate: '2026-07-29',
    knowledgeCutoff: '2026-07-29T19:00:00.000Z',
    vehicleScope: 'fund_all',
    vehicleIds: [1],
    selectionSetHash: HASH_A,
    sourceFactsInputHash: HASH_B,
    snapshotInputHash: HASH_C,
    actorId: 17,
    createdAt: '2026-07-29T19:05:00.000Z',
  };

  if (policyVersion === 'financial-facts-policy/1.0.1') {
    return {
      ...common,
      policyVersion,
      payloadSchemaId: 'financial-facts-payload/1',
      consumerEvaluations: [
        {
          consumer: 'reserve',
          status: 'blocked',
          reasons: ['working_value_selection_deviation'],
        },
      ],
      payload: {
        ...sharedFactsPayload(),
        participationTermRefs: [],
      },
    };
  }

  return {
    ...common,
    policyVersion,
    payloadSchemaId:
      policyVersion === 'financial-facts-policy/1.3.0'
        ? 'financial-facts-payload/4'
        : policyVersion === 'financial-facts-policy/1.2.0'
          ? 'financial-facts-payload/3'
          : 'financial-facts-payload/2',
    consumerEvaluations: [
      {
        consumer: 'reserve',
        status: 'blocked',
        reasons: ['working_value_selection_deviation', 'mixed_term_versions'],
        details: [
          {
            code: 'working_value_selection_deviation',
            companyIds: [11],
            message: 'Reserve selection differs from the default working value.',
          },
        ],
      },
    ],
    payload: {
      ...sharedFactsPayload(),
      ...(policyVersion === 'financial-facts-policy/1.2.0' ||
      policyVersion === 'financial-facts-policy/1.3.0'
        ? { openingAccountingState: null }
        : {}),
      positionRefs: [],
      positionComponentRefs: [
        {
          vehicleId: 1,
          companyIdentityId: 501,
          kind: 'priced',
          participationId: 701,
          participationVersion: 2,
          financingTrancheId: 801,
          trancheVersion: 3,
        },
      ],
      ownershipRefs: [],
      valuationRefs: [
        {
          basis: 'derived',
          vehicleId: 1,
          companyIdentityId: 501,
          directMarkId: null,
          directSourceObservationId: null,
          ownershipSnapshotId: 901,
          derivedTrancheId: 801,
          derivedTrancheVersion: 3,
          derivedParticipationId: 701,
          derivedParticipationVersion: 2,
        },
      ],
      participationTermRefs: [
        {
          participationId: 701,
          participationVersion: 2,
          financingTrancheId: 801,
          trancheVersion: 3,
        },
      ],
      observationRefs: [
        {
          observationId: 101,
          domain: 'participation_terms',
          status: 'accepted',
          effectiveDate: '2026-07-15',
        },
      ],
    },
  };
}

export function makeReserveIntelligenceRun(
  policyVersion: PolicyVersion = 'financial-facts-policy/1.1.0'
): DynamicReserveIntelligenceRunV1 {
  return DynamicReserveIntelligenceRunV1Schema.parse({
    snapshotId: 41,
    createdAt: '2026-07-29T20:00:00.000Z',
    result: {
      contractVersion: 'dynamic-reserve-intelligence-v1',
      fundId: 7,
      actionability: 'non_actionable',
      companies: [
        {
          companyId: 11,
          name: 'Alpha',
          canonicalStage: 'seed',
          status: 'actionable',
          rank: 1,
          marginalMoic: '2.5',
          systemAllocatedCents: 750_000,
          overlayPlannedCents: 700_000,
          deltaCents: -50_000,
          concentration: '0.75',
        },
        {
          companyId: 12,
          name: 'Beta',
          canonicalStage: 'series_a',
          status: 'indicative',
          rank: 2,
          marginalMoic: '1.25',
          systemAllocatedCents: 250_000,
          overlayPlannedCents: 300_000,
          deltaCents: 50_000,
          concentration: '0.25',
        },
        {
          companyId: 13,
          name: 'Gamma',
          canonicalStage: 'series_b',
          status: 'unavailable',
          rank: null,
          marginalMoic: null,
          systemAllocatedCents: 0,
          overlayPlannedCents: null,
          deltaCents: null,
          concentration: null,
        },
      ],
      fund: {
        totalSystemAllocatedCents: 1_000_000,
        totalOverlayPlannedCents: 1_000_000,
        totalDeltaCents: 0,
        followOnCapacityCents: 2_000_000,
        failSafe: true,
        failSafeReason: 'envelope_untrusted',
        excluded: [
          { companyId: 12, reason: 'indicative' },
          { companyId: 13, reason: 'unavailable' },
        ],
        disclosedDefaults: ['maxPerCompany:Infinity'],
        neutralPolicies: [{ stage: 'seed', reserveMultiple: 1, weight: 1 }],
      },
      constraintFindings: [{ code: 'overlay_unknown_company', companyId: 99 }],
      provenance: {
        financialFactsSnapshotId: 31,
        factsInputHash: HASH_A,
        assumptionsHash: HASH_B,
        envelopeInputHash: HASH_C,
        effectiveMode: 'shadow',
        h9Actionability: 'input_only',
        overlayProvenance: {
          suppliedBy: 17,
          suppliedAt: '2026-07-29T19:30:00.000Z',
        },
        overlay: [
          { companyId: 11, plannedReserveCents: 700_000 },
          { companyId: 12, plannedReserveCents: 300_000 },
        ],
        idempotencyKey: 'reserve-run-31',
        requestHash: HASH_A,
        calcVersion: 'reserve-intel-v1',
        asOfDate: '2026-07-29',
        factsSnapshot: factsSnapshot(policyVersion),
        marginalNonFactsSources: {
          sourceSnapshotDate: '2026-07-29',
          baseCurrency: 'USD',
          companies: [],
          approvedAllocations: [
            {
              companyId: 11,
              decisionType: 'follow_on',
              decisionStatus: 'approved',
              finalPlannedReservesCents: '700000',
              liveAllocationVersion: 3,
              decidedAt: '2026-07-28T00:00:00.000Z',
              updatedAt: '2026-07-28T00:00:00.000Z',
            },
          ],
          publishedAssumptions: null,
        },
        envelopeSources: {
          fund: {
            sizeDollars: '100000000',
            deployedCapitalDollars: '50000000',
            managementFeeRate: '0.02',
            baseCurrency: 'USD',
          },
          investments: [],
          config: null,
        },
      },
    },
  });
}

export const RESERVE_FACTS_HASH = HASH_C;
