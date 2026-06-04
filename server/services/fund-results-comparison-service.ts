/**
 * FundResultsComparisonService
 *
 * Builds a summary-level comparison between the current published config version
 * and the immediately previous published version for a fund.
 *
 * Uses persisted fund configs, calc runs, and snapshots directly. This is a
 * targeted read model for the stabilized results page, not a generalized
 * arbitrary-version diff engine, a catch-all forecasting API, or implicit
 * authorization for PR4 live-surface rollout.
 *
 * @module server/services/fund-results-comparison-service
 */

import { db } from '../db';
import { funds, fundConfigs, calcRuns, fundSnapshots } from '@shared/schema';
import { eq, and, desc, isNotNull, isNull } from 'drizzle-orm';
import { mapReserveSnapshot, mapPacingSnapshot } from './fund-results-mappers';
import type { ReserveSummary, PacingSummary } from '@shared/types';
import type {
  ComparisonCalcRun,
  ComparisonMetrics,
  DriftCapabilityReason,
  FundResultsComparisonV1,
  MetricDelta,
  PublishedVersionSummary,
} from '@shared/contracts/fund-results-comparison-v1.contract';
import { COMPARISON_METRIC_KEYS } from '@shared/contracts/fund-results-comparison-v1.contract';
import { deriveRunStatus, toDispatchState } from './fund-run-status';

const METRIC_DISPLAY_NAMES: Record<MetricDelta['metric'], string> = {
  fundSize: 'Fund Size',
  reserveRatio: 'Reserve Ratio',
  avgConfidence: 'Average Confidence',
  yearsToFullDeploy: 'Years To Full Deploy',
};

function toMetricDelta(
  metric: MetricDelta['metric'],
  currentValue: number | null,
  previousValue: number | null
): MetricDelta {
  let absoluteDelta: number | null = null;
  let percentageDelta: number | null = null;
  let driftCapable = false;
  let driftReason: DriftCapabilityReason = 'stable';

  if (currentValue == null && previousValue == null) {
    driftReason = 'missing_both';
  } else if (currentValue == null) {
    driftReason = 'missing_current';
  } else if (previousValue == null) {
    driftReason = 'missing_previous';
  } else {
    absoluteDelta = currentValue - previousValue;
    if (previousValue !== 0) {
      driftCapable = true;
      percentageDelta = (absoluteDelta / Math.abs(previousValue)) * 100;
    } else {
      driftReason = 'zero_previous';
    }
  }

  return {
    metric,
    displayName: METRIC_DISPLAY_NAMES[metric],
    currentValue,
    previousValue,
    absoluteDelta,
    percentageDelta,
    driftCapable,
    driftReason,
  };
}

function buildMetricDeltas(
  currentMetrics: ComparisonMetrics,
  previousMetrics: ComparisonMetrics
): MetricDelta[] {
  return COMPARISON_METRIC_KEYS.map((metric) =>
    toMetricDelta(metric, currentMetrics[metric], previousMetrics[metric])
  );
}

export class FundResultsComparisonService {
  async getComparison(fundId: number): Promise<FundResultsComparisonV1 | null> {
    const fund = await db.query.funds.findFirst({
      where: eq(funds.id, fundId),
    });

    if (!fund) return null;

    const publishedConfigs = await db
      .select({
        id: fundConfigs.id,
        version: fundConfigs.version,
        publishedAt: fundConfigs.publishedAt,
        config: fundConfigs.config,
      })
      .from(fundConfigs)
      .where(and(eq(fundConfigs.fundId, fundId), isNotNull(fundConfigs.publishedAt)))
      .orderBy(desc(fundConfigs.version))
      .limit(2);

    if (publishedConfigs.length === 0) {
      return {
        fundId,
        comparisonStatus: 'no_published_version',
        currentVersion: null,
        previousVersion: null,
        metricDeltas: [],
      };
    }

    const currentConfig = publishedConfigs[0];
    if (!currentConfig) {
      return {
        fundId,
        comparisonStatus: 'no_published_version',
        currentVersion: null,
        previousVersion: null,
        metricDeltas: [],
      };
    }

    const currentVersion = await this.loadVersionSummary(fundId, Number(fund.size), currentConfig);
    const previousConfig = publishedConfigs[1] ?? null;

    if (!previousConfig) {
      return {
        fundId,
        comparisonStatus: 'no_previous_version',
        currentVersion,
        previousVersion: null,
        metricDeltas: [],
      };
    }

    const previousVersion = await this.loadVersionSummary(
      fundId,
      Number(fund.size),
      previousConfig
    );

    return {
      fundId,
      comparisonStatus: 'comparable',
      currentVersion,
      previousVersion,
      metricDeltas: buildMetricDeltas(currentVersion.metrics, previousVersion.metrics),
    };
  }

