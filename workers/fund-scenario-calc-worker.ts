import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Queue, Worker, type Job } from 'bullmq';
import { logger } from '../lib/logger';
import { getQueueConnectionOptions, type QueueConnectionOptions } from '../server/config/features';
import {
  createHealthServer,
  registerWorker,
  unregisterWorker,
  type WorkerHealthServerRuntime,
} from './health-server';
import { attachQueueErrorLogging } from './queue-error-logging';
import { resolveWorkerDeploymentIdentity } from './worker-deployment-identity';
import {
  handleFundScenarioCalcJob,
  type FundScenarioCalcJobData,
} from './fund-scenario-calc-handler';
import { sweepFundScenarioCalculationRunDeadlines } from '../server/services/fund-scenario-calculation-run-service';
import {
  getFundScenarioHardTimeoutMs,
  isFundScenarioSweepEnabled,
} from '../server/services/fund-scenario-timeout';

export const FUND_SCENARIO_CALC_QUEUE_NAME = 'fund-scenario-calc';
export const FUND_SCENARIO_CALC_QUEUE_CONNECTION_ERROR =
  'Fund scenario calculation queue Redis connection is not configured; set QUEUE_REDIS_URL or REDIS_URL with ENABLE_QUEUES=1';

interface StartFundScenarioCalcWorkerOptions {
  connection?: QueueConnectionOptions;
  concurrency?: number;
  healthPort?: number | null;
  installSignalHandlers?: boolean;
  /**
   * Harness-local calculation handler injection. Applies ONLY to calculation
   * jobs -- deadline-sweep jobs always run the real sweep. Production
   * initializers never supply this.
   */
  calculationHandler?: typeof handleFundScenarioCalcJob;
}

export interface FundScenarioDeadlineSweepJobData {
  kind: 'fund-scenario-deadline-sweep';
}

type FundScenarioCalcQueueJobData = FundScenarioCalcJobData | FundScenarioDeadlineSweepJobData;
type FundScenarioCalcQueueJobResult = unknown;

const FUND_SCENARIO_DEADLINE_SWEEP_JOB_NAME = 'fund-scenario-deadline-sweep';
const FUND_SCENARIO_DEADLINE_SWEEP_INTERVAL_MS = 60_000;

interface FundScenarioCalcWorkerRuntime {
  worker: Worker<FundScenarioCalcQueueJobData>;
  ready: Promise<void>;
  close: () => Promise<void>;
}

function parseHealthPort(value: string | undefined): number | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : null;
}

function getHealthPort(): number {
  return (
    parseHealthPort(process.env['WORKER_HEALTH_PORT']) ??
    parseHealthPort(process.env['FUND_SCENARIO_WORKER_HEALTH_PORT']) ??
    parseHealthPort(process.env['PORT']) ??
    9004
  );
}

