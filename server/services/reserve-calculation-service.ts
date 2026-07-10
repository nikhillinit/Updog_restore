import { db } from '../db';
import { fundSnapshots } from '@shared/schema';
import { generateReserveSummary } from '@shared/core/reserves/ReserveEngine';
import { resolveMoicActionability, toH9SnapshotColumns } from './fund-calculation-mode-service';
import { markCalcRunCompletedIfReady } from './calc-run-tracking';
import { buildReservePortfolioInputWithProvenance } from './reserve-input-builder';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delay: number = RETRY_DELAY_MS
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}

export interface ReserveCalculationInput {
  fundId: number;
  correlationId: string;
  runId?: number;
  configId?: number;
  configVersion?: number;
}

export async function runReserveCalculation({
  fundId,
  correlationId,
  runId,
  configId,
  configVersion,
}: ReserveCalculationInput) {
  const startTime = performance.now();

  const fundConfig = await retryWithBackoff(() =>
    db.query.fundConfigs.findFirst({
      where: (configs, { eq, and }) =>
        and(eq(configs.fundId, fundId), eq(configs.isPublished, true)),
      orderBy: (configs, { desc }) => desc(configs.version),
    })
  );

  const fund = await retryWithBackoff(() =>
    db.query.funds.findFirst({
      where: (funds, { eq }) => eq(funds.id, fundId),
    })
  );

  if (!fund && !fundConfig) {
    throw new Error(`Fund ${fundId} not found`);
  }

  const {
    portfolio,
    reserveInputTrustSummary,
  } = await retryWithBackoff(() => buildReservePortfolioInputWithProvenance(fundId));

  const reserves = generateReserveSummary(fundId, portfolio);
  // H9: stamp the actionability fingerprint onto the authoritative snapshot so
  // downstream reuse/cache/export can gate on it. Display reads are unaffected.
  const actionability = await resolveMoicActionability({ fundId });

  // ADR-022: authoritative-only writer. scenario_set_id intentionally omitted (defaults to NULL).
  const insertedSnapshots = await db
    .insert(fundSnapshots)
    .values({
      fundId,
      type: 'RESERVE',
      payload: reserves as unknown as Record<string, unknown>,
      calcVersion: process.env['ALG_RESERVE_VERSION'] ?? '1.0.0',
      correlationId,
      snapshotTime: new Date(),
      ...(runId != null && { runId }),
      ...(configId != null && { configId }),
      ...(configVersion != null && { configVersion }),
      ...toH9SnapshotColumns(actionability),
      metadata: {
        portfolioCount: portfolio.length,
        engineRuntime: performance.now() - startTime,
        reserveInputTrustSummary,
      },
    })
    .returning();

  const snapshot = insertedSnapshots[0];
  if (!snapshot) {
    throw new Error(`Failed to persist reserve snapshot for fund ${fundId}`);
  }

  if (runId != null) {
    await markCalcRunCompletedIfReady(runId);
  }

  return {
    fundId,
    snapshotId: snapshot.id,
    reserves,
    calculatedAt: snapshot.createdAt,
    version: snapshot.calcVersion,
  };
}
