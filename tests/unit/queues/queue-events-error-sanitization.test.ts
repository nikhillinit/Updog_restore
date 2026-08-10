import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  queueEventsListeners,
  queueListeners,
  workerListeners,
  queueConstructorMock,
  workerConstructorMock,
  queueEventsConstructorMock,
  queueCloseMock,
  workerCloseMock,
  queueEventsCloseMock,
  loggerErrorMock,
  reportStatusWhereMock,
} = vi.hoisted(() => {
  const queueEventsListeners: Array<Map<string, (...args: unknown[]) => void>> = [];
  const queueListeners: Array<Map<string, (...args: unknown[]) => void>> = [];
  const workerListeners: Array<Map<string, (...args: unknown[]) => void>> = [];
  const queueConstructorMock = vi.fn();
  const workerConstructorMock = vi.fn();
  const queueEventsConstructorMock = vi.fn();
  const queueCloseMock = vi.fn().mockResolvedValue(undefined);
  const workerCloseMock = vi.fn().mockResolvedValue(undefined);
  const queueEventsCloseMock = vi.fn().mockResolvedValue(undefined);
  const loggerErrorMock = vi.fn();
  const reportStatusWhereMock = vi.fn().mockResolvedValue(undefined);

  return {
    queueEventsListeners,
    queueListeners,
    workerListeners,
    queueConstructorMock,
    workerConstructorMock,
    queueEventsConstructorMock,
    queueCloseMock,
    workerCloseMock,
    queueEventsCloseMock,
    loggerErrorMock,
    reportStatusWhereMock,
  };
});

vi.mock('../../../server/db', () => ({
  db: {
    update: () => ({
      set: () => ({ where: reportStatusWhereMock }),
    }),
  },
}));

vi.mock('../../../server/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: loggerErrorMock,
  },
}));

