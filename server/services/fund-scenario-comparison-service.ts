import type { PoolClient } from 'pg';
import { transaction } from '../db/pg-circuit.js';
import {
  EconomicsResultV1Schema,
  type EconomicsResultV1,
} from '@shared/contracts/economics-v1.contract';
import {
  FundScenarioCalculationPayloadV1Schema,
  type FundScenarioCalculationPayloadV1,
  type FundScenarioCalculationVariantV1,
  type FundScenarioSetDetailV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import {
  FundScenarioComparisonV1Schema,
  SCENARIO_COMPARISON_METRIC_KEYS,
  type FundScenarioComparisonV1,
  type ScenarioComparisonMetricDeltaV1,
  type ScenarioComparisonMetricKey,
  type ScenarioComparisonMetricMap,
  type ScenarioComparisonStatus,
  type ScenarioComparisonUnavailableReasonV1,
  type ScenarioComparisonVariantV1,
} from '@shared/contracts/fund-scenario-comparison-v1.contract';
import { fetchScenarioSetDetail, verifyFundExists } from './fund-scenario-set-service.js';

type ScenarioComparisonBase = Omit<FundScenarioComparisonV1, 'comparisonStatus'>;

interface SnapshotRow {
  id: number;
  payload: unknown;
  created_at: Date | string | null;
  snapshot_time: Date | string | null;
}

const METRIC_LABELS: Record<ScenarioComparisonMetricKey, string> = {
  lpNetIrr: 'Net LP IRR',
  gpNetIrr: 'Net GP IRR',
  totalManagementFees: 'Management Fees',
  totalGpCarryDistributed: 'GP Carry',
  totalGpFeeIncome: 'GP Fee Income',
  finalDpi: 'DPI',
  finalTvpi: 'TVPI',
  finalClawbackDue: 'Clawback Due',
};

const ECONOMICS_COMPARISON_OVERRIDE_TYPES = [
  'fee_profile',
  'allocation',
  'sector_profile',
  'methodology',
] as const;

type EconomicsComparisonOverrideType = (typeof ECONOMICS_COMPARISON_OVERRIDE_TYPES)[number];

function isEconomicsComparisonOverrideType(
  overrideType: string
): overrideType is EconomicsComparisonOverrideType {
  return (ECONOMICS_COMPARISON_OVERRIDE_TYPES as readonly string[]).includes(overrideType);
}

type EconomicsCalculationVariant = Extract<
  FundScenarioCalculationVariantV1,
  { overrideType: EconomicsComparisonOverrideType }
>;

function isEconomicsVariant(
  variant: FundScenarioCalculationVariantV1
): variant is EconomicsCalculationVariant {
  return isEconomicsComparisonOverrideType(variant.overrideType);
}

function parseJsonPayload(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  return JSON.parse(value) as unknown;
}

function metricMapFromEconomics(economics: EconomicsResultV1): ScenarioComparisonMetricMap {
  return {
    lpNetIrr: economics.summary.lpNetIrr,
    gpNetIrr: economics.summary.gpNetIrr,
    totalManagementFees: economics.summary.totalManagementFees,
    totalGpCarryDistributed: economics.summary.totalGpCarryDistributed,
    totalGpFeeIncome: economics.summary.totalGpFeeIncome,
    finalDpi: economics.summary.finalDpi,
    finalTvpi: economics.summary.finalTvpi,
    finalClawbackDue: economics.summary.finalClawbackDue,
  };
}

function metricDelta(
  metric: ScenarioComparisonMetricKey,
  baselineValue: number | null,
  scenarioValue: number | null
): ScenarioComparisonMetricDeltaV1 {
  const unavailableDelta = unavailableMetricDelta(metric, baselineValue, scenarioValue);
  if (unavailableDelta) return unavailableDelta;
  if (baselineValue == null || scenarioValue == null) {
    throw new Error(`Metric ${metric} was unexpectedly incomplete after null handling`);
  }

  const absoluteDelta = scenarioValue - baselineValue;

  if (baselineValue === 0) {
    return zeroBaselineMetricDelta(metric, baselineValue, scenarioValue, absoluteDelta);
  }

  return {
    metric,
    displayName: METRIC_LABELS[metric],
    baselineValue,
    scenarioValue,
    absoluteDelta,
    percentageDelta: (absoluteDelta / Math.abs(baselineValue)) * 100,
    driftCapable: true,
    driftReason: 'stable',
  };
}

function unavailableMetricDelta(
  metric: ScenarioComparisonMetricKey,
  baselineValue: number | null,
  scenarioValue: number | null
): ScenarioComparisonMetricDeltaV1 | null {
  if (baselineValue == null && scenarioValue == null) {
    return nonDriftableMetricDelta(metric, baselineValue, scenarioValue, 'missing_both');
  }
  if (baselineValue == null) {
    return nonDriftableMetricDelta(metric, baselineValue, scenarioValue, 'missing_baseline');
  }
  if (scenarioValue == null) {
    return nonDriftableMetricDelta(metric, baselineValue, scenarioValue, 'missing_scenario');
  }
  return null;
}

function nonDriftableMetricDelta(
  metric: ScenarioComparisonMetricKey,
  baselineValue: number | null,
  scenarioValue: number | null,
  driftReason: ScenarioComparisonMetricDeltaV1['driftReason']
): ScenarioComparisonMetricDeltaV1 {
  return {
    metric,
    displayName: METRIC_LABELS[metric],
    baselineValue,
    scenarioValue,
    absoluteDelta: null,
    percentageDelta: null,
    driftCapable: false,
    driftReason,
  };
}

function zeroBaselineMetricDelta(
  metric: ScenarioComparisonMetricKey,
  baselineValue: number,
  scenarioValue: number,
  absoluteDelta: number
): ScenarioComparisonMetricDeltaV1 {
  return {
    metric,
    displayName: METRIC_LABELS[metric],
    baselineValue,
    scenarioValue,
    absoluteDelta,
    percentageDelta: null,
    driftCapable: false,
    driftReason: 'zero_baseline',
  };
}

function metricDeltas(
  baselineMetrics: ScenarioComparisonMetricMap,
  scenarioMetrics: ScenarioComparisonMetricMap
): ScenarioComparisonMetricDeltaV1[] {
  return SCENARIO_COMPARISON_METRIC_KEYS.map((metric) =>
    metricDelta(metric, baselineMetrics[metric], scenarioMetrics[metric])
  );
}

async function loadLatestScenarioSnapshot(
  client: PoolClient,
  fundId: number,
  scenarioSetId: string
): Promise<FundScenarioCalculationPayloadV1 | null> {
  const result = await client.query<SnapshotRow>(
    `SELECT id, payload, created_at, snapshot_time
       FROM fund_snapshots
      WHERE fund_id = $1
        AND scenario_set_id = $2
        AND type = 'SCENARIOS'
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [fundId, scenarioSetId]
  );

  const snapshot = result.rows[0];
  return snapshot
    ? FundScenarioCalculationPayloadV1Schema.parse(parseJsonPayload(snapshot.payload))
    : null;
}

async function loadAuthoritativeEconomicsSnapshot(
  client: PoolClient,
  input: {
    fundId: number;
    sourceConfigId: number;
    sourceConfigVersion: number;
  }
): Promise<EconomicsResultV1 | null> {
  const result = await client.query<SnapshotRow>(
    `SELECT id, payload, created_at, snapshot_time
       FROM fund_snapshots
      WHERE fund_id = $1
        AND type = 'ECONOMICS'
        AND config_id = $2
        AND config_version = $3
        AND scenario_set_id IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [input.fundId, input.sourceConfigId, input.sourceConfigVersion]
  );

  const snapshot = result.rows[0];
  return snapshot ? EconomicsResultV1Schema.parse(parseJsonPayload(snapshot.payload)) : null;
}

function createBaseComparison(
  fundId: number,
  scenarioSet: FundScenarioSetDetailV1
): ScenarioComparisonBase {
  return {
    fundId,
    scenarioSet: {
      scenarioSetId: scenarioSet.id,
      name: scenarioSet.name,
      sourceConfigId: scenarioSet.sourceConfigId,
      sourceConfigVersion: scenarioSet.sourceConfigVersion,
    },
    baseline: null,
    variants: [],
    staleness: null,
    calculatedAt: null,
  };
}

function comparisonWithStatus(
  baseComparison: ScenarioComparisonBase,
  comparisonStatus: ScenarioComparisonStatus,
  unavailableReason?: ScenarioComparisonUnavailableReasonV1
): FundScenarioComparisonV1 {
  return FundScenarioComparisonV1Schema.parse({
    ...baseComparison,
    comparisonStatus,
    ...(unavailableReason ? { unavailableReason } : {}),
  });
}

function comparisonWithScenarioEvidence(
  baseComparison: ScenarioComparisonBase,
  scenarioPayload: FundScenarioCalculationPayloadV1
): ScenarioComparisonBase {
  return {
    ...baseComparison,
    staleness: scenarioPayload.staleness,
    calculatedAt: scenarioPayload.calculatedAt,
  };
}

function economicsVariants(
  scenarioPayload: FundScenarioCalculationPayloadV1,
  baselineMetrics: ScenarioComparisonMetricMap
): ScenarioComparisonVariantV1[] {
  return scenarioPayload.variants.filter(isEconomicsVariant).map((variant) => {
    const metrics = metricMapFromEconomics(variant.economics);
    return {
      variantId: variant.variantId,
      name: variant.name,
      overrideType: variant.overrideType,
      metrics,
      metricDeltas: metricDeltas(baselineMetrics, metrics),
    };
  });
}

async function buildComparableComparison(
  client: PoolClient,
  input: {
    fundId: number;
    scenarioSet: FundScenarioSetDetailV1;
    baseComparison: ScenarioComparisonBase;
    scenarioPayload: FundScenarioCalculationPayloadV1;
  }
): Promise<FundScenarioComparisonV1> {
  const comparisonBase = comparisonWithScenarioEvidence(
    input.baseComparison,
    input.scenarioPayload
  );

  const scenarioVariants = input.scenarioPayload.variants;
  if (
    scenarioVariants.length === 0 ||
    scenarioVariants.some((variant) => !isEconomicsVariant(variant))
  ) {
    return comparisonWithStatus(
      comparisonBase,
      'unsupported_override_type',
      'UNSUPPORTED_OVERRIDE_TYPE'
    );
  }

  const baselineSnapshot = await loadAuthoritativeEconomicsSnapshot(client, {
    fundId: input.fundId,
    sourceConfigId: input.scenarioSet.sourceConfigId,
    sourceConfigVersion: input.scenarioSet.sourceConfigVersion,
  });

  if (!baselineSnapshot) {
    return comparisonWithStatus(
      comparisonBase,
      'baseline_unavailable',
      'BASELINE_ECONOMICS_SNAPSHOT_MISSING'
    );
  }

  const baselineMetrics = metricMapFromEconomics(baselineSnapshot);
  return FundScenarioComparisonV1Schema.parse({
    ...comparisonBase,
    comparisonStatus: 'comparable',
    baseline: {
      label: 'Authoritative baseline',
      metrics: baselineMetrics,
    },
    variants: economicsVariants(input.scenarioPayload, baselineMetrics),
  });
}

async function buildFundScenarioComparison(
  client: PoolClient,
  fundId: number,
  scenarioSetId: string
): Promise<FundScenarioComparisonV1> {
  await verifyFundExists(client, fundId);
  const scenarioSet = await fetchScenarioSetDetail(client, fundId, scenarioSetId);
  const baseComparison = createBaseComparison(fundId, scenarioSet);

  if (
    scenarioSet.variants.some(
      (variant) => !isEconomicsComparisonOverrideType(variant.override.overrideType)
    )
  ) {
    return comparisonWithStatus(
      baseComparison,
      'unsupported_override_type',
      'UNSUPPORTED_OVERRIDE_TYPE'
    );
  }

  const scenarioPayload = await loadLatestScenarioSnapshot(client, fundId, scenarioSetId);
  if (!scenarioPayload) {
    return comparisonWithStatus(baseComparison, 'no_scenario_results');
  }

  return buildComparableComparison(client, {
    fundId,
    scenarioSet,
    baseComparison,
    scenarioPayload,
  });
}

export async function getFundScenarioComparison(
  fundId: number,
  scenarioSetId: string
): Promise<FundScenarioComparisonV1> {
  return transaction((client) => buildFundScenarioComparison(client, fundId, scenarioSetId));
}
