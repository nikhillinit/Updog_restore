import type { PoolClient } from 'pg';
import type {
  CapitalPlanningMemoV1,
  CapitalPlanningResultV1,
} from '@shared/contracts/capital-planning-v1.contract';
import {
  calculateCapitalComparisonDeltaV1,
  FundScenarioCapitalComparisonV1Schema,
  type CapitalChangedInputV1,
  type CapitalComparisonMetricDeltaV1,
  type FundScenarioCapitalComparisonV1,
} from '@shared/contracts/fund-scenario-comparison-v1.contract';
import type {
  FundScenarioCapitalCalculationPayloadV1,
  FundScenarioCapitalDetailResponseV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import {
  fetchCapitalScenarioSetDetailFromRaw,
  fetchRawScenarioSet,
  verifyFundExists,
} from './fund-scenario-set-service.js';
import { fetchCapitalSavedSnapshot } from './fund-scenario-capital-read-service.js';

type CountBasis = CapitalComparisonMetricDeltaV1['countBasis'];
type UnavailableReason = NonNullable<CapitalComparisonMetricDeltaV1['unavailableReason']>;
type SavedValue =
  | string
  | { state: 'available'; value: string }
  | { state: 'unavailable'; value: null; reason: UnavailableReason }
  | undefined;

const BUDGET_METRICS = [
  ['availableConstructionCapitalUsd', 'Available construction capital'],
  ['planningBudgetUsd', 'Planning budget'],
  ['gpDeemedContributionUsd', 'GP deemed contribution'],
  ['lifetimeFeesUsd', 'Lifetime fees'],
  ['lifetimeExpensesUsd', 'Lifetime expenses'],
] as const;
const RECONCILIATION_METRICS = [
  ['initialDemandUsd', 'Initial demand'],
  ['lifetimeFollowOnUsd', 'Lifetime follow-on demand'],
  ['unassignedPlanningBudgetUsd', 'Unassigned planning budget'],
  ['signedLifetimeHeadroomUsd', 'Signed lifetime headroom'],
  ['allocationGapUsd', 'Allocation gap'],
  ['reserveEarmarkGapUsd', 'Reserve earmark gap'],
  ['withinTermFollowOnUsd', 'Within-term follow-on demand'],
  ['beyondTermFollowOnUsd', 'Beyond-term follow-on demand'],
] as const;
const COMPANION_METRICS = [
  ['adjustedProceedsUsd', 'Adjusted proceeds'],
  ['noPreferenceBaselineUsd', 'No-preference baseline'],
  ['signedPreferenceBenefitUsd', 'Signed preference benefit'],
  ['adjustedMoic', 'Adjusted MOIC'],
  ['baselineMoic', 'Baseline MOIC'],
] as const;

function metricValue(value: SavedValue, absentReason: UnavailableReason) {
  if (typeof value === 'string') return { value, reason: null };
  if (value?.state === 'available') return { value: value.value, reason: null };
  return { value: null, reason: value?.reason ?? absentReason };
}

function delta(
  metric: CapitalComparisonMetricDeltaV1['metric'],
  label: string,
  group: CapitalComparisonMetricDeltaV1['group'],
  countBasis: CountBasis,
  baseline: SavedValue,
  variant: SavedValue,
  absentReason: UnavailableReason
): CapitalComparisonMetricDeltaV1 {
  const before = metricValue(baseline, absentReason);
  const after = metricValue(variant, absentReason);
  const values = {
    metric,
    label,
    group,
    countBasis,
    baselineValue: before.value,
    variantValue: after.value,
  };
  if (before.value === null || after.value === null) {
    return {
      ...values,
      absoluteDelta: null,
      percentageDelta: null,
      unavailableReason: before.reason ?? after.reason,
    };
  }
  const exact = calculateCapitalComparisonDeltaV1({
    baselineValue: before.value,
    variantValue: after.value,
    scale: metric.endsWith('Usd') ? 6 : 12,
  });
  return {
    ...values,
    ...exact,
    unavailableReason: exact.percentageDelta === null ? 'ZERO_BASELINE' : null,
  };
}

function savedMetricDeltas(
  baseline: CapitalPlanningResultV1,
  variant: CapitalPlanningResultV1
): CapitalComparisonMetricDeltaV1[] {
  const deltas: CapitalComparisonMetricDeltaV1[] = [];
  for (const countBasis of ['expected', 'entered'] as const) {
    for (const [metric, label] of BUDGET_METRICS) {
      deltas.push(
        delta(
          metric,
          label,
          'construction',
          countBasis,
          baseline.construction.budget[metric],
          variant.construction.budget[metric],
          'NOT_MODELED'
        )
      );
    }
    const before = baseline.construction.reconciliation.find(
      (row) => row.countBasis === countBasis
    );
    const after = variant.construction.reconciliation.find((row) => row.countBasis === countBasis);
    for (const [metric, label] of RECONCILIATION_METRICS) {
      const basisLabel = countBasis === 'entered' ? `${label} (entered allocations only)` : label;
      deltas.push(
        delta(
          metric,
          basisLabel,
          'construction',
          countBasis,
          before?.[metric],
          after?.[metric],
          countBasis === 'entered' ? 'NOT_ENTERED' : 'NOT_MODELED'
        )
      );
    }
    for (const [metric, label] of COMPANION_METRICS) {
      deltas.push(
        delta(
          metric,
          label,
          'companion',
          countBasis,
          baseline.performance?.[metric],
          variant.performance?.[metric],
          'COMPANION_OMITTED'
        )
      );
    }
  }
  return deltas;
}

function inputGroup(path: string): CapitalChangedInputV1['group'] {
  if (path.startsWith('input.performanceCase.')) return 'companion';
  if (path.startsWith('provenance[') || path.startsWith('benchmarkSnapshots[')) return 'provenance';
  if (path === 'input.netInvestableCapitalUsd' || path.startsWith('sourceBundle.gp.'))
    return 'budget_gp_deemed';
  if (path.includes('graduationRatio')) return 'graduation';
  if (path.includes('participationRatio') || path.includes('proRataExerciseRatio'))
    return 'participation';
  if (path.includes('PoolDilution')) return 'pool_dilution';
  if (path.includes('.financing.') || path.includes('.entryFinancing.'))
    return 'valuation_round_size';
  if (path.includes('budgetShareRatio') || path.includes('designatedFollowOnReserve'))
    return 'earmarks';
  if (
    path.includes('deploymentPeriodYears') ||
    path.includes('monthsAfterPreviousRound') ||
    path.endsWith('.timeOrigin')
  )
    return 'timing';
  if (
    path.includes('Check') ||
    path.includes('.checkPolicy.') ||
    path.endsWith('.plannedCompanyCount')
  )
    return 'checks';
  return 'provenance';
}

function scalarLeaves(
  value: unknown,
  path: string,
  leaves: Map<string, CapitalChangedInputV1['baseline']>
): void {
  if (value === undefined) return;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    leaves.set(path, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scalarLeaves(entry, `${path}[${index}]`, leaves));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    scalarLeaves(entry, `${path}.${key}`, leaves);
  }
}

