import IORedis from 'ioredis';
import { logger } from '../lib/logger.js';
import { sanitizeQueueError } from '../lib/queue-error-sanitizer.js';
import { initializeBacktestingQueue } from './backtesting-queue.js';
import { initializeFundScenarioCalcWorker } from './fund-scenario-calc-worker-init.js';
import { initializeReportQueue } from './report-generation-queue.js';
import { initializeSimulationQueue } from './simulation-queue.js';

export interface ProviderQueueRuntime {
  enabled: boolean;
  producersEnabled: boolean;
  consumersEnabled: boolean;
  close(): Promise<void>;
}

interface ClosableQueueRuntime {
  close(): Promise<void>;
}

const disabledRuntime = (): ProviderQueueRuntime => ({
  enabled: false,
  producersEnabled: false,
  consumersEnabled: false,
  close: async () => {},
});

/**
 * Builds legacy provider-owned queues independently from their local consumers.
 * Production route-owned producers deliberately use their own lifecycle.
 */
export async function createProviderQueueRuntime(input: {
  queueRedisUrl: string;
  startConsumers: boolean;
}): Promise<ProviderQueueRuntime> {
  let redis: IORedis | null = null;
  let runtimes: ClosableQueueRuntime[] = [];
  let closed = false;

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    const closableRuntimes = runtimes;
    const closableRedis = redis;
    runtimes = [];
    redis = null;
    await Promise.allSettled(closableRuntimes.map((runtime) => runtime.close()));
    await closableRedis?.quit();
  };

  try {
    redis = new IORedis(input.queueRedisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
    });
    await redis.connect();

    const initializers: Array<Promise<ClosableQueueRuntime>> = [
      initializeSimulationQueue(redis, { startConsumer: input.startConsumers }),
      initializeReportQueue(redis, { startConsumer: input.startConsumers }),
      initializeBacktestingQueue(redis, { startConsumer: input.startConsumers }),
    ];
    if (input.startConsumers) {
      initializers.push(initializeFundScenarioCalcWorker(redis));
    }

    const results = await Promise.allSettled(initializers);
    runtimes = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    if (results.some((result) => result.status === 'rejected')) {
      for (const result of results) {
        if (result.status === 'rejected') {
          logger.warn(
            { err: sanitizeQueueError(result.reason) },
            '[providers] Queue runtime failed to initialize'
          );
        }
      }
      await close();
      return disabledRuntime();
    }

    return {
      enabled: true,
      producersEnabled: true,
      consumersEnabled: input.startConsumers,
      close,
    };
  } catch (error) {
    logger.warn(
      { err: sanitizeQueueError(error) },
      '[providers] Queue runtime failed to initialize'
    );
    await close();
    return disabledRuntime();
  }
}
