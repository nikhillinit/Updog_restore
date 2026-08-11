import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hasQueueRuntimeFailure,
  inspectQueueRuntime,
  isQueueRuntimeExpectedInApiProcess,
} from '../../../server/routes/health.js';
import {
  getQueueCatalog,
  getQueueCatalogEntry,
  getRegisteredQueueRuntime,
  registerQueueRuntime,
  resetQueueRegistry,
  unregisterQueueRuntime,
} from '../../../server/queues/registry.js';
import { resolveQueueProcessPolicy } from '../../../server/config/queue-runtime-policy.js';

const queue = {
  getWaitingCount: async () => 0,
  getActiveCount: async () => 0,
  getDelayedCount: async () => 0,
  getFailedCount: async () => 0,
};

afterEach(() => resetQueueRegistry());

describe('queue runtime health modes', () => {
  it('treats absent external and unavailable runtimes as non-failing in a production API process', async () => {
    const policy = resolveQueueProcessPolicy({
      NODE_ENV: 'production',
      VERCEL: '1',
      ENABLE_QUEUES: '1',
      QUEUE_REDIS_URL: 'redis://queue.internal:6379',
    });

    const health = Object.fromEntries(
      await Promise.all(
        getQueueCatalog()
          .filter((entry) => !entry.quarantined)
          .map(async (entry) => [
            entry.queueName,
            await inspectQueueRuntime(entry, isQueueRuntimeExpectedInApiProcess(entry, policy)),
          ])
      )
    );

    expect(health['fund-scenario-calc']).toMatchObject({
      status: 'not_applicable',
      initialized: false,
    });
    expect(health['capital-call-status']).toMatchObject({
      status: 'not_applicable',
      initialized: false,
    });
    expect(hasQueueRuntimeFailure(health)).toBe(false);
  });

  it('requires only API-owned runtimes under each local queue policy', () => {
    const producerPolicy = resolveQueueProcessPolicy({
      NODE_ENV: 'test',
      ENABLE_QUEUES: '1',
      QUEUE_REDIS_URL: 'redis://127.0.0.1:6379',
    });
    const consumerPolicy = resolveQueueProcessPolicy({
      NODE_ENV: 'test',
      ENABLE_QUEUES: '1',
      ENABLE_IN_PROCESS_QUEUE_WORKERS: '1',
      QUEUE_REDIS_URL: 'redis://127.0.0.1:6379',
    });

    const expectedKeys = (policy: typeof producerPolicy) =>
      getQueueCatalog()
        .filter((entry) => isQueueRuntimeExpectedInApiProcess(entry, policy))
        .map((entry) => entry.key);

    expect(expectedKeys(producerPolicy)).toEqual(['simulation', 'report', 'backtesting']);
    expect(expectedKeys(consumerPolicy)).toEqual([
      'simulation',
      'report',
      'backtesting',
      'fund-scenario-calc',
    ]);
  });

  it('uses a producer runtime override instead of the catalog worker default', async () => {
    registerQueueRuntime('simulation', {
      getQueue: () => queue as never,
      isInitialized: () => true,
      healthMode: 'producer',
    });

    await expect(inspectQueueRuntime(getQueueCatalogEntry('simulation'))).resolves.toMatchObject({
      status: 'ok',
      mode: 'producer',
      initialized: true,
    });
  });

  it('reports the local fund worker healthy before its route-owned producer is first used', async () => {
    registerQueueRuntime('fund-scenario-calc', {
      getQueue: () => null,
      getWorker: () => ({}) as never,
      isInitialized: () => true,
      healthMode: 'worker',
    });

    await expect(inspectQueueRuntime(getQueueCatalogEntry('fund-scenario-calc'))).resolves.toEqual(
      expect.objectContaining({
        status: 'ok',
        mode: 'worker',
        workerAttached: true,
      })
    );
  });

  it('keeps worker health truth after a route-owned producer joins the runtime', async () => {
    const worker = {};
    registerQueueRuntime('fund-scenario-calc', {
      getQueue: () => null,
      getWorker: () => worker as never,
      isInitialized: () => true,
      healthMode: 'worker',
    });
    registerQueueRuntime('fund-scenario-calc', {
      getQueue: () => queue as never,
      isInitialized: () => true,
      healthMode: 'producer',
    });

    await expect(
      inspectQueueRuntime(getQueueCatalogEntry('fund-scenario-calc'))
    ).resolves.toMatchObject({
      status: 'ok',
      mode: 'worker',
      workerAttached: true,
    });
  });

  it('composes producer-first startup and closes worker plus producer exactly once', async () => {
    const producerClose = vi.fn().mockResolvedValue(undefined);
    const workerClose = vi.fn().mockResolvedValue(undefined);
    registerQueueRuntime('fund-scenario-calc', {
      getQueue: () => queue as never,
      isInitialized: () => true,
      healthMode: 'producer',
      close: producerClose,
    });
    registerQueueRuntime('fund-scenario-calc', {
      getQueue: () => null,
      getWorker: () => ({}) as never,
      isInitialized: () => true,
      healthMode: 'worker',
      close: workerClose,
    });

    const runtime = getRegisteredQueueRuntime('fund-scenario-calc');
    expect(runtime?.healthMode).toBe('worker');
    await runtime?.close?.();

    expect(workerClose).toHaveBeenCalledTimes(1);
    expect(producerClose).toHaveBeenCalledTimes(1);
    expect(getRegisteredQueueRuntime('fund-scenario-calc')).toBeUndefined();
  });

  it('keeps producer health when worker closes first', async () => {
    const closeProducer = vi.fn().mockImplementation(async () => {
      unregisterQueueRuntime('fund-scenario-calc', 'producer');
    });
    const closeWorker = vi.fn().mockImplementation(async () => {
      unregisterQueueRuntime('fund-scenario-calc', 'worker');
    });
    registerQueueRuntime('fund-scenario-calc', {
      getQueue: () => queue as never,
      isInitialized: () => true,
      healthMode: 'producer',
      close: closeProducer,
    });
    registerQueueRuntime('fund-scenario-calc', {
      getQueue: () => null,
      getWorker: () => ({}) as never,
      isInitialized: () => true,
      healthMode: 'worker',
      close: closeWorker,
    });

    await closeWorker();

    expect(getRegisteredQueueRuntime('fund-scenario-calc')).toMatchObject({
      healthMode: 'producer',
    });
    expect(getRegisteredQueueRuntime('fund-scenario-calc')?.getQueue()).toBe(queue);
  });

  it('keeps worker health when producer closes first', async () => {
    const closeProducer = vi.fn().mockImplementation(async () => {
      unregisterQueueRuntime('fund-scenario-calc', 'producer');
    });
    const closeWorker = vi.fn().mockImplementation(async () => {
      unregisterQueueRuntime('fund-scenario-calc', 'worker');
    });
    registerQueueRuntime('fund-scenario-calc', {
      getQueue: () => null,
      getWorker: () => ({}) as never,
      isInitialized: () => true,
      healthMode: 'worker',
      close: closeWorker,
    });
    registerQueueRuntime('fund-scenario-calc', {
      getQueue: () => queue as never,
      isInitialized: () => true,
      healthMode: 'producer',
      close: closeProducer,
    });

    await closeProducer();

    expect(getRegisteredQueueRuntime('fund-scenario-calc')).toMatchObject({
      healthMode: 'worker',
    });
    expect(getRegisteredQueueRuntime('fund-scenario-calc')?.getWorker?.()).not.toBeNull();
  });
});
