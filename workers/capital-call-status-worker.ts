import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Redis from 'ioredis';

import { getQueueConnectionOptions } from '../server/config/features';
import { getCapitalCallStatusHardTimeoutMs } from '../server/services/capital-call-status-timeout';
import { createCapitalCallStatusWorker } from '../server/workers/capital-call-status-worker';
import { createHealthServer, registerWorker } from './health-server';

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
  const connection = getQueueConnectionOptions();
  if (!connection) {
    throw new Error(
      'Capital call status queue Redis connection is not configured; set QUEUE_REDIS_URL or REDIS_URL with ENABLE_QUEUES=1'
    );
  }

  const hardTimeoutMs = getCapitalCallStatusHardTimeoutMs();
  const redis = new Redis({ ...connection, maxRetriesPerRequest: null });
  const worker = createCapitalCallStatusWorker(redis, undefined, { hardTimeoutMs });

  registerWorker('capital-call-status', worker.getBullMqWorker(), () => worker.getHealthDetails());
  createHealthServer(getHealthPort());

  await worker.start();

  const stop = async (): Promise<void> => {
    await worker.stop();
    await redis.quit();
  };

  process.once('SIGTERM', async () => {
    await stop();
  });
  process.once('SIGINT', async () => {
    await stop();
    process.exit(0);
  });

  return { stop };
}

if (isDirectEntrypoint(import.meta.url)) {
  await startCapitalCallStatusWorker();
}
