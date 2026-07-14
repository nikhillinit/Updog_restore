/**
 * Pure derivation tests for the Summary cross-surface readiness rollup
 * (Plan 9 Wave 9B2, D-H). Pins every state mapping including error / empty /
 * loading, deterministic reason ordering, fail-closed precedence, and the
 * pre-decided static Reports row. Fixtures parse with the real Zod contracts
 * where they exist (dual forecast, MOIC rankings v2, scenarios section);
 * AllocationsResponse has no Zod contract (client TS interface only).
 */

import { describe, expect, it } from 'vitest';
import {
  DualForecastResponseSchema,
  type DualForecastResponse,
} from '../../../../shared/contracts/dual-forecast/dual-forecast-response.contract';
import {
  FundMoicRankingsResponseV2Schema,
  type FundMoicRankingsResponseV2,
} from '../../../../shared/contracts/fund-moic-v2.contract';
import { ScenariosSectionSchema } from '../../../../shared/contracts/fund-results-v1.contract';
import type { AllocationsResponse } from '../../../../client/src/components/portfolio/tabs/types';
import {
  deriveReadinessRollup,
  type ReadinessRollupInputs,
  type ReadinessRollupRow,
  type ReadinessSourceInput,
  type ScenariosSection,
} from '../../../../client/src/pages/fund-model-results/readiness-rollup';

// ── Fixtures (contract-parsed where a contract exists) ──

function dualForecastFixture(overrides: Partial<DualForecastResponse> = {}): DualForecastResponse {
  return DualForecastResponseSchema.parse({
    fundId: 42,
    fundName: 'Fund 42',
    asOfDate: '2026-07-01',
    series: [],
    sources: {
      construction: 'construction_forecast_jcurve',
      current: 'projected_metrics_calculator',
      actual: 'actual_metrics_calculator',
    },
    config: {
      source: 'published',
      version: 3,
      publishedAt: '2026-06-01T00:00:00.000Z',
      fallbackReason: null,
    },
    actualsFacts: {
      asOfDate: '2026-07-01',
      generatedAt: '2026-07-01T00:00:00.000Z',
      inputHash: 'a'.repeat(64),
      companies: [],
      warnings: [],
    },
    navAnchoring: {
      blendedNav: '100.00',
      countsByTrustState: { LIVE: 2, PARTIAL: 0, UNAVAILABLE: 0, FAILED: 0 },
      companies: [],
    },
    currentProjection: { status: 'projected', fallbackReason: null },
    warnings: [],
    ...overrides,
  });
}

function moicRanking(
  rank: number,
  rankability: 'actionable' | 'indicative' | 'not_actionable' | null,
  anchorAsOfDate: string | null = '2026-06-30'
) {
  return {
    rank,
    investmentId: `inv-${rank}`,
    investmentName: `Company ${rank}`,
    reservesMoic: { value: 1.5, description: 'Reserves MOIC', formula: 'proceeds / reserves' },
    factsBasis:
      rankability === null
        ? null
        : {
            rankability,
            reasons: [],
            observedInitialInvestment: '100',
            observedFollowOnInvestment: '0',
            observedTotalInvestment: '100',
            valuationAnchor: { kind: 'planning_fmv', value: '200', asOfDate: anchorAsOfDate },
            planningFmvStatus: 'active',
            currencyStatus: 'base_currency',
            factsInputHash: 'b'.repeat(64),
            warnings: [],
          },
  };
}

