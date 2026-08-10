import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  closeRegisteredQueueRuntimes,
  getRegisteredQueueRuntime,
  registerQueueRuntime,
  resetQueueRegistry,
  type RegisteredQueueRuntime,
} from '../../../server/queues/registry';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function producerRuntime(queue: object, close: () => Promise<void>): RegisteredQueueRuntime {
  return {
    getQueue: () => queue as never,
    isInitialized: () => true,
    healthMode: 'producer',
    close,
  };
}

function workerRuntime(worker: object, close: () => Promise<void>): RegisteredQueueRuntime {
  return {
    getQueue: () => null,
    getWorker: () => worker as never,
    isInitialized: () => true,
    healthMode: 'worker',
    close,
  };
}

describe('queue registry lifecycle identity', () => {
  afterEach(() => {
    resetQueueRegistry();
  });

  it('does not let a stale composite close unregister replacement components', async () => {
    const closing = deferred();
    const oldWorker = workerRuntime({ id: 'old-worker' }, () => closing.promise);
    const oldProducer = producerRuntime({ id: 'old-producer' }, () => closing.promise);
    registerQueueRuntime('fund-scenario-calc', oldWorker);
    registerQueueRuntime('fund-scenario-calc', oldProducer);

    const staleClose = getRegisteredQueueRuntime('fund-scenario-calc')?.close?.();
    const replacementWorkerObject = { id: 'replacement-worker' };
    const replacementQueueObject = { id: 'replacement-producer' };
    registerQueueRuntime(
      'fund-scenario-calc',
      workerRuntime(replacementWorkerObject, vi.fn().mockResolvedValue(undefined))
    );
    registerQueueRuntime(
      'fund-scenario-calc',
      producerRuntime(replacementQueueObject, vi.fn().mockResolvedValue(undefined))
    );

    closing.resolve();
    await staleClose;

    const current = getRegisteredQueueRuntime('fund-scenario-calc');
    expect(current?.getWorker?.()).toBe(replacementWorkerObject);
    expect(current?.getQueue()).toBe(replacementQueueObject);
  });

  it('does not let bulk teardown erase a runtime registered while an old close is pending', async () => {
    const closing = deferred();
    registerQueueRuntime(
      'fund-scenario-calc',
      producerRuntime({ id: 'old-producer' }, () => closing.promise)
    );

    const staleBulkClose = closeRegisteredQueueRuntimes();
    const replacementQueueObject = { id: 'replacement-producer' };
    registerQueueRuntime(
      'fund-scenario-calc',
      producerRuntime(replacementQueueObject, vi.fn().mockResolvedValue(undefined))
    );

    closing.resolve();
    await staleBulkClose;

    expect(getRegisteredQueueRuntime('fund-scenario-calc')?.getQueue()).toBe(
      replacementQueueObject
    );
  });
});
