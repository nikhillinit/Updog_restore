import { db } from '../db';
import { fundSnapshots } from '@shared/schema';
import { FundDraftWriteV1Schema } from '@shared/contracts/fund-draft-write-v1.contract';
import { hasEconomicsAssumptions, runEconomicsModel } from '@shared/lib/economics/economics-engine';

export interface EconomicsCalculationInput {
  fundId: number;
  correlationId: string;
  runId?: number;
  configId?: number;
  configVersion?: number;
}

export async function runEconomicsCalculation({
  fundId,
  correlationId,
  runId,
  configId,
  configVersion,
}: EconomicsCalculationInput) {
  const startTime = performance.now();

  const fundConfig = await db.query.fundConfigs.findFirst({
    where: (configs, { eq, and }) => {
      const publishedForFund = and(eq(configs.fundId, fundId), eq(configs.isPublished, true));
      if (configId != null && configVersion != null) {
        return and(publishedForFund, eq(configs.id, configId), eq(configs.version, configVersion));
      }
      if (configId != null) {
        return and(publishedForFund, eq(configs.id, configId));
      }
      if (configVersion != null) {
        return and(publishedForFund, eq(configs.version, configVersion));
      }
      return publishedForFund;
    },
    orderBy: (configs, { desc }) => desc(configs.version),
  });

  if (!fundConfig) {
    throw new Error(`Published fund config for fund ${fundId} not found`);
  }

  const parsedConfig = FundDraftWriteV1Schema.safeParse(fundConfig.config);
  if (!parsedConfig.success) {
    throw new Error(`Published fund config for fund ${fundId} failed economics validation`);
  }
  if (!hasEconomicsAssumptions(parsedConfig.data)) {
    throw new Error(`Published fund config for fund ${fundId} has no economics assumptions`);
  }

  const economics = runEconomicsModel(parsedConfig.data);
  const resolvedConfigId = configId ?? fundConfig.id;
  const resolvedConfigVersion = configVersion ?? fundConfig.version;

  // ADR-022: authoritative-only writer. scenario_set_id intentionally omitted (defaults to NULL).
  const insertedSnapshots = await db
    .insert(fundSnapshots)
    .values({
      fundId,
      type: 'ECONOMICS',
      payload: economics as unknown as Record<string, unknown>,
      calcVersion: process.env['ALG_ECONOMICS_VERSION'] ?? 'economics-v1',
      correlationId,
      snapshotTime: new Date(),
      ...(runId != null && { runId }),
      configId: resolvedConfigId,
      configVersion: resolvedConfigVersion,
      metadata: {
        annualRows: economics.annual.length,
        engineRuntime: performance.now() - startTime,
      },
    })
    .returning();

  const snapshot = insertedSnapshots[0];
  if (!snapshot) {
    throw new Error(`Failed to persist economics snapshot for fund ${fundId}`);
  }

  return {
    fundId,
    snapshotId: snapshot.id,
    economics,
    calculatedAt: snapshot.createdAt,
    version: snapshot.calcVersion,
  };
}