function changedInputs(
  baseline: CapitalPlanningResultV1,
  variant: CapitalPlanningResultV1
): CapitalChangedInputV1[] {
  const before = new Map<string, CapitalChangedInputV1['baseline']>();
  const after = new Map<string, CapitalChangedInputV1['baseline']>();
  for (const key of ['input', 'provenance', 'benchmarkSnapshots'] as const) {
    scalarLeaves(baseline[key], key, before);
    scalarLeaves(variant[key], key, after);
  }
  return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap((path) => {
    const baselineValue = before.get(path) ?? null;
    const variantValue = after.get(path) ?? null;
    return baselineValue === variantValue
      ? []
      : [
          {
            group: inputGroup(path),
            path,
            label: path.slice(0, 240),
            baseline: baselineValue,
            variant: variantValue,
          },
        ];
  });
}

function memo(
  detail: FundScenarioCapitalDetailResponseV1,
  variant: FundScenarioCapitalCalculationPayloadV1['variants'][number]
): CapitalPlanningMemoV1 {
  return {
    contractVersion: 'capital-planning-memo/1.0.0',
    fundId: detail.fundId,
    scenarioSetId: detail.id,
    variantId: variant.variantId,
    scenarioSetName: detail.name,
    variantName: variant.name,
    result: variant.result,
    readState: detail.readState,
    countBasis: 'expected',
    limitations: [
      'Planning estimates under saved assumptions; not a liquidity forecast.',
      'Simultaneous input changes do not assign additive causes to output differences.',
      'Comparison rows use saved values; entered rows cover only allocations with entered counts.',
    ],
    detailScope: 'complete',
  };
}

export async function buildFundScenarioCapitalComparison(
  client: PoolClient,
  fundId: number,
  scenarioSetId: string
): Promise<FundScenarioCapitalComparisonV1> {
  await verifyFundExists(client, fundId);
  const raw = await fetchRawScenarioSet(client, fundId, scenarioSetId);
  const detail = await fetchCapitalScenarioSetDetailFromRaw(client, raw);
  const saved = await fetchCapitalSavedSnapshot(client, detail);
  const response: FundScenarioCapitalComparisonV1 = {
    contractVersion: 'fund-scenario-capital-comparison/1.0.0',
    representation: 'capital-plan-v1',
    fundId,
    scenarioSetId,
    comparisonStatus: saved ? 'comparable' : 'no_scenario_results',
    snapshotId: saved?.snapshotId ?? null,
    baselineVariantId: detail.baselineVariantId,
    baseline: null,
    variants: [],
    readState: detail.readState,
    calculatedAt: saved?.payload.calculatedAt ?? null,
  };
  if (saved) {
    // The shared saved decoder validates baseline order and all stored identities.
    const baseline = saved.payload.variants[0]!;
    response.baseline = memo(detail, baseline);
    response.variants = saved.payload.variants.slice(1).map((variant) => ({
      variantId: variant.variantId,
      name: variant.name,
      overrideType: 'capital_plan',
      memo: memo(detail, variant),
      changedInputs: changedInputs(baseline.result, variant.result),
      metricDeltas: savedMetricDeltas(baseline.result, variant.result),
      companionComparison:
        !baseline.result.performance || !variant.result.performance
          ? 'companion_unavailable'
          : baseline.result.performance.input.issuerLabel ===
                variant.result.performance.input.issuerLabel &&
              baseline.result.performance.input.issuerKind ===
                variant.result.performance.input.issuerKind
            ? 'same_issuer'
            : 'different_issuers',
    }));
  }
  // Validation must not replace or normalize the immutable historical result objects.
  FundScenarioCapitalComparisonV1Schema.parse(response);
  return response;
}
