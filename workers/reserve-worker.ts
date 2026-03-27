import { Worker } from 'bullmq';
import { logger } from '../lib/logger';
import { withMetrics, metrics } from '../lib/metrics';
import { registerWorker, createHealthServer } from './health-server';
import { isFinalAttempt, markCalcRunFailed } from '../server/services/calc-run-tracking';
import { runReserveCalculation } from '../server/services/reserve-calculation-service';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const reserveWorker = new Worker(
  'reserve-calc',
  async (job) => {
    const { fundId, correlationId, runId, configId, configVersion } = job.data;

    logger.info('Processing reserve calculation', { fundId, correlationId, jobId: job.id });

    return withMetrics('reserve', async () => {
      try {
        const result = await runReserveCalculation({
          fundId,
          correlationId,
          runId,
          configId,
          configVersion,
        });

        metrics.recordSnapshotWrite('RESERVE', true);

        logger.info('Reserve calculation completed', {
          fundId,
          correlationId,
          snapshotId: result.snapshotId,
        });

        return result;
      } catch (error) {
        const err = error as Error;
        logger.error('Reserve calculation failed', err, {
          fundId,
          correlationId,
          errorStack: err.stack,
        });

        metrics.counter('reserve_calculation_errors_total', 1, {
          fundId: fundId.toString(),
          errorType: err.name,
        });

        if (runId != null && isFinalAttempt(job)) {
          await markCalcRunFailed(runId, err.message);
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

registerWorker('reserve-calc', reserveWorker);

const HEALTH_PORT = parseInt(process.env.RESERVE_WORKER_HEALTH_PORT || '9001');
createHealthServer(HEALTH_PORT);

process.on('SIGTERM', async () => {
  logger.info('Reserve worker shutting down gracefully...');
  await reserveWorker.close();
  logger.info('Reserve worker shut down complete');
});

process.on('SIGINT', async () => {
  logger.info('Reserve worker received SIGINT, shutting down...');
  await reserveWorker.close();
  process.exit(0);
});
