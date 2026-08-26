import { db } from '../db';
import { funds, fundSnapshots, pacingHistory } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { generatePacingSummary } from '@shared/core/pacing/PacingEngine';
import type { PacingInput } from '@shared/types';
import { markCalcRunCompletedIfReady } from './calc-run-tracking';
import { resolveMoicActionability, toH9SnapshotColumns } from './fund-calculation-mode-service';
import { resolvePacingFundSize } from './pacing-fund-size';

export interface PacingCalculationInput {
  fundId: number;
  correlationId: string;
  marketCondition?: 'bull' | 'bear' | 'neutral';
  deploymentQuarter?: number;
  runId?: number;
  configId?: number;
  configVersion?: number;
}

export async function runPacingCalculation({
  fundId,
  correlationId,
  marketCondition = 'neutral',
  deploymentQuarter = 1,
  runId,
  configId,
  configVersion,
}: PacingCalculationInput) {
  const startTime = performance.now();

  const fund = await db.query.funds.findFirst({
    where: eq(funds.id, fundId),
  });

  if (!fund) {
    throw new Error(`Fund ${fundId} not found`);
  }

  const fundSizeArgs: { fundId: number; configId?: number; configVersion?: number } = { fundId };
  if (configId != null) {
    fundSizeArgs.configId = configId;
  }
  if (configVersion != null) {
    fundSizeArgs.configVersion = configVersion;
  }

  const pacingInput: PacingInput = {
    fundSize: await resolvePacingFundSize(fundSizeArgs),
    deploymentQuarter,
    marketCondition,
  };

  const pacingSummary = generatePacingSummary(pacingInput);
  const actionability = await resolveMoicActionability({ fundId });
  const h9Columns = toH9SnapshotColumns(actionability);

  const historyInserts = pacingSummary.deployments.map((deployment) => ({
    fundId,
    quarter: `Q${deployment.quarter}`,
    deploymentAmount: deployment.deployment.toString(),
    marketCondition,
    ...h9Columns,
  }));

  for (const history of historyInserts) {
    await db
      .insert(pacingHistory)
      .values(history)
      .onConflictDoUpdate({
        target: [pacingHistory.fundId, pacingHistory.quarter],
        set: {
          deploymentAmount: history.deploymentAmount,
          marketCondition: history.marketCondition,
          ...h9Columns,
        },
      });
  }

  // ADR-022: authoritative-only writer. scenario_set_id intentionally omitted (defaults to NULL).
  const insertedSnapshots = await db
    .insert(fundSnapshots)
    .values({
      fundId,
      type: 'PACING',
      payload: pacingSummary as unknown as Record<string, unknown>,
      calcVersion: process.env['ALG_PACING_VERSION'] ?? '1.0.0',
      correlationId,
      snapshotTime: new Date(),
      ...(runId != null && { runId }),
      ...(configId != null && { configId }),
      ...(configVersion != null && { configVersion }),
      ...h9Columns,
      metadata: {
        totalQuarters: pacingSummary.totalQuarters,
        avgQuarterlyDeployment: pacingSummary.avgQuarterlyDeployment,
        marketCondition: pacingSummary.marketCondition,
        engineRuntime: performance.now() - startTime,
      },
    })
    .returning();

  const snapshot = insertedSnapshots[0];
  if (!snapshot) {
    throw new Error(`Failed to persist pacing snapshot for fund ${fundId}`);
  }

  if (runId != null) {
    await markCalcRunCompletedIfReady(runId);
  }

  return {
    fundId,
    snapshotId: snapshot.id,
    pacing: pacingSummary,
    calculatedAt: snapshot.createdAt,
    version: snapshot.calcVersion,
  };
}
