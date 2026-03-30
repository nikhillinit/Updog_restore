/**
 * FundResultsComparisonService
 *
 * Builds a summary-level comparison between the current published config version
 * and the immediately previous published version for a fund.
 *
 * Uses persisted fund configs, calc runs, and snapshots directly. This is a
 * targeted read model for the stabilized results page, not a generalized
 * arbitrary-version diff engine.
 *
 * @module server/services/fund-results-comparison-service
 */

import { db } from '../db';
import { funds, fundConfigs, calcRuns, fundSnapshots } from '@shared/schema';
import { eq, and, desc, isNotNull } from 'drizzle-orm';
import { mapReserveSnapshot, mapPacingSnapshot } from './fund-results-mappers';
import type { ReserveSummary, PacingSummary } from '@shared/types';
import type {
  ComparisonCalcRun,
  ComparisonMetrics,
  FundResultsComparisonV1,
  MetricDelta,
  PublishedVersionSummary,
} from '@shared/contracts/fund-results-comparison-v1.contract';
import type { CalculationStatus } from '@shared/contracts/fund-state-read-v1.contract';
import type { DispatchState } from '@shared/schema/fund';

const METRIC_DISPLAY_NAMES: Record<MetricDelta['metric'], string> = {
  fundSize: 'Fund Size',
  reserveRatio: 'Reserve Ratio',
  avgConfidence: 'Average Confidence',
  yearsToFullDeploy: 'Years To Full Deploy',
};

function deriveRunStatus(run: {
  dispatchState: string;
  completedAt: Date | null;
  failedAt: Date | null;
}): CalculationStatus {
  if (run.failedAt) return 'failed';
  if (run.completedAt) return 'ready';
  if (run.dispatchState === 'dispatched' || run.dispatchState === 'partial') return 'calculating';
  if (run.dispatchState === 'pending') return 'submitted';
  return 'calculating';
}

function toDispatchState(raw: string): DispatchState | null {
  const valid: DispatchState[] = ['pending', 'dispatched', 'partial', 'failed'];
  return (valid as string[]).includes(raw) ? (raw as DispatchState) : null;
}

function toMetricDelta(
  metric: MetricDelta['metric'],
  currentValue: number | null,
  previousValue: number | null
): MetricDelta {
  let absoluteDelta: number | null = null;
  let percentageDelta: number | null = null;

  if (currentValue != null && previousValue != null) {
    absoluteDelta = currentValue - previousValue;
    if (previousValue !== 0) {
      percentageDelta = (absoluteDelta / Math.abs(previousValue)) * 100;
    }
  }

  return {
    metric,
    displayName: METRIC_DISPLAY_NAMES[metric],
    currentValue,
    previousValue,
    absoluteDelta,
    percentageDelta,
  };
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

    const currentVersion = await this.loadVersionSummary(
      fundId,
      Number(fund.size),
      currentConfig
    );
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

    const previousVersion = await this.loadVersionSummary(fundId, Number(fund.size), previousConfig);

    return {
      fundId,
      comparisonStatus: 'comparable',
      currentVersion,
      previousVersion,
      metricDeltas: [
        toMetricDelta(
          'fundSize',
          currentVersion.metrics.fundSize,
          previousVersion.metrics.fundSize
        ),
        toMetricDelta(
          'reserveRatio',
          currentVersion.metrics.reserveRatio,
          previousVersion.metrics.reserveRatio
        ),
        toMetricDelta(
          'avgConfidence',
          currentVersion.metrics.avgConfidence,
          previousVersion.metrics.avgConfidence
        ),
        toMetricDelta(
          'yearsToFullDeploy',
          currentVersion.metrics.yearsToFullDeploy,
          previousVersion.metrics.yearsToFullDeploy
        ),
      ],
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
    const fundSize =
      typeof configuredFundSize === 'number' ? configuredFundSize : fallbackFundSize;

    const [latestRun, reserveSnapshot, pacingSnapshot] = await Promise.all([
      db.query.calcRuns.findFirst({
        where: and(eq(calcRuns.fundId, fundId), eq(calcRuns.configVersion, publishedConfig.version)),
        orderBy: desc(calcRuns.requestedAt),
      }),
      db.query.fundSnapshots.findFirst({
        where: and(
          eq(fundSnapshots.fundId, fundId),
          eq(fundSnapshots.type, 'RESERVE'),
          eq(fundSnapshots.configVersion, publishedConfig.version)
        ),
        orderBy: desc(fundSnapshots.createdAt),
      }),
      db.query.fundSnapshots.findFirst({
        where: and(
          eq(fundSnapshots.fundId, fundId),
          eq(fundSnapshots.type, 'PACING'),
          eq(fundSnapshots.configVersion, publishedConfig.version)
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