function moicFixture(rankings: ReturnType<typeof moicRanking>[]): FundMoicRankingsResponseV2 {
  return FundMoicRankingsResponseV2Schema.parse({
    contractVersion: '2.1.0',
    fundId: 42,
    rankings,
    provenance: { mode: 'legacy', warnings: [] },
    latestReconciliation: null,
    materiality: { status: 'not_run', candidateMaterial: false, epsilon: 1e-8 },
    modePreview: {
      calculationKey: 'fund_moic_rankings_exit_probability',
      configuredMode: 'off',
      effectiveMode: 'off',
      killSwitchActive: false,
      shadowStartedAt: null,
      eligibleAt: null,
      residencyDaysRequired: 7,
      residencyStatus: 'not_applicable',
      currentSourceMatchesAccepted: true,
      unreconciledEditsPresent: false,
      blockers: [],
      version: 0,
    },
    moicInputSummary: {
      sourceVersion: 'moic-round-fmv-facts-v2',
      explicitExitProbabilityCount: 0,
      defaultedExitProbabilityCount: 0,
      activationBlockingDefaultedExitProbabilityCount: 0,
      explicitReserveExitMultipleCount: 0,
      defaultedReserveExitMultipleCount: 0,
      activationBlockingDefaultedReserveExitMultipleCount: 0,
    },
    actualsProvenanceSummary: {
      factsStatus: 'available',
      factsInputHash: null,
      companyCount: 0,
      trustStateCounts: { LIVE: 0, PARTIAL: 0, UNAVAILABLE: 0, FAILED: 0 },
      defaultedEconomicInputCount: 0,
      warnings: [],
    },
    roundEvidenceSummary: { activeRoundCount: 0, activeOverrideCount: 0, warningCodes: [] },
    generatedAt: '2026-07-01T00:00:00.000Z',
  });
}

function allocationsFixture(
  drift: Partial<AllocationsResponse['metadata']['actuals_drift_summary']> = {}
): AllocationsResponse {
  return {
    companies: [],
    metadata: {
      total_planned_cents: 0,
      total_deployed_cents: 0,
      companies_count: 0,
      last_updated_at: null,
      actuals_drift_summary: {
        facts_status: 'available',
        drifted_company_count: 0,
        material_company_count: 0,
        degraded_company_count: 0,
        facts_input_hash: null,
        as_of_date: '2026-07-02',
        ...drift,
      },
    },
  };
}

let scenarioSetSequence = 0;

function scenarioSet(
  staleness:
    'CURRENT' | 'STALE_PUBLISH' | 'STALE_CONFIG' | 'CALCULATING' | 'FAILED' | 'UNAVAILABLE',
  calculatedAt = '2026-06-15T12:00:00.000Z'
) {
  scenarioSetSequence += 1;
  const suffix = String(scenarioSetSequence).padStart(12, '0');
  return {
    scenarioSetId: `00000000-0000-4000-8000-${suffix}`,
    name: `Set ${scenarioSetSequence}`,
    calculationMode: 'async_reserve_allocation',
    sourceConfigId: 1,
    sourceConfigVersion: 1,
    currentPublishedConfigVersion: 1,
    calculatedAt,
    staleness,
    variantCount: 1,
    variants: [
      {
        variantId: `00000000-0000-4000-9000-${suffix}`,
        name: 'Variant',
        overrideType: 'reserve_allocation',
        reserveSummary: {
          totalScenarioAllocationCents: 0,
          totalAllocationDeltaCents: 0,
          avgConfidence: 0.5,
          highConfidenceCount: 0,
          warningCount: 0,
        },
      },
    ],
  };
}

function scenariosAvailable(sets: ReturnType<typeof scenarioSet>[]): ScenariosSection {
  return ScenariosSectionSchema.parse({
    status: 'available',
    source: 'fund_snapshots',
    calculatedAt: null,
    payload: { version: 'fund-scenarios-v1', aggregateStaleness: 'CURRENT', sets },
  });
}

function scenariosUnavailable(
  reasonCode: 'SCENARIOS_NONE_EXIST' | 'SCENARIOS_NONE_CALCULATED' | 'SCENARIOS_LOAD_FAILED',
  reason = 'No scenario data'
): ScenariosSection {
  return ScenariosSectionSchema.parse({ status: 'unavailable', reason, reasonCode });
}

function data<T>(value: T): ReadinessSourceInput<T> {
  return { kind: 'data', data: value };
}

const LOADING: ReadinessSourceInput<never> = { kind: 'loading' };

function errorInput(message: string | null): ReadinessSourceInput<never> {
  return { kind: 'error', message };
}

