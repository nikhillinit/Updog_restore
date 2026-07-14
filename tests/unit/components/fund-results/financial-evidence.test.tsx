import { describe, expect, it } from 'vitest';

import {
  DUAL_FORECAST_CONTRACT_VERSION,
  DualForecastResponseSchema,
  type DualForecastResponse,
} from '@shared/contracts/dual-forecast/dual-forecast-response.contract';
import {
  FundScenarioComparisonV1Schema,
  type FundScenarioComparisonV1,
} from '@shared/contracts/fund-scenario-comparison-v1.contract';
import {
  FundMoicFactsBasisV1Schema,
  type FundMoicFactsBasisV1,
} from '@shared/contracts/fund-moic-v1.contract';
import {
  evidenceFromDualForecast,
  evidenceFromMoicBasis,
  evidenceFromScenarioComparison,
} from '@/components/fund-results/financial-evidence';

const INPUT_HASH = 'b'.repeat(64);
const FACTS_HASH = 'a'.repeat(64);

const COMPANY_WARNING = {
  code: 'PLANNING_FMV_STALE',
  severity: 'warning',
  message: 'Planning FMV is stale.',
} as const;

const FACTS_WARNING = {
  code: 'DATA_STALE',
  severity: 'info',
  message: 'Facts are one day old.',
} as const;

function dualForecastResponse(overrides: Partial<DualForecastResponse> = {}): DualForecastResponse {
  return DualForecastResponseSchema.parse({
    fundId: 1,
    fundName: 'Fund I',
    asOfDate: '2026-07-10',
    series: [],
    sources: {
      construction: 'construction_forecast_jcurve',
      current: 'projected_metrics_calculator',
      actual: 'actual_metrics_calculator',
    },
    config: {
      source: 'published',
      version: 3,
      publishedAt: '2026-07-01T00:00:00.000Z',
      fallbackReason: null,
    },
    actualsFacts: {
      asOfDate: '2026-07-10',
      generatedAt: '2026-07-10T12:00:00.000Z',
      inputHash: INPUT_HASH,
      companies: [
        {
          companyId: 11,
          companyName: 'Acme Corp',
          trustState: 'PARTIAL',
          planningFmvStatus: 'stale',
          currency: 'USD',
          currencyStatus: 'base_currency',
          activeRoundIds: [1],
          supersedeLineage: [],
          latestRoundDate: '2026-06-30',
          latestRoundValuation: '4000000',
          latestPlanningFmvDate: '2026-06-30',
          latestPlanningFmvValue: '5000000',
          warnings: [COMPANY_WARNING],
        },
      ],
      warnings: [FACTS_WARNING],
    },
    navAnchoring: {
      blendedNav: '1000000.00',
      countsByTrustState: { LIVE: 2, PARTIAL: 1, UNAVAILABLE: 0, FAILED: 0 },
      companies: [],
    },
    currentProjection: { status: 'projected', fallbackReason: null },
    warnings: ['legacy string warning, excluded from FinancialEvidence'],
    ...overrides,
  });
}

function trustCountsResponse(
  counts: Record<'LIVE' | 'PARTIAL' | 'UNAVAILABLE' | 'FAILED', number>
): DualForecastResponse {
  return dualForecastResponse({
    navAnchoring: {
      blendedNav: '1000000.00',
      countsByTrustState: counts,
      companies: [],
    },
  });
}

function metricMap() {
  return {
    lpNetIrr: 0.15,
    gpNetIrr: 0.1,
    totalManagementFees: 2_000_000,
    totalGpCarryDistributed: 500_000,
    totalGpFeeIncome: 2_000_000,
    finalDpi: 0.6,
    finalTvpi: 2.1,
    finalClawbackDue: 0,
  };
}

