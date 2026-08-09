import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  queueEventsListeners,
  queueConstructorMock,
  workerConstructorMock,
  queueEventsConstructorMock,
  queueCloseMock,
  workerCloseMock,
  queueEventsCloseMock,
  queueOnMock,
  workerOnMock,
} = vi.hoisted(() => {
  const queueEventsListeners: Array<Map<string, (...args: unknown[]) => void>> = [];
  const queueConstructorMock = vi.fn();
  const workerConstructorMock = vi.fn();
  const queueEventsConstructorMock = vi.fn();
  const queueCloseMock = vi.fn().mockResolvedValue(undefined);
  const workerCloseMock = vi.fn().mockResolvedValue(undefined);
  const queueEventsCloseMock = vi.fn().mockResolvedValue(undefined);
  const queueOnMock = vi.fn();
  const workerOnMock = vi.fn();

  return {
    queueEventsListeners,
    queueConstructorMock,
    workerConstructorMock,
    queueEventsConstructorMock,
    queueCloseMock,
    workerCloseMock,
    queueEventsCloseMock,
    queueOnMock,
    workerOnMock,
  };
});

vi.mock('bullmq', () => ({
  Queue: function MockQueue(...args: unknown[]) {
    queueConstructorMock(...args);
    return {
      on: queueOnMock,
      close: queueCloseMock,
    };
  },
  Worker: function MockWorker(...args: unknown[]) {
    workerConstructorMock(...args);
    return {
      on: workerOnMock,
      close: workerCloseMock,
    };
  },
  QueueEvents: function MockQueueEvents(...args: unknown[]) {
    queueEventsConstructorMock(...args);
    const listeners = new Map<string, (...listenerArgs: unknown[]) => void>();
    queueEventsListeners.push(listeners);
    return {
      on: (event: string, listener: (...listenerArgs: unknown[]) => void) => {
        listeners.set(event, listener);
      },
      close: queueEventsCloseMock,
    };
  },
}));

const SENTINEL = 'sentinel-redis-credential';

function makeReplyError(): Error {
  const error = new Error('WRONGPASS invalid username-password pair');
  error.name = 'ReplyError';
  Object.defineProperty(error, 'command', {
    configurable: true,
    enumerable: true,
    value: { name: 'auth', args: ['default', SENTINEL] },
  });
  return error;
}

function getQueueEventsErrorListener(): ((...args: unknown[]) => void) | undefined {
  return queueEventsListeners.at(-1)?.get('error');
}

function expectSanitizedBoundaryLog(consoleError: ReturnType<typeof vi.spyOn>): void {
  const serialized = JSON.stringify(consoleError.mock.calls.at(-1));

  expect(serialized).toContain('WRONGPASS');
  expect(serialized).not.toContain(SENTINEL);
  expect(serialized).not.toContain('command');
  expect(serialized).not.toContain('args');
}

describe('QueueEvents error sanitization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    queueEventsListeners.splice(0, queueEventsListeners.length);
  });

  it('sanitizes ReplyError command args from report QueueEvents error logs', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { initializeReportQueue } =
      await import('../../../server/queues/report-generation-queue');
    const initialized = await initializeReportQueue({} as import('ioredis').default);

    try {
      const errorListener = getQueueEventsErrorListener();
      expect(errorListener).toEqual(expect.any(Function));
      errorListener?.(makeReplyError());

      expectSanitizedBoundaryLog(consoleError);
    } finally {
      await initialized.close();
    }
  });

  it('sanitizes ReplyError command args from simulation QueueEvents error logs', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { initializeSimulationQueue } = await import('../../../server/queues/simulation-queue');
    const initialized = await initializeSimulationQueue({} as import('ioredis').default);

    try {
      const errorListener = getQueueEventsErrorListener();
      expect(errorListener).toEqual(expect.any(Function));
      errorListener?.(makeReplyError());

      expectSanitizedBoundaryLog(consoleError);
    } finally {
      await initialized.close();
    }
  });
});