function baseInputs(overrides: Partial<ReadinessRollupInputs> = {}): ReadinessRollupInputs {
  return {
    fundId: '42',
    forecast: data(dualForecastFixture()),
    portfolioActuals: data(allocationsFixture()),
    reserves: data(moicFixture([moicRanking(1, 'actionable')])),
    scenarios: data(scenariosAvailable([scenarioSet('CURRENT')])),
    ...overrides,
  };
}

function rowByKey(inputs: ReadinessRollupInputs, key: ReadinessRollupRow['key']) {
  const row = deriveReadinessRollup(inputs).rows.find((candidate) => candidate.key === key);
  if (row === undefined) throw new Error(`missing row ${key}`);
  return row;
}

// ── Shape / links ──

describe('deriveReadinessRollup shape', () => {
  it('always yields the five surface rows in workspace order with fund-carrying hrefs', () => {
    const model = deriveReadinessRollup(baseInputs());

    expect(model.surfaceCount).toBe(5);
    expect(model.rows.map((row) => [row.key, row.label, row.href])).toEqual([
      ['forecast', 'Forecast', '/financial-modeling?fundId=42'],
      ['portfolio-actuals', 'Portfolio Actuals', '/portfolio?tab=reserve-planning&fundId=42'],
      ['reserves', 'Reserves', '/fund-model-results/42/moic-analysis'],
      ['scenarios', 'Scenarios', '/fund-model-results/42/scenarios'],
      ['reports', 'Reports', '/fund-model-results/42/reports'],
    ]);
  });

  it('gates fund-scoped links with the workspace reason when no fund resolves', () => {
    const model = deriveReadinessRollup(
      baseInputs({
        fundId: null,
        forecast: errorInput('No fund is resolved on this route'),
        portfolioActuals: errorInput('No fund is resolved on this route'),
        reserves: errorInput('No fund is resolved on this route'),
        scenarios: errorInput('No fund is resolved on this route'),
      })
    );

    const byKey = new Map(model.rows.map((row) => [row.key, row]));
    for (const key of ['reserves', 'scenarios', 'reports'] as const) {
      expect(byKey.get(key)?.href).toBeNull();
      expect(byKey.get(key)?.hrefDisabledReason).toBe('Select a fund to open this view');
    }
    // Non-fund-scoped destinations stay live links (D-C: never dead links).
    expect(byKey.get('forecast')?.href).toBe('/financial-modeling');
    expect(byKey.get('portfolio-actuals')?.href).toBe('/portfolio?tab=reserve-planning');
    // Every data row fails closed.
    expect(model.rows.every((row) => row.state === 'not_actionable')).toBe(true);
    expect(model.blockedCount).toBe(5);
  });

  it('counts only non-loading not_actionable rows as blocked', () => {
    const model = deriveReadinessRollup(
      baseInputs({
        forecast: LOADING,
        portfolioActuals: LOADING,
        reserves: LOADING,
        scenarios: LOADING,
      })
    );

    const loadingRows = model.rows.filter((row) => row.loading);
    expect(loadingRows.map((row) => row.key)).toEqual([
      'forecast',
      'portfolio-actuals',
      'reserves',
      'scenarios',
    ]);
    // Loading rows still read not_actionable (fail-closed) but never count.
    expect(loadingRows.every((row) => row.state === 'not_actionable')).toBe(true);
    expect(model.blockedCount).toBe(1); // the static Reports row only
  });

  it('marks every errored row Facts unavailable with the short cause', () => {
    const model = deriveReadinessRollup(
      baseInputs({
        forecast: errorInput('HTTP 500'),
        portfolioActuals: errorInput(null),
        reserves: errorInput('rankings boom'),
        scenarios: errorInput('Fund not found'),
      })
    );

    for (const row of model.rows.filter((candidate) => candidate.key !== 'reports')) {
      expect(row.state).toBe('not_actionable');
      expect(row.stateLabel).toBe('Facts unavailable');
    }
    expect(model.rows.find((row) => row.key === 'forecast')?.primaryReason).toBe('HTTP 500');
    expect(model.rows.find((row) => row.key === 'portfolio-actuals')?.primaryReason).toBe(
      'The allocations read failed'
    );
    expect(model.blockedCount).toBe(5);
  });
});