function comparison(overrides: Partial<FundScenarioComparisonV1> = {}): FundScenarioComparisonV1 {
  return FundScenarioComparisonV1Schema.parse({
    fundId: 1,
    comparisonStatus: 'comparable',
    unavailableReason: null,
    scenarioSet: {
      scenarioSetId: '00000000-0000-0000-0000-000000000111',
      name: 'Fee sensitivity',
      sourceConfigId: 12,
      sourceConfigVersion: 4,
    },
    baseline: { label: 'Authoritative baseline', metrics: metricMap() },
    variants: [],
    staleness: 'CURRENT',
    calculatedAt: '2026-05-26T12:30:00.000Z',
    ...overrides,
  });
}

function moicBasis(overrides: Partial<FundMoicFactsBasisV1> = {}): FundMoicFactsBasisV1 {
  return FundMoicFactsBasisV1Schema.parse({
    rankability: 'indicative',
    reasons: ['planning_fmv_stale'],
    observedInitialInvestment: '1000000.5',
    observedFollowOnInvestment: '250000',
    observedTotalInvestment: '1250000.5',
    valuationAnchor: {
      kind: 'planning_fmv',
      value: '4000000',
      asOfDate: '2026-07-12',
    },
    planningFmvStatus: 'stale',
    currencyStatus: 'base_currency',
    factsInputHash: FACTS_HASH,
    warnings: [COMPANY_WARNING],
    ...overrides,
  });
}

describe('evidenceFromDualForecast', () => {
  it('maps the aggregate response per the Adapter Mapping Policy', () => {
    // trustState: worst-state-wins over countsByTrustState (PARTIAL beats LIVE).
    // warnings: only the StructuredWarning-typed facts-level warnings; the
    // top-level string[] warnings are excluded from FinancialEvidence.
    expect(evidenceFromDualForecast(dualForecastResponse())).toEqual({
      source: 'published',
      asOfDate: '2026-07-10',
      contractVersion: String(DUAL_FORECAST_CONTRACT_VERSION),
      sourceVersion: '3',
      factsInputHash: INPUT_HASH,
      assumptionsHash: null,
      trustState: 'PARTIAL',
      currencyStatus: null,
      warnings: [FACTS_WARNING],
    });
  });

  it('applies worst-state-wins precedence FAILED > UNAVAILABLE > PARTIAL > LIVE', () => {
    expect(
      evidenceFromDualForecast(
        trustCountsResponse({ LIVE: 1, PARTIAL: 1, UNAVAILABLE: 1, FAILED: 1 })
      ).trustState
    ).toBe('FAILED');
    expect(
      evidenceFromDualForecast(
        trustCountsResponse({ LIVE: 1, PARTIAL: 1, UNAVAILABLE: 1, FAILED: 0 })
      ).trustState
    ).toBe('UNAVAILABLE');
    expect(
      evidenceFromDualForecast(
        trustCountsResponse({ LIVE: 3, PARTIAL: 0, UNAVAILABLE: 0, FAILED: 0 })
      ).trustState
    ).toBe('LIVE');
  });

  it('pins the all-zero counts case (valid empty universe) to UNAVAILABLE', () => {
    // AMENDMENT 8 ruling: an empty facts universe has no trusted dataset.
    expect(
      evidenceFromDualForecast(
        trustCountsResponse({ LIVE: 0, PARTIAL: 0, UNAVAILABLE: 0, FAILED: 0 })
      ).trustState
    ).toBe('UNAVAILABLE');
  });

  it('stringifies a numeric config version and nulls an absent one', () => {
    expect(evidenceFromDualForecast(dualForecastResponse()).sourceVersion).toBe('3');
    const legacy = dualForecastResponse({
      config: {
        source: 'legacy_default_no_published_config',
        version: null,
        publishedAt: null,
        fallbackReason: 'no published config',
      },
    });
    const evidence = evidenceFromDualForecast(legacy);
    expect(evidence.sourceVersion).toBeNull();
    expect(evidence.source).toBe('legacy_default_no_published_config');
  });

  it('maps navAnchoring null (facts fetch failure) to trustState FAILED', () => {
    // AMENDMENT 6 ratified fallback: contract-documented facts-fetch-failure case.
    const failed = dualForecastResponse({ actualsFacts: null, navAnchoring: null });
    const evidence = evidenceFromDualForecast(failed);
    expect(evidence.trustState).toBe('FAILED');
    expect(evidence.factsInputHash).toBeNull();
    expect(evidence.warnings).toEqual([]);
  });

  it('keeps worst-state-wins when actualsFacts is null but navAnchoring is present', () => {
    // AMENDMENT 6 ratified fallback: hash fields null, trust state as normal.
    const partialFacts = dualForecastResponse({ actualsFacts: null });
    const evidence = evidenceFromDualForecast(partialFacts);
    expect(evidence.trustState).toBe('PARTIAL');
    expect(evidence.factsInputHash).toBeNull();
    expect(evidence.warnings).toEqual([]);
  });

  it('maps the company overload from that company facts entry', () => {
    expect(evidenceFromDualForecast(dualForecastResponse(), 11)).toEqual({
      source: 'published',
      asOfDate: '2026-07-10',
      contractVersion: String(DUAL_FORECAST_CONTRACT_VERSION),
      sourceVersion: '3',
      factsInputHash: INPUT_HASH,
      assumptionsHash: null,
      trustState: 'PARTIAL',
      currencyStatus: 'base_currency',
      warnings: [COMPANY_WARNING],
    });
  });

  it('maps a companyId with no matching company to UNAVAILABLE with null fields', () => {
    // AMENDMENT 6 ratified fallback.
    const evidence = evidenceFromDualForecast(dualForecastResponse(), 99);
    expect(evidence.trustState).toBe('UNAVAILABLE');
    expect(evidence.currencyStatus).toBeNull();
    expect(evidence.factsInputHash).toBeNull();
    expect(evidence.warnings).toEqual([]);
  });
});

