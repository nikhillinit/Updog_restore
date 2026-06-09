import { beforeEach, describe, expect, it, vi } from 'vitest';

const { workerConstructorMock, workerOnMock, workerCloseMock, loggerInfoMock, loggerErrorMock } =
  vi.hoisted(() => ({
    workerConstructorMock: vi.fn(),
    workerOnMock: vi.fn(),
    workerCloseMock: vi.fn().mockResolvedValue(undefined),
    loggerInfoMock: vi.fn(),
    loggerErrorMock: vi.fn(),
  }));

vi.mock('bullmq', () => ({
  Worker: function MockWorker(...args: unknown[]) {
    workerConstructorMock(...args);
    return { on: workerOnMock, close: workerCloseMock };
  },
}));

vi.mock('../../../server/queues/redis-connection', () => ({
  getBullMQConnection: vi.fn().mockReturnValue({ host: 'localhost', port: 6379 }),
}));

vi.mock('../../../server/lib/logger', () => ({
  logger: { info: loggerInfoMock, error: loggerErrorMock },
}));

describe('initializeFundScenarioCalcWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('creates a BullMQ Worker on the fund-scenario-calc queue with correct settings', async () => {
    const { initializeFundScenarioCalcWorker } =
      await import('../../../server/queues/fund-scenario-calc-worker-init');
    const mockRedis = {} as import('ioredis').default;

    await initializeFundScenarioCalcWorker(mockRedis);

    expect(workerConstructorMock).toHaveBeenCalledWith(
      'fund-scenario-calc',
      expect.any(Function),
      expect.objectContaining({ concurrency: 2, lockDuration: 300_000 })
    );
  });

  it('returns a close function that calls worker.close()', async () => {
    const { initializeFundScenarioCalcWorker } =
      await import('../../../server/queues/fund-scenario-calc-worker-init');
    const mockRedis = {} as import('ioredis').default;

    const { close } = await initializeFundScenarioCalcWorker(mockRedis);
    await close();

    expect(workerCloseMock).toHaveBeenCalledTimes(1);
  });

  it('logs startup on initialization', async () => {
    const { initializeFundScenarioCalcWorker } =
      await import('../../../server/queues/fund-scenario-calc-worker-init');
    const mockRedis = {} as import('ioredis').default;

    await initializeFundScenarioCalcWorker(mockRedis);

    expect(loggerInfoMock).toHaveBeenCalledWith(expect.stringContaining('[fund-scenario-calc]'));
  });
});
