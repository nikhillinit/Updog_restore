import type { PoolClient } from 'pg';
import { transaction } from '../db/pg-circuit.js';
import {
  EconomicsResultV1Schema,
  type EconomicsResultV1,
} from '@shared/contracts/economics-v1.contract';
import {
  FundScenarioCalculationPayloadV1Schema,
  type FundScenarioCalculationPayloadV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import {
  FundScenarioComparisonV1Schema,
  SCENARIO_COMPARISON_METRIC_KEYS,
  type FundScenarioComparisonV1,
  type ScenarioComparisonMetricDeltaV1,
  type ScenarioComparisonMetricKey,
  type ScenarioComparisonMetricMap,
} from '@shared/contracts/fund-scenario-comparison-v1.contract';
import { fetchScenarioSetDetail, verifyFundExists } from './fund-scenario-set-service.js';

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
  if (baselineValue == null && scenarioValue == null) {
    return {
      metric,
      displayName: METRIC_LABELS[metric],
      baselineValue,
      scenarioValue,
      absoluteDelta: null,
      percentageDelta: null,
      driftCapable: false,
      driftReason: 'missing_both',
    };
  }

  if (baselineValue == null) {
    return {
      metric,
      displayName: METRIC_LABELS[metric],
      baselineValue,
      scenarioValue,
      absoluteDelta: null,
      percentageDelta: null,
      driftCapable: false,
      driftReason: 'missing_baseline',
    };
  }

  if (scenarioValue == null) {
    return {
      metric,
      displayName: METRIC_LABELS[metric],
      baselineValue,
      scenarioValue,
      absoluteDelta: null,
      percentageDelta: null,
      driftCapable: false,
      driftReason: 'missing_scenario',
    };
  }

  const absoluteDelta = scenarioValue - baselineValue;

  if (baselineValue === 0) {
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

export async function getFundScenarioComparison(
  fundId: number,
  scenarioSetId: string
): Promise<FundScenarioComparisonV1> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);
    const scenarioSet = await fetchScenarioSetDetail(client, fundId, scenarioSetId);
    const baseComparison = {
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

    if (scenarioSet.variants.some((variant) => variant.override.overrideType !== 'fee_profile')) {
      return FundScenarioComparisonV1Schema.parse({
        ...baseComparison,
        comparisonStatus: 'unsupported_override_type',
      });
    }

    const scenarioPayload = await loadLatestScenarioSnapshot(client, fundId, scenarioSetId);
    if (!scenarioPayload) {
      return FundScenarioComparisonV1Schema.parse({
        ...baseComparison,
        comparisonStatus: 'no_scenario_results',
      });
    }

    const comparisonWithScenarioEvidence = {
      ...baseComparison,
      staleness: scenarioPayload.staleness,
      calculatedAt: scenarioPayload.calculatedAt,
    };
    const baselineSnapshot = await loadAuthoritativeEconomicsSnapshot(client, {
      fundId,
      sourceConfigId: scenarioSet.sourceConfigId,
      sourceConfigVersion: scenarioSet.sourceConfigVersion,
    });

    if (!baselineSnapshot) {
      return FundScenarioComparisonV1Schema.parse({
        ...comparisonWithScenarioEvidence,
        comparisonStatus: 'baseline_unavailable',
      });
    }

    const baselineMetrics = metricMapFromEconomics(baselineSnapshot);
    const variants = scenarioPayload.variants
      .filter((variant) => variant.overrideType === 'fee_profile')
      .map((variant) => {
        const metrics = metricMapFromEconomics(variant.economics);
        return {
          variantId: variant.variantId,
          name: variant.name,
          overrideType: variant.overrideType,
          metrics,
          metricDeltas: metricDeltas(baselineMetrics, metrics),
        };
      });

    return FundScenarioComparisonV1Schema.parse({
      ...comparisonWithScenarioEvidence,
      comparisonStatus: 'comparable',
      baseline: {
        label: 'Authoritative baseline',
        metrics: baselineMetrics,
      },
      variants,
    });
  });
}