vi.mock('bullmq', () => ({
  Queue: function MockQueue(...args: unknown[]) {
    queueConstructorMock(...args);
    const listeners = new Map<string, (...listenerArgs: unknown[]) => void>();
    queueListeners.push(listeners);
    return {
      on: (event: string, listener: (...listenerArgs: unknown[]) => void) => {
        listeners.set(event, listener);
      },
      close: queueCloseMock,
    };
  },
  Worker: function MockWorker(...args: unknown[]) {
    workerConstructorMock(...args);
    const listeners = new Map<string, (...listenerArgs: unknown[]) => void>();
    workerListeners.push(listeners);
    return {
      on: (event: string, listener: (...listenerArgs: unknown[]) => void) => {
        listeners.set(event, listener);
      },
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

function getQueueEventsFailedListener(): ((...args: unknown[]) => void) | undefined {
  return queueEventsListeners.at(-1)?.get('failed');
}

function getQueueErrorListener(): ((...args: unknown[]) => void) | undefined {
  return queueListeners.at(-1)?.get('error');
}

function getWorkerErrorListener(): ((...args: unknown[]) => void) | undefined {
  return workerListeners.at(-1)?.get('error');
}

function expectSanitizedBoundaryLog(consoleError: ReturnType<typeof vi.spyOn>): void {
  const serialized = JSON.stringify(consoleError.mock.calls.at(-1));

  expect(serialized).toContain('WRONGPASS');
  expect(serialized).not.toContain(SENTINEL);
  expect(serialized).not.toContain('command');
  expect(serialized).not.toContain('args');
}

function expectSanitizedLoggerLog(): void {
  const serialized = JSON.stringify(loggerErrorMock.mock.calls.at(-1));

  expect(serialized).toContain('WRONGPASS');
  expect(serialized).not.toContain(SENTINEL);
  expect(serialized).not.toContain('command');
  expect(serialized).not.toContain('args');
}

describe('QueueEvents error sanitization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    queueCloseMock.mockReset().mockResolvedValue(undefined);
    workerCloseMock.mockReset().mockResolvedValue(undefined);
    queueEventsCloseMock.mockReset().mockResolvedValue(undefined);
    reportStatusWhereMock.mockReset().mockResolvedValue(undefined);
    queueEventsListeners.splice(0, queueEventsListeners.length);
    queueListeners.splice(0, queueListeners.length);
    workerListeners.splice(0, workerListeners.length);
  });

  it('sanitizes ReplyError command args from report QueueEvents error logs', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { initializeReportQueue } =
      await import('../../../server/queues/report-generation-queue');
    const initialized = await initializeReportQueue({} as import('ioredis').default, {
      startConsumer: true,
    });

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
    const initialized = await initializeSimulationQueue({} as import('ioredis').default, {
      startConsumer: true,
    });

    try {
      const errorListener = getQueueEventsErrorListener();
      expect(errorListener).toEqual(expect.any(Function));
      errorListener?.(makeReplyError());

      expectSanitizedBoundaryLog(consoleError);
    } finally {
      await initialized.close();
    }
  });

  it.each([
    [
      'report',
      async () => {
        const { initializeReportQueue } =
          await import('../../../server/queues/report-generation-queue');
        return initializeReportQueue({} as import('ioredis').default, { startConsumer: true });
      },
    ],
    [
      'simulation',
      async () => {
        const { initializeSimulationQueue } =
          await import('../../../server/queues/simulation-queue');
        return initializeSimulationQueue({} as import('ioredis').default, { startConsumer: true });
      },
    ],
  ])('sanitizes hostile QueueEvents failed reasons from %s', async (_name, initialize) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const initialized = await initialize();

    try {
      const failedListener = getQueueEventsFailedListener();
      expect(failedListener).toEqual(expect.any(Function));
      failedListener?.({ jobId: 'job-1', failedReason: makeReplyError() });

      expectSanitizedBoundaryLog(consoleError);
    } finally {
      await initialized.close();
    }
  });

  it('sanitizes hostile report worker generation errors before logging', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    reportStatusWhereMock.mockRejectedValueOnce(makeReplyError());
    const { initializeReportQueue } =
      await import('../../../server/queues/report-generation-queue');
    const initialized = await initializeReportQueue({} as import('ioredis').default, {
      startConsumer: true,
    });
    const processor = workerConstructorMock.mock.calls.at(-1)?.[1] as
      | ((job: {
          id: string;
          data: Record<string, unknown>;
          updateProgress: () => Promise<void>;
        }) => Promise<unknown>)
      | undefined;

    try {
      expect(processor).toEqual(expect.any(Function));
      await processor?.({
        id: 'job-1',
        data: {
          reportId: 'report-1',
          lpId: 1,
          reportType: 'quarterly',
          format: 'pdf',
          dateRange: { startDate: '2026-01-01', endDate: '2026-03-31' },
        },
        updateProgress: async () => undefined,
      });

      expectSanitizedBoundaryLog(consoleError);
    } finally {
      await initialized.close();
    }
  });

  it.each([
    [
      'report worker',
      async () => {
        const { initializeReportQueue } =
          await import('../../../server/queues/report-generation-queue');
        return initializeReportQueue({} as import('ioredis').default, { startConsumer: true });
      },
    ],
    [
      'simulation worker',
      async () => {
        const { initializeSimulationQueue } =
          await import('../../../server/queues/simulation-queue');
        return initializeSimulationQueue({} as import('ioredis').default, { startConsumer: true });
      },
    ],
  ])('sanitizes ReplyError command args from %s logs', async (_name, initialize) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const initialized = await initialize();

    try {
      const errorListener = getWorkerErrorListener();
      expect(errorListener).toEqual(expect.any(Function));
      errorListener?.(makeReplyError());

      expectSanitizedBoundaryLog(consoleError);
    } finally {
      await initialized.close();
    }
  });

  it('sanitizes ReplyError command args from simulation queue logs', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { initializeSimulationQueue } = await import('../../../server/queues/simulation-queue');
    const initialized = await initializeSimulationQueue({} as import('ioredis').default, {
      startConsumer: true,
    });

    try {
      const errorListener = getQueueErrorListener();
      expect(errorListener).toEqual(expect.any(Function));
      errorListener?.(makeReplyError());

      expectSanitizedBoundaryLog(consoleError);
    } finally {
      await initialized.close();
    }
  });

  it('sanitizes ReplyError command args from backtesting worker and queue logs', async () => {
    const { initializeBacktestingQueue } = await import('../../../server/queues/backtesting-queue');
    const initialized = await initializeBacktestingQueue({} as import('ioredis').default, {
      startConsumer: true,
    });

    try {
      const workerErrorListener = getWorkerErrorListener();
      const queueErrorListener = getQueueErrorListener();
      expect(workerErrorListener).toEqual(expect.any(Function));
      expect(queueErrorListener).toEqual(expect.any(Function));

      workerErrorListener?.(makeReplyError());
      expectSanitizedLoggerLog();
      queueErrorListener?.(makeReplyError());
      expectSanitizedLoggerLog();
    } finally {
      await initialized.close();
    }
  });

  it('does not construct QueueEvents or workers in producer-only mode', async () => {
    const { initializeReportQueue } =
      await import('../../../server/queues/report-generation-queue');
    const { initializeSimulationQueue } = await import('../../../server/queues/simulation-queue');

    const report = await initializeReportQueue({} as import('ioredis').default, {
      startConsumer: false,
    });
    const simulation = await initializeSimulationQueue({} as import('ioredis').default, {
      startConsumer: false,
    });

    try {
      expect(queueConstructorMock).toHaveBeenCalledTimes(2);
      expect(workerConstructorMock).not.toHaveBeenCalled();
      expect(queueEventsConstructorMock).not.toHaveBeenCalled();
    } finally {
      await report.close();
      await simulation.close();
    }
  });

  it.each([
    [
      'simulation',
      async () => {
        const { initializeSimulationQueue } =
          await import('../../../server/queues/simulation-queue');
        return initializeSimulationQueue({} as import('ioredis').default, { startConsumer: true });
      },
      true,
    ],
    [
      'report',
      async () => {
        const { initializeReportQueue } =
          await import('../../../server/queues/report-generation-queue');
        return initializeReportQueue({} as import('ioredis').default, { startConsumer: true });
      },
      true,
    ],
    [
      'backtesting',
      async () => {
        const { initializeBacktestingQueue } =
          await import('../../../server/queues/backtesting-queue');
        return initializeBacktestingQueue({} as import('ioredis').default, { startConsumer: true });
      },
      false,
    ],
  ])(
    'sanitizes hostile close rejection from %s while closing every owned resource',
    async (_name, initialize, hasQueueEvents) => {
      workerCloseMock.mockRejectedValueOnce(makeReplyError());
      const initialized = await initialize();

      await initialized.close();

      expect(workerCloseMock).toHaveBeenCalledTimes(1);
      expect(queueCloseMock).toHaveBeenCalledTimes(1);
      if (hasQueueEvents) {
        expect(queueEventsCloseMock).toHaveBeenCalledTimes(1);
      }
      expectSanitizedLoggerLog();
    }
  );
});