// ── Reports (static pre-decision) ──

describe('reports row', () => {
  it('is the honest static not-verified state and never claims export readiness', () => {
    const row = rowByKey(baseInputs(), 'reports');

    expect(row.state).toBe('not_actionable');
    expect(row.stateLabel).toBe('Not verified');
    expect(row.primaryReason).toBe('Qualification is verified on the Reports surface');
    expect(row.asOfDate).toBeNull();
    expect(row.href).toBe('/fund-model-results/42/reports');
    expect(row.loading).toBe(false);
  });
});

// ── Forecast ──

describe('forecast row', () => {
  it('is actionable with the as-of date when facts are live and the projection is real', () => {
    const row = rowByKey(baseInputs(), 'forecast');

    expect(row.state).toBe('actionable');
    expect(row.primaryReason).toBeNull();
    expect(row.asOfDate).toBe('2026-07-01');
  });

  it('fails closed to Facts unavailable when the facts fetch failed (null blocks)', () => {
    const inputs = baseInputs({
      forecast: data(
        dualForecastFixture({
          actualsFacts: null,
          navAnchoring: null,
          warnings: ['actuals facts fetch failed', 'second warning'],
        })
      ),
    });
    const row = rowByKey(inputs, 'forecast');

    expect(row.state).toBe('not_actionable');
    expect(row.stateLabel).toBe('Facts unavailable');
    expect(row.primaryReason).toBe('actuals facts fetch failed');
    expect(row.details).toEqual(['actuals facts fetch failed', 'second warning']);
  });

  it('reads failed company facts as not actionable ahead of any softer signal', () => {
    const inputs = baseInputs({
      forecast: data(
        dualForecastFixture({
          navAnchoring: {
            blendedNav: '100.00',
            countsByTrustState: { LIVE: 1, PARTIAL: 1, UNAVAILABLE: 0, FAILED: 2 },
            companies: [],
          },
          currentProjection: { status: 'fallback_default', fallbackReason: 'engine failed' },
        })
      ),
    });
    const row = rowByKey(inputs, 'forecast');

    expect(row.state).toBe('not_actionable');
    expect(row.stateLabel).toBe('Facts unavailable');
    expect(row.primaryReason).toBe('2 of 4 companies have failed facts');
  });

  it('treats a defaulted Current projection as not actionable (never decision-grade)', () => {
    const inputs = baseInputs({
      forecast: data(
        dualForecastFixture({
          currentProjection: { status: 'fallback_default', fallbackReason: 'engine failed' },
          warnings: ['projection warning'],
        })
      ),
    });
    const row = rowByKey(inputs, 'forecast');

    expect(row.state).toBe('not_actionable');
    expect(row.primaryReason).toBe(
      'Current projection unavailable — a default projection is substituted'
    );
    expect(row.details).toEqual(['projection warning', 'engine failed']);
  });

  it('pins the empty facts universe as indicative (untrusted, AMENDMENT 8)', () => {
    const inputs = baseInputs({
      forecast: data(
        dualForecastFixture({
          navAnchoring: {
            blendedNav: '0',
            countsByTrustState: { LIVE: 0, PARTIAL: 0, UNAVAILABLE: 0, FAILED: 0 },
            companies: [],
          },
        })
      ),
    });
    const row = rowByKey(inputs, 'forecast');

    expect(row.state).toBe('indicative');
    expect(row.primaryReason).toBe('No company facts disclosed');
  });

  it('reads partial or unavailable company facts as indicative with the count', () => {
    const inputs = baseInputs({
      forecast: data(
        dualForecastFixture({
          navAnchoring: {
            blendedNav: '100.00',
            countsByTrustState: { LIVE: 2, PARTIAL: 1, UNAVAILABLE: 1, FAILED: 0 },
            companies: [],
          },
        })
      ),
    });
    const row = rowByKey(inputs, 'forecast');

    expect(row.state).toBe('indicative');
    expect(row.primaryReason).toBe('2 of 4 companies below live facts');
  });

  it('surfaces the FIRST warning as the primary blocker on live facts (deterministic order)', () => {
    const inputs = baseInputs({
      forecast: data(dualForecastFixture({ warnings: ['first warning', 'second warning'] })),
    });
    const row = rowByKey(inputs, 'forecast');

    expect(row.state).toBe('indicative');
    expect(row.primaryReason).toBe('first warning');
    expect(row.details).toEqual(['first warning', 'second warning']);
  });
});

