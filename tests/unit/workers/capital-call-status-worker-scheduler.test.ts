import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQueue, QueueMock, WorkerMock, mockLogger, mockDispatch } = vi.hoisted(() => {
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
  };
});

vi.mock('bullmq', () => ({
  Queue: QueueMock,
  Worker: WorkerMock,
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
}));

const fakeRedis = {} as import('ioredis').default;

describe('CapitalCallStatusWorker scheduler registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z'));
    mockQueue.upsertJobScheduler.mockResolvedValue({ id: 'scheduled-job-1' });
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
    ).bestEffortReminderRedis(stuckRedisOperation, Date.now() + 100, null);

    await vi.advanceTimersByTimeAsync(100);
    await expect(bounded).resolves.toBeNull();
    expect(stuckRedisOperation).toHaveBeenCalledTimes(1);
  });
});
