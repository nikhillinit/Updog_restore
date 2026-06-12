import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  runReserveScenarioCalculationMock,
  loggerInfoMock,
  loggerErrorMock,
  workerConstructorMock,
  registerWorkerMock,
  createHealthServerMock,
  getQueueConnectionOptionsMock,
} = vi.hoisted(() => ({
  runReserveScenarioCalculationMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  workerConstructorMock: vi.fn(),
  registerWorkerMock: vi.fn(),
  createHealthServerMock: vi.fn(),
  getQueueConnectionOptionsMock: vi.fn(),
}));

vi.mock('../../../server/services/fund-scenario-reserve-calculation-service', () => ({
  runReserveScenarioCalculation: runReserveScenarioCalculationMock,
}));

vi.mock('../../../server/config/features', () => ({
  getQueueConnectionOptions: getQueueConnectionOptionsMock,
}));

vi.mock('../../../lib/logger', () => ({
  logger: {
    info: loggerInfoMock,
    error: loggerErrorMock,
  },
}));

vi.mock('../../../lib/metrics', () => ({
  withMetrics: (_name: string, callback: () => unknown) => callback(),
  metrics: {
    counter: vi.fn(),
  },
}));

vi.mock('../../../workers/health-server', () => ({
  registerWorker: registerWorkerMock,
  createHealthServer: createHealthServerMock,
}));

vi.mock('bullmq', () => ({
  Worker: class MockWorker {
    constructor(...args: unknown[]) {
      workerConstructorMock(...args);
    }

    close = vi.fn();
  },
}));

describe('fund scenario calc worker handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches async reserve allocation jobs to the reserve scenario service', async () => {
    const { handleFundScenarioCalcJob } =
      await import('../../../workers/fund-scenario-calc-handler');
    runReserveScenarioCalculationMock.mockResolvedValue({ snapshotId: 42 });

    const result = await handleFundScenarioCalcJob({
      id: 'job-1',
      data: {
        fundId: 1,
        scenarioSetId: '00000000-0000-0000-0000-000000000111',
        correlationId: '00000000-0000-0000-0000-000000000123',
        calculationMode: 'async_reserve_allocation',
        actor: { userId: 17, label: 'analyst@example.com' },
      },
    });

    expect(result).toEqual({ snapshotId: 42 });
    expect(runReserveScenarioCalculationMock).toHaveBeenCalledWith({
      fundId: 1,
      scenarioSetId: '00000000-0000-0000-0000-000000000111',
      correlationId: '00000000-0000-0000-0000-000000000123',
      actor: { userId: 17, label: 'analyst@example.com' },
      jobId: 'job-1',
    });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      'Processing reserve scenario calculation',
      expect.objectContaining({ jobId: 'job-1' })
    );
  });

  it('rejects unsupported calculation modes and logs failures', async () => {
    const { handleFundScenarioCalcJob } =
      await import('../../../workers/fund-scenario-calc-handler');

    await expect(
      handleFundScenarioCalcJob({
        id: 'job-2',
        data: {
          fundId: 1,
          scenarioSetId: '00000000-0000-0000-0000-000000000111',
          correlationId: '00000000-0000-0000-0000-000000000123',
          calculationMode: 'sync_fee_profile',
          actor: null,
        },
      })
    ).rejects.toThrow(/Unsupported fund scenario calculation mode/);

    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Reserve scenario calculation failed',
      expect.any(Error),
      expect.objectContaining({ jobId: 'job-2' })
    );
  });

  it('importing the handler does not start a BullMQ worker or health server', async () => {
    await import('../../../workers/fund-scenario-calc-handler');

    expect(workerConstructorMock).not.toHaveBeenCalled();
    expect(registerWorkerMock).not.toHaveBeenCalled();
    expect(createHealthServerMock).not.toHaveBeenCalled();
  });
});

describe('fund scenario calc worker startup', () => {
  const originalEnv = {
    FUND_SCENARIO_WORKER_HEALTH_PORT: process.env['FUND_SCENARIO_WORKER_HEALTH_PORT'],
    PORT: process.env['PORT'],
    WORKER_HEALTH_PORT: process.env['WORKER_HEALTH_PORT'],
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env['FUND_SCENARIO_WORKER_HEALTH_PORT'];
    delete process.env['PORT'];
    delete process.env['WORKER_HEALTH_PORT'];
    getQueueConnectionOptionsMock.mockReturnValue({
      host: 'queue-host',
      port: 6380,
      username: 'queue-user',
      password: 'queue-pass',
      db: 4,
    });
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('uses the shared queue connection resolver for production worker startup', async () => {
    const { startFundScenarioCalcWorker } =
      await import('../../../workers/fund-scenario-calc-worker');

    startFundScenarioCalcWorker({ healthPort: 0 });

    expect(getQueueConnectionOptionsMock).toHaveBeenCalledTimes(1);
    expect(workerConstructorMock).toHaveBeenCalledWith(
      'fund-scenario-calc',
      expect.any(Function),
      expect.objectContaining({
        connection: {
          host: 'queue-host',
          port: 6380,
          username: 'queue-user',
          password: 'queue-pass',
          db: 4,
        },
      })
    );
    expect(registerWorkerMock).toHaveBeenCalledWith('fund-scenario-calc', expect.any(Object));
    expect(createHealthServerMock).toHaveBeenCalledWith(0);
  });

  it('falls back to Railway PORT when WORKER_HEALTH_PORT resolves empty', async () => {
    process.env['WORKER_HEALTH_PORT'] = '';
    process.env['PORT'] = '19234';
    const { startFundScenarioCalcWorker } =
      await import('../../../workers/fund-scenario-calc-worker');

    startFundScenarioCalcWorker();

    expect(createHealthServerMock).toHaveBeenCalledWith(19234);
  });

  it('ignores unresolved Railway variable templates when selecting the health port', async () => {
    process.env['WORKER_HEALTH_PORT'] = '${{PORT}}';
    process.env['PORT'] = '19235';
    const { startFundScenarioCalcWorker } =
      await import('../../../workers/fund-scenario-calc-worker');

    startFundScenarioCalcWorker();

    expect(createHealthServerMock).toHaveBeenCalledWith(19235);
  });

  it('fails fast when queue Redis is not configured', async () => {
    getQueueConnectionOptionsMock.mockReturnValue(null);
    const { startFundScenarioCalcWorker } =
      await import('../../../workers/fund-scenario-calc-worker');

    expect(() => startFundScenarioCalcWorker({ healthPort: 0 })).toThrow(
      /queue Redis connection is not configured/i
    );
    expect(workerConstructorMock).not.toHaveBeenCalled();
    expect(registerWorkerMock).not.toHaveBeenCalled();
    expect(createHealthServerMock).not.toHaveBeenCalled();
  });
});
