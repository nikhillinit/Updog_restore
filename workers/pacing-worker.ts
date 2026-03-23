import { Worker } from 'bullmq';
import { db } from '../server/db';
import { funds, fundSnapshots, pacingHistory } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { generatePacingSummary } from '@shared/core/pacing/PacingEngine';
import { logger } from '../lib/logger';
import { withMetrics, metrics } from '../lib/metrics';
import { registerWorker, createHealthServer } from './health-server';
import { getConfig } from '../server/config';
import type { PacingInput } from '@shared/types';
import {
  isFinalAttempt,
  markCalcRunCompletedIfReady,
  markCalcRunFailed,
} from '../server/services/calc-run-tracking';
import { resolvePacingFundSize } from './pacing-worker-support';

// Exit early if in demo mode
const config = getConfig();
if (config.DEMO_MODE) {
  console.log('[pacing-worker] DEMO_MODE=1: worker disabled');
  process.exit(0);
}

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

interface PacingJobData {
  fundId: number;
  correlationId: string;
  marketCondition?: 'bull' | 'bear' | 'neutral';
  deploymentQuarter?: number;
  runId?: number;
  configId?: number;
  configVersion?: number;
}

export const pacingWorker = new Worker<PacingJobData>(
  'pacing-calc',
  async (job) => {
    const {
      fundId,
      correlationId,
      marketCondition = 'neutral',
      deploymentQuarter = 1,
      runId,
      configId,
      configVersion,
    } = job.data;

    logger.info('Processing pacing calculation', { fundId, correlationId, jobId: job.id });

    return withMetrics('pacing', async () => {
      const startTime = performance.now();

      try {
        // Load fund data
        const fund = await db.query.funds.findFirst({
          where: eq(funds.id, fundId),
        });

        if (!fund) {
          throw new Error(`Fund ${fundId} not found`);
        }

        // Prepare pacing input
        const pacingInput: PacingInput = {
          fundSize: await resolvePacingFundSize({ fundId, configId, configVersion }),
          deploymentQuarter,
          marketCondition,
        };

        // Generate pacing calculations using PacingEngine
        const pacingSummary = generatePacingSummary(pacingInput);

        // Store deployments in pacing_history table
        const historyInserts = pacingSummary.deployments.map((deployment) => ({
          fundId,
          quarter: `Q${deployment.quarter}`,
          deploymentAmount: deployment.deployment.toString(),
          marketCondition,
        }));

        // Insert into pacing_history (handle conflicts by updating)
        for (const history of historyInserts) {
          await db
            .insert(pacingHistory)
            .values(history)
            .onConflictDoUpdate({
              target: [pacingHistory.fundId, pacingHistory.quarter],
              set: {
                deploymentAmount: history.deploymentAmount,
                marketCondition: history.marketCondition,
              },
            });
        }

        // Write snapshot to database (with run attribution if available)
        const [snapshot] = await db
          .insert(fundSnapshots)
          .values({
            fundId,
            type: 'PACING',
            payload: pacingSummary as unknown as Record<string, unknown>,
            calcVersion: process.env.ALG_PACING_VERSION || '1.0.0',
            correlationId,
            snapshotTime: new Date(),
            ...(runId != null && { runId }),
            ...(configId != null && { configId }),
            ...(configVersion != null && { configVersion }),
            metadata: {
              totalQuarters: pacingSummary.totalQuarters,
              avgQuarterlyDeployment: pacingSummary.avgQuarterlyDeployment,
              marketCondition: pacingSummary.marketCondition,
              engineRuntime: performance.now() - startTime,
            },
          })
          .returning();

        // Record metrics
        metrics.recordSnapshotWrite('PACING', true);

        metrics.histogram('pacing_calculation_duration_ms', performance.now() - startTime, {
          fundId: fundId.toString(),
          marketCondition,
        });

        metrics.counter('pacing_calculations_total', 1, {
          fundId: fundId.toString(),
          marketCondition,
        });

        logger.info('Pacing calculation completed', {
          fundId,
          correlationId,
          snapshotId: snapshot.id,
          totalQuarters: pacingSummary.totalQuarters,
          avgQuarterlyDeployment: pacingSummary.avgQuarterlyDeployment,
        });

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
      } catch (error) {
        logger.error('Pacing calculation failed', error as Error, {
          fundId,
          correlationId,
        });

        metrics.counter('pacing_calculation_errors_total', 1, {
          fundId: fundId.toString(),
          errorType: (error as Error).name,
        });

        if (runId != null && isFinalAttempt(job)) {
          await markCalcRunFailed(
            runId,
            error instanceof Error ? error.message : 'Pacing calculation failed'
          );
        }

        throw error;
      }
    });
  },
  {
    connection,
    concurrency: 5,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 3600,
      count: 100,
    },
    removeOnFail: {
      age: 86400,
    },
  }
);

// Register worker for health monitoring
registerWorker('pacing-calc', pacingWorker);

// Start health check server
const HEALTH_PORT = parseInt(process.env.PACING_WORKER_HEALTH_PORT || '9002');
createHealthServer(HEALTH_PORT);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Pacing worker shutting down...');
  await pacingWorker.close();
});

process.on('SIGINT', async () => {
  logger.info('Pacing worker received SIGINT, shutting down...');
  await pacingWorker.close();
  process.exit(0);
});