  private async loadVersionSummary(
    fundId: number,
    fallbackFundSize: number,
    publishedConfig: {
      id: number;
      version: number;
      publishedAt: Date | null;
      config: unknown;
    }
  ): Promise<PublishedVersionSummary> {
    const configBlob = (publishedConfig.config ?? null) as Record<string, unknown> | null;
    const configuredFundSize = configBlob?.['fundSize'];
    const fundSize = typeof configuredFundSize === 'number' ? configuredFundSize : fallbackFundSize;

    const [latestRun, reserveSnapshot, pacingSnapshot] = await Promise.all([
      db.query.calcRuns.findFirst({
        where: and(
          eq(calcRuns.fundId, fundId),
          eq(calcRuns.configVersion, publishedConfig.version)
        ),
        orderBy: desc(calcRuns.requestedAt),
      }),
      db.query.fundSnapshots.findFirst({
        where: and(
          eq(fundSnapshots.fundId, fundId),
          eq(fundSnapshots.type, 'RESERVE'),
          eq(fundSnapshots.configVersion, publishedConfig.version),
          isNull(fundSnapshots.scenarioSetId)
        ),
        orderBy: desc(fundSnapshots.createdAt),
      }),
      db.query.fundSnapshots.findFirst({
        where: and(
          eq(fundSnapshots.fundId, fundId),
          eq(fundSnapshots.type, 'PACING'),
          eq(fundSnapshots.configVersion, publishedConfig.version),
          isNull(fundSnapshots.scenarioSetId)
        ),
        orderBy: desc(fundSnapshots.createdAt),
      }),
    ]);

    const metrics: ComparisonMetrics = {
      fundSize,
      reserveRatio: null,
      avgConfidence: null,
      yearsToFullDeploy: null,
    };

    if (reserveSnapshot) {
      const reserve = mapReserveSnapshot(reserveSnapshot.payload as ReserveSummary, fundSize);
      metrics.reserveRatio = reserve.reserveRatio;
      metrics.avgConfidence = reserve.avgConfidence;
    }

    if (pacingSnapshot) {
      const pacing = mapPacingSnapshot(pacingSnapshot.payload as PacingSummary);
      metrics.yearsToFullDeploy = pacing.yearsToFullDeploy;
    }

    let calcRun: ComparisonCalcRun | null = null;
    if (latestRun) {
      calcRun = {
        runId: latestRun.id,
        status: deriveRunStatus({
          dispatchState: latestRun.dispatchState,
          completedAt: latestRun.completedAt,
          failedAt: latestRun.failedAt,
        }),
        dispatchState: toDispatchState(latestRun.dispatchState),
        lastCalculatedAt: latestRun.completedAt ? latestRun.completedAt.toISOString() : null,
        correlationId: latestRun.correlationId,
      };
    }

    return {
      version: publishedConfig.version,
      publishedAt: publishedConfig.publishedAt?.toISOString() ?? new Date(0).toISOString(),
      calcRun,
      metrics,
    };
  }
}

export const fundResultsComparisonService = new FundResultsComparisonService();