export function createFundScenarioCalcWorker(input: {
  connection: QueueConnectionOptions;
  concurrency?: number;
  removeJob?: (jobId: string) => Promise<unknown>;
  calculationHandler?: typeof handleFundScenarioCalcJob;
}): Worker<FundScenarioCalcQueueJobData> {
  const worker = new Worker<FundScenarioCalcQueueJobData>(
    FUND_SCENARIO_CALC_QUEUE_NAME,
    async (
      job: Job<FundScenarioCalcQueueJobData, FundScenarioCalcQueueJobResult, string>,
      token?: string,
      signal?: AbortSignal
    ) => {
      // Deadline-sweep branch FIRST: the real sweep always runs; the injected
      // calculation handler never sees sweep jobs.
      if (job.name === FUND_SCENARIO_DEADLINE_SWEEP_JOB_NAME) {
        return sweepFundScenarioCalculationRunDeadlines({ removeJob: input.removeJob });
      }

      return (input.calculationHandler ?? handleFundScenarioCalcJob)(
        job as Pick<Job<FundScenarioCalcJobData>, 'id' | 'data' | 'attemptsMade' | 'opts'>,
        token,
        signal
      );
    },
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
  attachQueueErrorLogging(worker, 'fund-scenario-calc worker');
  return worker;
}

function installGracefulShutdown(close: () => Promise<void>): void {
  process.on('SIGTERM', async () => {
    logger.info('Fund scenario calculation worker shutting down gracefully...');
    await close();
    logger.info('Fund scenario calculation worker shut down complete');
  });

  process.on('SIGINT', async () => {
    logger.info('Fund scenario calculation worker received SIGINT, shutting down...');
    await close();
    process.exit(0);
  });
}

async function initializeFundScenarioDeadlineSweep(
  queue: Queue<FundScenarioCalcQueueJobData>
): Promise<void> {
  await queue.upsertJobScheduler(
    FUND_SCENARIO_DEADLINE_SWEEP_JOB_NAME,
    { every: FUND_SCENARIO_DEADLINE_SWEEP_INTERVAL_MS },
    {
      name: FUND_SCENARIO_DEADLINE_SWEEP_JOB_NAME,
      data: { kind: FUND_SCENARIO_DEADLINE_SWEEP_JOB_NAME },
    }
  );
  await sweepFundScenarioCalculationRunDeadlines({ removeJob: (jobId) => queue.remove(jobId) });
}

export function startFundScenarioCalcWorker(
  options: StartFundScenarioCalcWorkerOptions = {}
): FundScenarioCalcWorkerRuntime {
  const deploymentIdentity = resolveWorkerDeploymentIdentity('fund-scenario-calc');

  const connection = options.connection ?? getQueueConnectionOptions();

  if (!connection) {
    throw new Error(FUND_SCENARIO_CALC_QUEUE_CONNECTION_ERROR);
  }

  if (process.env['NODE_ENV'] === 'production') {
    getFundScenarioHardTimeoutMs();
  }

  const queue = isFundScenarioSweepEnabled()
    ? new Queue<FundScenarioCalcQueueJobData>(FUND_SCENARIO_CALC_QUEUE_NAME, { connection })
    : null;
  let worker: Worker<FundScenarioCalcQueueJobData>;
  try {
    worker = createFundScenarioCalcWorker({
      connection,
      ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
      ...(queue ? { removeJob: (jobId: string) => queue.remove(jobId) } : {}),
      ...(options.calculationHandler !== undefined
        ? { calculationHandler: options.calculationHandler }
        : {}),
    });
  } catch (error) {
    void queue?.close().catch(() => undefined);
    throw error;
  }

  let closePromise: Promise<void> | undefined;
  let lifecycle: 'initializing' | 'ready' | 'closing' | 'closed' = 'initializing';
  let healthServer: WorkerHealthServerRuntime | undefined;
  const closeResources = (): Promise<void> => {
    closePromise ??= (async () => {
      lifecycle = 'closing';
      unregisterWorker(FUND_SCENARIO_CALC_QUEUE_NAME, worker);
      let firstError: unknown;
      try {
        await healthServer?.close();
      } catch (error) {
        firstError = error;
      }

      try {
        await worker.close();
      } catch (error) {
        firstError ??= error;
      }

      try {
        await queue?.close();
      } catch (error) {
        firstError ??= error;
      }

      lifecycle = 'closed';

      if (firstError !== undefined) {
        throw firstError;
      }
    })();
    return closePromise;
  };

  const initialized = queue ? initializeFundScenarioDeadlineSweep(queue) : Promise.resolve();
  const ready = initialized
    .then(async () => {
      if (lifecycle !== 'initializing') return;
      registerWorker(FUND_SCENARIO_CALC_QUEUE_NAME, worker);
      if (options.healthPort !== null) {
        healthServer = await createHealthServer(
          options.healthPort ?? getHealthPort(),
          deploymentIdentity
        );
      }
      if (lifecycle !== 'initializing') {
        unregisterWorker(FUND_SCENARIO_CALC_QUEUE_NAME, worker);
        await healthServer?.close().catch(() => undefined);
        return;
      }
      lifecycle = 'ready';
    })
    .catch(async (error: unknown) => {
      await closeResources().catch(() => undefined);
      throw error;
    });

  if (options.installSignalHandlers) {
    installGracefulShutdown(closeResources);
  }

  return {
    worker,
    ready,
    close: closeResources,
  };
}

function isDirectEntrypoint(metaUrl: string): boolean {
  if (!process.argv[1]) {
    return false;
  }

  return pathToFileURL(resolve(process.argv[1])).href === metaUrl;
}

if (isDirectEntrypoint(import.meta.url)) {
  const runtime = startFundScenarioCalcWorker({ installSignalHandlers: true });
  await runtime.ready;
}
