import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Redis from 'ioredis';

import { getQueueConnectionOptions } from '../server/config/features';
import { getCapitalCallStatusHardTimeoutMs } from '../server/services/capital-call-status-timeout';
import { createCapitalCallStatusWorker } from '../server/workers/capital-call-status-worker';
import {
  createHealthServer,
  registerWorker,
  unregisterWorker,
  type WorkerHealthServerRuntime,
} from './health-server';
import { resolveWorkerDeploymentIdentity } from './worker-deployment-identity';

export function isDirectEntrypoint(metaUrl: string): boolean {
  if (!process.argv[1]) return false;
  return pathToFileURL(resolve(process.argv[1])).href === metaUrl;
}

function parseHealthPort(value: string | undefined): number | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  const port = Number(normalized);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null;
}

function getHealthPort(): number {
  return (
    parseHealthPort(process.env['WORKER_HEALTH_PORT']) ??
    parseHealthPort(process.env['CAPITAL_CALL_STATUS_WORKER_HEALTH_PORT']) ??
    parseHealthPort(process.env['PORT']) ??
    9005
  );
}

export async function startCapitalCallStatusWorker(): Promise<{
  stop: () => Promise<void>;
}> {
  const deploymentIdentity = resolveWorkerDeploymentIdentity('capital-call-status');

  const connection = getQueueConnectionOptions();
  if (!connection) {
    throw new Error(
      'Capital call status queue Redis connection is not configured; set QUEUE_REDIS_URL or REDIS_URL with ENABLE_QUEUES=1'
    );
  }

  const hardTimeoutMs = getCapitalCallStatusHardTimeoutMs();
  let redis: Redis | undefined;
  const resources: {
    worker?: Awaited<ReturnType<typeof createCapitalCallStatusWorker>>;
    bullMqWorker?: ReturnType<
      Awaited<ReturnType<typeof createCapitalCallStatusWorker>>['getBullMqWorker']
    >;
    healthServer?: WorkerHealthServerRuntime;
  } = {};

  let stopRequested = false;
  let stopPromise: Promise<void> | undefined;
  let unregisteredWorker: typeof resources.bullMqWorker;
  let stoppedWorker: typeof resources.worker;
  let closedHealthServer: typeof resources.healthServer;
  let redisClosed = false;
  let initializationSettled = false;
  let resolveInitializationSettled: () => void;
  const initializationSettledPromise = new Promise<void>((resolve) => {
    resolveInitializationSettled = resolve;
  });

  const removeSignalHandlers = (): void => {
    process.removeListener('SIGTERM', handleSigterm);
    process.removeListener('SIGINT', handleSigint);
  };

  const cleanupResources = async (): Promise<void> => {
    let firstError: unknown;
    if (resources.bullMqWorker && resources.bullMqWorker !== unregisteredWorker) {
      unregisteredWorker = resources.bullMqWorker;
      try {
        unregisterWorker('capital-call-status', resources.bullMqWorker);
      } catch (error) {
        firstError = error;
      }
    }

    if (resources.worker && resources.worker !== stoppedWorker) {
      stoppedWorker = resources.worker;
      try {
        await resources.worker.stop();
      } catch (error) {
        firstError ??= error;
      }
    }

    if (resources.healthServer && resources.healthServer !== closedHealthServer) {
      closedHealthServer = resources.healthServer;
      try {
        await resources.healthServer.close();
      } catch (error) {
        firstError ??= error;
      }
    }

    if (redis && !redisClosed) {
      redisClosed = true;
      try {
        await redis.quit();
      } catch (error) {
        firstError ??= error;
      }
    }

    if (firstError !== undefined) {
      throw firstError;
    }
  };

  const stop = (): Promise<void> => {
    stopRequested = true;
    removeSignalHandlers();
    stopPromise ??= (async () => {
      let firstError: unknown;
      const initializationWasPending = !initializationSettled;
      try {
        await cleanupResources();
      } catch (error) {
        firstError = error;
      }

      if (initializationWasPending) {
        await initializationSettledPromise;
        try {
          await cleanupResources();
        } catch (error) {
          firstError ??= error;
        }
      }

      if (firstError !== undefined) {
        throw firstError;
      }
    })();
    return stopPromise;
  };

  const handleSigterm = async (): Promise<void> => {
    await stop().catch(() => undefined);
  };
  const handleSigint = async (): Promise<void> => {
    await stop().catch(() => undefined);
    process.exit(0);
  };

  process.once('SIGTERM', handleSigterm);
  process.once('SIGINT', handleSigint);

  let startupError: unknown;
  try {
    redis = new Redis({ ...connection, maxRetriesPerRequest: null });
    if (!stopRequested) {
      const worker = await createCapitalCallStatusWorker(redis, undefined, { hardTimeoutMs });
      // eslint-disable-next-line require-atomic-updates -- the stop gate cleans resources assigned after shutdown begins.
      resources.worker = worker;
      // eslint-disable-next-line require-atomic-updates -- the stop gate cleans resources assigned after shutdown begins.
      resources.bullMqWorker = worker.getBullMqWorker();
      if (!stopRequested) {
        registerWorker('capital-call-status', resources.bullMqWorker, () =>
          worker.getHealthDetails()
        );
        if (!stopRequested) {
          await worker.start();
        }
      }
      if (!stopRequested) {
        const healthServer = await createHealthServer(getHealthPort(), deploymentIdentity);
        // eslint-disable-next-line require-atomic-updates -- the stop gate closes health assigned after shutdown begins.
        resources.healthServer = healthServer;
      }
    }
  } catch (error) {
    startupError = error;
  } finally {
    initializationSettled = true;
    resolveInitializationSettled!();
  }

  if (startupError !== undefined) {
    await stop().catch(() => undefined);
    throw startupError;
  }

  return { stop };
}

if (isDirectEntrypoint(import.meta.url)) {
  await startCapitalCallStatusWorker();
}
