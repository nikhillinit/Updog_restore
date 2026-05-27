import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'bullmq';
import { logger } from '../lib/logger';
import { getQueueConnectionOptions, type QueueConnectionOptions } from '../server/config/features';
import { createHealthServer, registerWorker } from './health-server';
import {
  handleFundScenarioCalcJob,
  type FundScenarioCalcJobData,
} from './fund-scenario-calc-handler';

export const FUND_SCENARIO_CALC_QUEUE_NAME = 'fund-scenario-calc';
export const FUND_SCENARIO_CALC_QUEUE_CONNECTION_ERROR =
  'Fund scenario calculation queue Redis connection is not configured; set QUEUE_REDIS_URL or REDIS_URL with ENABLE_QUEUES=1';

interface StartFundScenarioCalcWorkerOptions {
  connection?: QueueConnectionOptions;
  concurrency?: number;
  healthPort?: number | null;
  installSignalHandlers?: boolean;
}

interface FundScenarioCalcWorkerRuntime {
  worker: Worker<FundScenarioCalcJobData>;
  close: () => Promise<void>;
}

function getHealthPort(): number {
  return Number.parseInt(process.env.FUND_SCENARIO_WORKER_HEALTH_PORT || '9004', 10);
}

export function createFundScenarioCalcWorker(input: {
  connection: QueueConnectionOptions;
  concurrency?: number;
}): Worker<FundScenarioCalcJobData> {
  return new Worker<FundScenarioCalcJobData>(
    FUND_SCENARIO_CALC_QUEUE_NAME,
    handleFundScenarioCalcJob,
    {
      connection: input.connection,
      concurrency: input.concurrency ?? 2,
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
}

function installGracefulShutdown(worker: Worker<FundScenarioCalcJobData>): void {
  process.on('SIGTERM', async () => {
    logger.info('Fund scenario calculation worker shutting down gracefully...');
    await worker.close();
    logger.info('Fund scenario calculation worker shut down complete');
  });

  process.on('SIGINT', async () => {
    logger.info('Fund scenario calculation worker received SIGINT, shutting down...');
    await worker.close();
    process.exit(0);
  });
}

export function startFundScenarioCalcWorker(
  options: StartFundScenarioCalcWorkerOptions = {}
): FundScenarioCalcWorkerRuntime {
  const connection = options.connection ?? getQueueConnectionOptions();

  if (!connection) {
    throw new Error(FUND_SCENARIO_CALC_QUEUE_CONNECTION_ERROR);
  }

  const worker = createFundScenarioCalcWorker({
    connection,
    ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
  });

  registerWorker(FUND_SCENARIO_CALC_QUEUE_NAME, worker);

  if (options.healthPort !== null) {
    createHealthServer(options.healthPort ?? getHealthPort());
  }

  if (options.installSignalHandlers) {
    installGracefulShutdown(worker);
  }

  return {
    worker,
    close: () => worker.close(),
  };
}

function isDirectEntrypoint(metaUrl: string): boolean {
  if (!process.argv[1]) {
    return false;
  }

  return pathToFileURL(resolve(process.argv[1])).href === metaUrl;
}

if (isDirectEntrypoint(import.meta.url)) {
  startFundScenarioCalcWorker({ installSignalHandlers: true });
}
