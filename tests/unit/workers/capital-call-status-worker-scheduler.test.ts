import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockQueue,
  mockWorker,
  QueueMock,
  WorkerMock,
  mockLogger,
  mockDispatch,
  workerJobDurationMock,
  capitalCallStatusHardTimeoutsMock,
  capitalCallStatusHardTimeoutDurationMock,
  CapitalCallStatusHardTimeoutErrorMock,
} = vi.hoisted(() => {
  const mockQueue = {
    add: vi.fn(),
    upsertJobScheduler: vi.fn(),
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockWorker = {
    on: vi.fn(),
    waitUntilReady: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return {
    mockQueue,
    mockWorker,
    QueueMock: vi.fn(function () {
      return mockQueue;
    }),
    WorkerMock: vi.fn(function () {
      return mockWorker;
    }),
    mockLogger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    mockDispatch: vi.fn().mockResolvedValue({ deliveredCount: 0, exhaustedCount: 0 }),
    workerJobDurationMock: { observe: vi.fn() },
    capitalCallStatusHardTimeoutsMock: { inc: vi.fn() },
    capitalCallStatusHardTimeoutDurationMock: { observe: vi.fn() },
    CapitalCallStatusHardTimeoutErrorMock: class CapitalCallStatusHardTimeoutError extends Error {},
  };
});

vi.mock('bullmq', () => ({
  Queue: QueueMock,
  Worker: WorkerMock,
  UnrecoverableError: class UnrecoverableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'UnrecoverableError';
    }
  },
}));

vi.mock('../../../server/db', () => ({
  db: {},
}));

vi.mock('../../../server/lib/logger', () => ({
  logger: mockLogger,
}));

vi.mock('../../../server/services/capital-call-notification-outbox-service', () => ({
  dispatchPendingCapitalCallNotifications: mockDispatch,
  countExhaustedCapitalCallNotifications: vi.fn().mockResolvedValue(0),
  enqueueCapitalCallNotification: vi.fn(),
  transitionCapitalCallWithNotification: vi.fn(),
  transitionCapitalCallWithPayment: vi.fn(),
}));

vi.mock('../../../server/services/capital-call-status-timeout', () => ({
  getCapitalCallStatusHardTimeoutMs: vi.fn(() => 30_000),
  throwIfCapitalCallStatusAborted: vi.fn(),
  isCapitalCallStatusHardTimeoutError: (error: unknown) =>
    error instanceof CapitalCallStatusHardTimeoutErrorMock,
  CapitalCallStatusHardTimeoutError: CapitalCallStatusHardTimeoutErrorMock,
}));

vi.mock('../../../lib/metrics', () => ({
  metrics: {
    workerJobDuration: workerJobDurationMock,
    capitalCallStatusHardTimeouts: capitalCallStatusHardTimeoutsMock,
    capitalCallStatusHardTimeoutDuration: capitalCallStatusHardTimeoutDurationMock,
  },
}));

const fakeRedis = {} as import('ioredis').default;