// ── Portfolio Actuals ──

describe('portfolio actuals row', () => {
  it('is actionable with the drift as-of date when facts are clean', () => {
    const row = rowByKey(baseInputs(), 'portfolio-actuals');

    expect(row.state).toBe('actionable');
    expect(row.asOfDate).toBe('2026-07-02');
    expect(row.blockedSummary).toBeNull();
  });

  it('fails closed when the facts status is failed, even with zero counts', () => {
    const inputs = baseInputs({
      portfolioActuals: data(allocationsFixture({ facts_status: 'failed' })),
    });
    const row = rowByKey(inputs, 'portfolio-actuals');

    expect(row.state).toBe('not_actionable');
    expect(row.stateLabel).toBe('Facts unavailable');
    expect(row.primaryReason).toBe('Company facts failed to resolve for allocations');
  });

  it('reads degraded companies as indicative and keeps drift counts as the summary', () => {
    const inputs = baseInputs({
      portfolioActuals: data(
        allocationsFixture({
          degraded_company_count: 2,
          drifted_company_count: 3,
          material_company_count: 1,
        })
      ),
    });
    const row = rowByKey(inputs, 'portfolio-actuals');

    expect(row.state).toBe('indicative');
    expect(row.primaryReason).toBe('2 companies degraded');
    expect(row.blockedSummary).toBe('3 drifted, 1 material');
  });

  it('uses the singular noun for one degraded company', () => {
    const inputs = baseInputs({
      portfolioActuals: data(allocationsFixture({ degraded_company_count: 1 })),
    });

    expect(rowByKey(inputs, 'portfolio-actuals').primaryReason).toBe('1 company degraded');
  });

  it('shows nonzero drift counts even when the row stays actionable', () => {
    const inputs = baseInputs({
      portfolioActuals: data(allocationsFixture({ drifted_company_count: 2 })),
    });
    const row = rowByKey(inputs, 'portfolio-actuals');

    expect(row.state).toBe('actionable');
    expect(row.blockedSummary).toBe('2 drifted');
  });
});

// ── Reserves ──

describe('reserves row', () => {
  it('is actionable when every ranking is actionable, as-of the max anchor date', () => {
    const inputs = baseInputs({
      reserves: data(
        moicFixture([
          moicRanking(1, 'actionable', '2026-06-01'),
          moicRanking(2, 'actionable', '2026-06-30'),
        ])
      ),
    });
    const row = rowByKey(inputs, 'reserves');

    expect(row.state).toBe('actionable');
    expect(row.asOfDate).toBe('2026-06-30');
  });

  it('renders the D-C empty state when no rankings are disclosed', () => {
    const row = rowByKey(baseInputs({ reserves: data(moicFixture([])) }), 'reserves');

    expect(row.state).toBe('not_actionable');
    expect(row.primaryReason).toBe('No reserve rankings disclosed');
  });

  it('fails closed when all rankings (including null facts bases) are not actionable', () => {
    const inputs = baseInputs({
      reserves: data(moicFixture([moicRanking(1, 'not_actionable'), moicRanking(2, null)])),
    });
    const row = rowByKey(inputs, 'reserves');

    expect(row.state).toBe('not_actionable');
    expect(row.primaryReason).toBe('All 2 rankings are not actionable');
  });

  it('reads a mixed set as indicative with the not-actionable count', () => {
    const inputs = baseInputs({
      reserves: data(
        moicFixture([
          moicRanking(1, 'actionable'),
          moicRanking(2, null),
          moicRanking(3, 'not_actionable'),
        ])
      ),
    });
    const row = rowByKey(inputs, 'reserves');

    expect(row.state).toBe('indicative');
    expect(row.primaryReason).toBe('2 of 3 rankings not actionable');
  });

  it('reads indicative-only degradation as indicative with its own count', () => {
    const inputs = baseInputs({
      reserves: data(moicFixture([moicRanking(1, 'actionable'), moicRanking(2, 'indicative')])),
    });
    const row = rowByKey(inputs, 'reserves');

    expect(row.state).toBe('indicative');
    expect(row.primaryReason).toBe('1 of 2 rankings indicative');
  });
});

