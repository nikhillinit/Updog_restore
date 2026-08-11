import { Worker, type Job } from 'bullmq';
import type IORedis from 'ioredis';
import { logger } from '../lib/logger.js';
import { sanitizeQueueError } from '../lib/queue-error-sanitizer.js';
import { getBullMQConnection } from './redis-connection.js';
import {
  registerQueueRuntime,
  unregisterQueueRuntime,
  type RegisteredQueueRuntime,
} from './registry.js';

const QUEUE_NAME = 'fund-scenario-calc';
const LOCK_DURATION_MS = 300_000;

interface FundScenarioCalcJobData {
  fundId: number;
  scenarioSetId: string;
  correlationId: string;
  calculationMode: string;
  runId?: string;
  actor: {
    userId: number | null;
    label: string | null;
  } | null;
}

type FundScenarioCalcJobResult = unknown;

interface FundScenarioCalcHandlerModule {
  handleFundScenarioCalcJob(
    job: Pick<
      Job<FundScenarioCalcJobData, FundScenarioCalcJobResult, string>,
      'id' | 'data' | 'attemptsMade' | 'opts'
    >,
    token?: string,
    signal?: AbortSignal
  ): Promise<FundScenarioCalcJobResult>;
}

let worker: Worker<FundScenarioCalcJobData, FundScenarioCalcJobResult, string> | null = null;
let registeredRuntime: RegisteredQueueRuntime | null = null;

async function closeFundScenarioCalcWorker(
  workerRef: Worker<FundScenarioCalcJobData, FundScenarioCalcJobResult, string>,
  runtimeRef: RegisteredQueueRuntime
): Promise<void> {
  if (worker === workerRef) worker = null;
  if (registeredRuntime === runtimeRef) registeredRuntime = null;
  unregisterQueueRuntime('fund-scenario-calc', 'worker', runtimeRef);
  await Promise.allSettled([workerRef.close()]);
  logger.info('[fund-scenario-calc] In-process worker stopped');
}

export async function initializeFundScenarioCalcWorker(
  redisConnection: IORedis
): Promise<{ close: () => Promise<void> }> {
  if (worker && registeredRuntime?.close) {
    return {
      close: registeredRuntime.close,
    };
  }

  const connection = getBullMQConnection(redisConnection);
  let workerRef: Worker<FundScenarioCalcJobData, FundScenarioCalcJobResult, string> | null = null;
  let runtimeRef: RegisteredQueueRuntime | null = null;

  try {
    // eslint-disable-next-line povc-security/require-bullmq-config -- lockDuration is a renewable ownership lease; execution deadline is persisted per run
    workerRef = new Worker<FundScenarioCalcJobData, FundScenarioCalcJobResult, string>(
      QUEUE_NAME,
      async (
        job: Job<FundScenarioCalcJobData, FundScenarioCalcJobResult, string>,
        token: string | undefined,
        signal: AbortSignal | undefined
      ) => {
        const { handleFundScenarioCalcJob: processJob } = (await import(
          '../../workers/fund-scenario-calc-handler.js' as string
        )) as unknown as FundScenarioCalcHandlerModule;
        return processJob(job, token, signal);
      },
      {
        connection,
        concurrency: 2,
        lockDuration: LOCK_DURATION_MS,
      }
    );

    workerRef.on('completed', (job) => {
      logger.info({ jobId: job.id }, '[fund-scenario-calc] Worker completed job');
    });

    workerRef.on('failed', (job, error) => {
      logger.error(
        { err: sanitizeQueueError(error), jobId: job?.id },
        '[fund-scenario-calc] Worker failed job'
      );
    });

    workerRef.on('error', (error) => {
      logger.error({ err: sanitizeQueueError(error) }, '[fund-scenario-calc] Worker error');
    });

    logger.info('[fund-scenario-calc] In-process worker started');

    const initializedWorker = workerRef;
    let closed = false;
    runtimeRef = {
      getQueue: () => null,
      getWorker: () => initializedWorker,
      isInitialized: () => worker === initializedWorker,
      healthMode: 'worker',
      close: async () => {
        if (closed) return;
        closed = true;
        await closeFundScenarioCalcWorker(initializedWorker, runtimeRef!);
      },
    };
    worker = initializedWorker;
    registeredRuntime = runtimeRef;
    registerQueueRuntime('fund-scenario-calc', runtimeRef);

    return {
      close: runtimeRef.close!,
    };
  } catch (error) {
    if (workerRef) {
      if (runtimeRef) {
        await closeFundScenarioCalcWorker(workerRef, runtimeRef);
      } else {
        if (worker === workerRef) worker = null;
        await Promise.allSettled([workerRef.close()]);
      }
    }
    throw error;
  }
}
