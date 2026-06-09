import { Worker, type Job } from 'bullmq';
import type IORedis from 'ioredis';
import { logger } from '../lib/logger.js';
import { getBullMQConnection } from './redis-connection.js';

const QUEUE_NAME = 'fund-scenario-calc';
const LOCK_DURATION_MS = 300_000;

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

type FundScenarioCalcJobResult = unknown;

interface FundScenarioCalcHandlerModule {
  handleFundScenarioCalcJob(
    job: Pick<Job<FundScenarioCalcJobData, FundScenarioCalcJobResult, string>, 'id' | 'data'>
  ): Promise<FundScenarioCalcJobResult>;
}

let worker: Worker<FundScenarioCalcJobData, FundScenarioCalcJobResult, string> | null = null;

async function closeFundScenarioCalcWorker(): Promise<void> {
  const workerRef = worker;
  worker = null;

  await workerRef?.close();
  logger.info('[fund-scenario-calc] In-process worker stopped');
}

export async function initializeFundScenarioCalcWorker(
  redisConnection: IORedis
): Promise<{ close: () => Promise<void> }> {
  if (worker) {
    return {
      close: closeFundScenarioCalcWorker,
    };
  }

  const connection = getBullMQConnection(redisConnection);

  // eslint-disable-next-line povc-security/require-bullmq-config -- lockDuration is the BullMQ timeout control
  worker = new Worker<FundScenarioCalcJobData, FundScenarioCalcJobResult, string>(
    QUEUE_NAME,
    async (job: Job<FundScenarioCalcJobData, FundScenarioCalcJobResult, string>) => {
      const { handleFundScenarioCalcJob: processJob } = (await import(
        '../../workers/fund-scenario-calc-handler.js' as string
      )) as unknown as FundScenarioCalcHandlerModule;
      return processJob(job);
    },
    {
      connection,
      concurrency: 2,
      lockDuration: LOCK_DURATION_MS,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, '[fund-scenario-calc] Worker completed job');
  });

  worker.on('failed', (job, error) => {
    logger.error({ err: error, jobId: job?.id }, '[fund-scenario-calc] Worker failed job');
  });

  worker.on('error', (error) => {
    logger.error({ err: error }, '[fund-scenario-calc] Worker error');
  });

  logger.info('[fund-scenario-calc] In-process worker started');

  return {
    close: closeFundScenarioCalcWorker,
  };
}