describe('evidenceFromScenarioComparison', () => {
  it('maps a comparable comparison per the Adapter Mapping Policy', () => {
    const comparable = comparison();
    expect(evidenceFromScenarioComparison(comparable, comparable.staleness)).toEqual({
      source: 'scenario_comparison',
      asOfDate: null,
      contractVersion: 'fund-scenario-comparison-v1',
      sourceVersion: '4',
      factsInputHash: null,
      assumptionsHash: null,
      trustState: 'CURRENT',
      currencyStatus: null,
      warnings: [],
    });
  });

  it('resolves the object staleness form to its state', () => {
    const stale = comparison({
      staleness: {
        state: 'STALE_PUBLISH',
        sourceConfigVersion: 4,
        currentPublishedConfigVersion: 6,
      },
    });
    expect(evidenceFromScenarioComparison(stale, stale.staleness).trustState).toBe('STALE_PUBLISH');
  });

  it('reads UNAVAILABLE for a non-comparable comparison', () => {
    const unavailable = comparison({
      comparisonStatus: 'baseline_unavailable',
      baseline: null,
      staleness: null,
      calculatedAt: null,
    });
    expect(evidenceFromScenarioComparison(unavailable, null).trustState).toBe('UNAVAILABLE');
  });
});

describe('evidenceFromMoicBasis', () => {
  it('maps the facts basis per the Adapter Mapping Policy', () => {
    // trustState: the basis contract's own rankability state field.
    const basis = moicBasis();
    expect(evidenceFromMoicBasis(basis)).toEqual({
      source: 'fund_moic_facts',
      asOfDate: null,
      contractVersion: 'fund-moic-v1',
      sourceVersion: null,
      factsInputHash: FACTS_HASH,
      assumptionsHash: null,
      trustState: 'indicative',
      currencyStatus: 'base_currency',
      warnings: [COMPANY_WARNING],
    });
  });

  it('carries a null facts input hash and each rankability verbatim', () => {
    const basis = moicBasis({
      rankability: 'not_actionable',
      reasons: ['valuation_unavailable'],
      factsInputHash: null,
      warnings: [],
    });
    const evidence = evidenceFromMoicBasis(basis);
    expect(evidence.trustState).toBe('not_actionable');
    expect(evidence.factsInputHash).toBeNull();
    expect(evidence.warnings).toEqual([]);
  });
});
