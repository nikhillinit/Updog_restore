import { Worker } from 'bullmq';
import { logger } from '../lib/logger';
import { withMetrics, metrics } from '../lib/metrics';
import { registerWorker, createHealthServer } from './health-server';
import { getConfig } from '../server/config';
import { isFinalAttempt, markCalcRunFailed } from '../server/services/calc-run-tracking';
import { runPacingCalculation } from '../server/services/pacing-calculation-service';

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
      try {
        const result = await runPacingCalculation({
          fundId,
          correlationId,
          marketCondition,
          deploymentQuarter,
          runId,
          configId,
          configVersion,
        });

        metrics.recordSnapshotWrite('PACING', true);
        metrics.counter('pacing_calculations_total', 1, {
          fundId: fundId.toString(),
          marketCondition,
        });

        logger.info('Pacing calculation completed', {
          fundId,
          correlationId,
          snapshotId: result.snapshotId,
        });

        return result;
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

registerWorker('pacing-calc', pacingWorker);

const HEALTH_PORT = parseInt(process.env.PACING_WORKER_HEALTH_PORT || '9002');
createHealthServer(HEALTH_PORT);

process.on('SIGTERM', async () => {
  logger.info('Pacing worker shutting down...');
  await pacingWorker.close();
});

process.on('SIGINT', async () => {
  logger.info('Pacing worker received SIGINT, shutting down...');
  await pacingWorker.close();
  process.exit(0);
});