// ── Scenarios ──

describe('scenarios row', () => {
  it('is actionable when every set is CURRENT, as-of the max calculatedAt date', () => {
    const inputs = baseInputs({
      scenarios: data(
        scenariosAvailable([
          scenarioSet('CURRENT', '2026-06-10T00:00:00.000Z'),
          scenarioSet('CURRENT', '2026-06-20T00:00:00.000Z'),
        ])
      ),
    });
    const row = rowByKey(inputs, 'scenarios');

    expect(row.state).toBe('actionable');
    expect(row.asOfDate).toBe('2026-06-20');
  });

  it('renders the D-C empty copy when no scenario sets exist', () => {
    const inputs = baseInputs({
      scenarios: data(scenariosUnavailable('SCENARIOS_NONE_EXIST', 'none exist')),
    });
    const row = rowByKey(inputs, 'scenarios');

    expect(row.state).toBe('not_actionable');
    expect(row.primaryReason).toBe('No scenario sets disclosed');
  });

  it('fails closed when sets exist but none are calculated (in-progress unprovable)', () => {
    const inputs = baseInputs({
      scenarios: data(scenariosUnavailable('SCENARIOS_NONE_CALCULATED', 'none calculated')),
    });
    const row = rowByKey(inputs, 'scenarios');

    expect(row.state).toBe('not_actionable');
    expect(row.primaryReason).toBe('Scenario sets exist but none have calculated results');
  });

  it('reads a scenarios load failure as Facts unavailable with the section reason', () => {
    const inputs = baseInputs({
      scenarios: data(scenariosUnavailable('SCENARIOS_LOAD_FAILED', 'snapshot read failed')),
    });
    const row = rowByKey(inputs, 'scenarios');

    expect(row.state).toBe('not_actionable');
    expect(row.stateLabel).toBe('Facts unavailable');
    expect(row.primaryReason).toBe('snapshot read failed');
  });

  it('fails closed when every set failed', () => {
    const inputs = baseInputs({
      scenarios: data(scenariosAvailable([scenarioSet('FAILED'), scenarioSet('UNAVAILABLE')])),
    });
    const row = rowByKey(inputs, 'scenarios');

    expect(row.state).toBe('not_actionable');
    expect(row.primaryReason).toBe('All 2 scenario sets failed');
  });

  it('reads partial failures as indicative with the count (failed beats calculating)', () => {
    const inputs = baseInputs({
      scenarios: data(
        scenariosAvailable([
          scenarioSet('FAILED'),
          scenarioSet('CALCULATING'),
          scenarioSet('CURRENT'),
        ])
      ),
    });
    const row = rowByKey(inputs, 'scenarios');

    expect(row.state).toBe('indicative');
    expect(row.primaryReason).toBe('1 of 3 scenario sets failed');
  });

  it('reads in-flight calculation as indicative', () => {
    const inputs = baseInputs({
      scenarios: data(scenariosAvailable([scenarioSet('CALCULATING'), scenarioSet('CURRENT')])),
    });
    const row = rowByKey(inputs, 'scenarios');

    expect(row.state).toBe('indicative');
    expect(row.primaryReason).toBe('Scenario calculation in progress');
  });

  it('reads stale sets as indicative with the stale count', () => {
    const inputs = baseInputs({
      scenarios: data(
        scenariosAvailable([
          scenarioSet('STALE_PUBLISH'),
          scenarioSet('STALE_CONFIG'),
          scenarioSet('CURRENT'),
        ])
      ),
    });
    const row = rowByKey(inputs, 'scenarios');

    expect(row.state).toBe('indicative');
    expect(row.primaryReason).toBe('2 of 3 scenario sets stale against the published config');
  });
});
