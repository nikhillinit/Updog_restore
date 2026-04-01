import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { calcRuns, fundMetrics } from '@shared/schema';
import { calculateFundMetrics } from './fund-metrics-calculator';

function formatDecimal(value: number, scale: number): string {
  return value.toFixed(scale);
}

function formatNullableDecimal(value: number | null | undefined, scale: number): string | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return value.toFixed(scale);
}

function isUniqueConstraintViolation(error: unknown, constraintName: string): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: string; constraint?: string; message?: string };
  return (
    candidate.code === '23505' &&
    (candidate.constraint === constraintName ||
      candidate.message?.includes(constraintName) === true)
  );
}

export async function ensureAttributedFundMetricsForCalcRun(runId: number) {
  const run = await db.query.calcRuns.findFirst({
    where: eq(calcRuns.id, runId),
  });

  if (!run) {
    throw new Error(`Calc run ${runId} not found`);
  }

  const existingMetrics = await db.query.fundMetrics.findFirst({
    where: and(eq(fundMetrics.fundId, run.fundId), eq(fundMetrics.runId, runId)),
    orderBy: desc(fundMetrics.metricDate),
  });

  if (existingMetrics) {
    return existingMetrics;
  }

  const calculatedMetrics = await calculateFundMetrics(run.fundId);
  const metricDate = run.completedAt ?? new Date();

  try {
    const [createdMetrics] = await db
      .insert(fundMetrics)
      .values({
        fundId: run.fundId,
        metricDate,
        asOfDate: metricDate,
        totalValue: formatDecimal(calculatedMetrics.totalValue, 2),
        irr: formatNullableDecimal(calculatedMetrics.irr, 4),
        multiple: formatNullableDecimal(calculatedMetrics.moic, 2),
        dpi: formatNullableDecimal(calculatedMetrics.dpi, 2),
        tvpi: formatNullableDecimal(calculatedMetrics.tvpi, 2),
        runId,
        configId: run.configId,
        configVersion: run.configVersion,
      })
      .returning();

    if (!createdMetrics) {
      throw new Error(`Failed to persist attributed fund metrics for calc run ${runId}`);
    }

    return createdMetrics;
  } catch (error) {
    if (isUniqueConstraintViolation(error, 'fund_metrics_run_unique')) {
      const concurrentMetrics = await db.query.fundMetrics.findFirst({
        where: and(eq(fundMetrics.fundId, run.fundId), eq(fundMetrics.runId, runId)),
        orderBy: desc(fundMetrics.metricDate),
      });

      if (concurrentMetrics) {
        return concurrentMetrics;
      }
    }

    throw error;
  }
}
