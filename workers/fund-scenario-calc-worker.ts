import { Worker, type Job } from 'bullmq';
import { logger } from '../lib/logger';
import { withMetrics, metrics } from '../lib/metrics';
import { registerWorker, createHealthServer } from './health-server';
import { runReserveScenarioCalculation } from '../server/services/fund-scenario-reserve-calculation-service';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

interface FundScenarioCalcJobData {
  fundId: number;
  scenarioSetId: string;
  correlationId: string;
  calculationMode: string;
  actor: {
    userId: number | null;
    label: string | null;
  } | null;
}

export async function handleFundScenarioCalcJob(
  job: Pick<Job<FundScenarioCalcJobData>, 'id' | 'data'>
) {
  const { fundId, scenarioSetId, correlationId, calculationMode, actor } = job.data;

  logger.info('Processing reserve scenario calculation', {
    fundId,
    scenarioSetId,
    correlationId,
    jobId: job.id,
    calculationMode,
  });

  try {
    if (calculationMode !== 'async_reserve_allocation') {
      throw new Error(`Unsupported fund scenario calculation mode: ${calculationMode}`);
    }

    return await withMetrics('fund-scenario-reserve', async () =>
      runReserveScenarioCalculation({
        fundId,
        scenarioSetId,
        correlationId,
        actor: actor ?? {},
        jobId: String(job.id),
      })
    );
  } catch (error) {
    const err = error as Error;
    logger.error('Reserve scenario calculation failed', err, {
      fundId,
      scenarioSetId,
      correlationId,
      jobId: job.id,
      errorName: err.name,
      errorMessage: err.message,
      errorStack: err.stack,
    });
    metrics.counter('fund_scenario_reserve_calculation_failed_total', 1, {
      fundId: String(fundId),
      errorType: err.name,
    });
    throw error;
  }
}

export const fundScenarioCalcWorker = new Worker<FundScenarioCalcJobData>(
  'fund-scenario-calc',
  handleFundScenarioCalcJob,
  {
    connection,
    concurrency: 2,
    lockDuration: 300_000,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 2_000,
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

registerWorker('fund-scenario-calc', fundScenarioCalcWorker);

const HEALTH_PORT = parseInt(process.env.FUND_SCENARIO_WORKER_HEALTH_PORT || '9004');
createHealthServer(HEALTH_PORT);

process.on('SIGTERM', async () => {
  logger.info('Fund scenario calculation worker shutting down gracefully...');
  await fundScenarioCalcWorker.close();
  logger.info('Fund scenario calculation worker shut down complete');
});

process.on('SIGINT', async () => {
  logger.info('Fund scenario calculation worker received SIGINT, shutting down...');
  await fundScenarioCalcWorker.close();
  process.exit(0);
});