describe('CapitalCallStatusWorker scheduler registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z'));
    mockQueue.upsertJobScheduler.mockResolvedValue({ id: 'scheduled-job-1' });
    mockQueue.close.mockResolvedValue(undefined);
    mockWorker.close.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers the hourly status check through a stable BullMQ job scheduler', async () => {
    const { CapitalCallStatusWorker } =
      await import('../../../server/workers/capital-call-status-worker');
    const worker = new CapitalCallStatusWorker(fakeRedis, undefined, { hardTimeoutMs: 30_000 });

    await worker.start();

    expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
      'capital-call-status-hourly',
      { every: 60 * 60 * 1000 },
      {
        name: 'scheduled-check',
        data: {
          type: 'scheduled-check',
          timestamp: new Date('2026-08-03T00:00:00.000Z'),
          reason: 'recurring-check',
        },
      }
    );
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('replays startup with the same scheduler identity instead of creating a duplicate', async () => {
    const { CapitalCallStatusWorker } =
      await import('../../../server/workers/capital-call-status-worker');

    await new CapitalCallStatusWorker(fakeRedis, undefined, { hardTimeoutMs: 30_000 }).start();
    await new CapitalCallStatusWorker(fakeRedis, undefined, { hardTimeoutMs: 30_000 }).start();

    expect(mockQueue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    expect(mockQueue.upsertJobScheduler.mock.calls.map(([schedulerId]) => schedulerId)).toEqual([
      'capital-call-status-hourly',
      'capital-call-status-hourly',
    ]);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('closes queue when BullMQ worker construction fails', async () => {
    const failure = new Error('worker constructor failed');
    WorkerMock.mockImplementationOnce(function () {
      throw failure;
    });
    const { createCapitalCallStatusWorker } =
      await import('../../../server/workers/capital-call-status-worker');

    await expect(createCapitalCallStatusWorker(fakeRedis)).rejects.toBe(failure);

    expect(mockQueue.close).toHaveBeenCalledTimes(1);
  });

  it('closes worker and queue independently while preserving first close error', async () => {
    const workerFailure = new Error('worker close failed');
    mockWorker.close.mockRejectedValueOnce(workerFailure);
    mockQueue.close.mockRejectedValueOnce(new Error('queue close failed'));
    const { CapitalCallStatusWorker } =
      await import('../../../server/workers/capital-call-status-worker');
    const worker = new CapitalCallStatusWorker(fakeRedis, undefined, { hardTimeoutMs: 30_000 });

    await expect(worker.stop()).rejects.toBe(workerFailure);

    expect(mockWorker.close).toHaveBeenCalledTimes(1);
    expect(mockQueue.close).toHaveBeenCalledTimes(1);
  });

  it('sanitizes BullMQ worker and queue error logs', async () => {
    const { CapitalCallStatusWorker } =
      await import('../../../server/workers/capital-call-status-worker');
    new CapitalCallStatusWorker(fakeRedis, undefined, { hardTimeoutMs: 30_000 });
    const workerErrorHandler = mockWorker.on.mock.calls.find(([event]) => event === 'error')?.[1];
    const queueErrorHandler = mockQueue.on.mock.calls.find(([event]) => event === 'error')?.[1];
    const secret = 'redis-password-sentinel';
    const replyError = Object.assign(new Error('WRONGPASS authentication failed'), {
      command: { name: 'auth', args: ['default', secret] },
    });

    workerErrorHandler?.(replyError);
    queueErrorHandler?.(replyError);

    const logged = JSON.stringify(mockLogger.error.mock.calls);
    expect(logged).toContain('WRONGPASS');
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain('command');
  });

  it('bounds non-authoritative reminder Redis operations by the worker deadline', async () => {
    const { CapitalCallStatusWorker } =
      await import('../../../server/workers/capital-call-status-worker');
    const worker = new CapitalCallStatusWorker(fakeRedis, undefined, { hardTimeoutMs: 30_000 });
    const stuckRedisOperation = vi.fn(() => new Promise<string>(() => {}));
    const bounded = (
      worker as unknown as {
        bestEffortReminderRedis: <T>(
          operation: () => Promise<T>,
          deadlineAt: number,
          fallback: T
        ) => Promise<T>;
      }
    ).bestEffortReminderRedis(stuckRedisOperation, Date.now() + 1_000, null);

    await vi.advanceTimersByTimeAsync(250);
    await expect(bounded).resolves.toBeNull();
    expect(stuckRedisOperation).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['success', undefined],
    ['failure', new Error('status transition failed')],
    ['hard_timeout', new CapitalCallStatusHardTimeoutErrorMock('hard timeout')],
  ] as const)('observes one terminal %s job duration', async (outcome, error) => {
    const { CapitalCallStatusWorker } =
      await import('../../../server/workers/capital-call-status-worker');
    const worker = new CapitalCallStatusWorker(fakeRedis, undefined, { hardTimeoutMs: 30_000 });
    const internalWorker = worker as unknown as {
      processStatusTransition: () => Promise<unknown>;
      processJob: (job: unknown) => Promise<unknown>;
    };
    internalWorker.processStatusTransition = error
      ? vi.fn().mockRejectedValue(error)
      : vi.fn().mockResolvedValue({
          duration: 1,
          callsChecked: 0,
          statusTransitions: 1,
          notificationsSent: 0,
          success: true,
        });

    const job = { id: 'capital-job', data: { type: 'status-transition', timestamp: new Date() } };
    if (error) {
      await expect(internalWorker.processJob(job)).rejects.toMatchObject(
        outcome === 'hard_timeout' ? { name: 'UnrecoverableError' } : { message: error.message }
      );
    } else {
      await expect(internalWorker.processJob(job)).resolves.toMatchObject({ success: true });
    }

    expect(workerJobDurationMock.observe).toHaveBeenCalledTimes(1);
    expect(workerJobDurationMock.observe).toHaveBeenCalledWith(
      { worker_type: 'capital-call-status', outcome },
      expect.any(Number)
    );
  });
});
