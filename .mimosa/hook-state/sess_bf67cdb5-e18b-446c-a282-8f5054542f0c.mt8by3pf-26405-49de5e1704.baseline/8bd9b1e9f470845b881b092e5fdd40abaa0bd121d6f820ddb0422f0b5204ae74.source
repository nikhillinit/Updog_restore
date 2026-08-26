import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  runReserveScenarioCalculationMock,
  ownershipLostOutcome,
  reserveMetricTimerMock,
  reserveEngineErrorMock,
  reserveFailureCounterMock,
  fundScenarioHardTimeoutsMock,
  fundScenarioHardTimeoutDurationMock,
  loggerInfoMock,
  loggerErrorMock,
  workerConstructorMock,
  queueConstructorMock,
  queueUpsertSchedulerMock,
  queueCloseMock,
  sweepDeadlineMock,
  registerWorkerMock,
  createHealthServerMock,
  getQueueConnectionOptionsMock,
} = vi.hoisted(() => ({
  runReserveScenarioCalculationMock: vi.fn(),
  ownershipLostOutcome: { kind: 'ownership_lost' as const },
  reserveMetricTimerMock: vi.fn(),
  reserveEngineErrorMock: vi.fn(),
  reserveFailureCounterMock: vi.fn(),
  fundScenarioHardTimeoutsMock: { inc: vi.fn() },
  fundScenarioHardTimeoutDurationMock: { observe: vi.fn() },
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  workerConstructorMock: vi.fn(),
  queueConstructorMock: vi.fn(),
  queueUpsertSchedulerMock: vi.fn().mockResolvedValue(undefined),
  queueCloseMock: vi.fn().mockResolvedValue(undefined),
  sweepDeadlineMock: vi.fn().mockResolvedValue({ reconciledCount: 0, timedOutCount: 0 }),
  registerWorkerMock: vi.fn(),
  createHealthServerMock: vi.fn(),
  getQueueConnectionOptionsMock: vi.fn(),
}));

vi.mock('../../../server/services/fund-scenario-reserve-calculation-service', () => ({
  runReserveScenarioCalculation: runReserveScenarioCalculationMock,
  isScenarioCalculationOwnershipLost: (value: unknown) => value === ownershipLostOutcome,
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
  withMetrics: vi.fn((_name: string, callback: () => unknown) => callback()),
  metrics: {
    counter: reserveFailureCounterMock,
    engineLatency: { startTimer: vi.fn(() => reserveMetricTimerMock) },
    engineErrors: { inc: reserveEngineErrorMock },
    fundScenarioHardTimeouts: fundScenarioHardTimeoutsMock,
    fundScenarioHardTimeoutDuration: fundScenarioHardTimeoutDurationMock,
  },
}));

vi.mock('../../../workers/health-server', () => ({
  registerWorker: registerWorkerMock,
  createHealthServer: createHealthServerMock,
}));

vi.mock('../../../server/services/fund-scenario-calculation-run-service', () => ({
  sweepFundScenarioCalculationRunDeadlines: sweepDeadlineMock,
}));

vi.mock('bullmq', () => ({
  UnrecoverableError: class UnrecoverableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'UnrecoverableError';
    }
  },
  Queue: class MockQueue {
    constructor(...args: unknown[]) {
      queueConstructorMock(...args);
    }

    upsertJobScheduler = queueUpsertSchedulerMock;
    close = queueCloseMock;
  },
  Worker: class MockWorker {
    constructor(...args: unknown[]) {
      workerConstructorMock(...args);
    }

    listeners = new Map<string, (error: Error) => void>();

    on = (event: string, listener: (error: Error) => void) => {
      this.listeners.set(event, listener);
      return this;
    };

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
    const signal = new AbortController().signal;

    expect(handleFundScenarioCalcJob.length).toBe(3);

    const result = await handleFundScenarioCalcJob({
      id: 'job-1',
      attemptsMade: 0,
      opts: { attempts: 2 },
      data: {
        fundId: 1,
        scenarioSetId: '00000000-0000-0000-0000-000000000111',
        correlationId: '00000000-0000-0000-0000-000000000123',
        calculationMode: 'async_reserve_allocation',
        runId: 'run-1',
        actor: { userId: 17, label: 'analyst@example.com' },
      },
    }, 'bullmq-token', signal);

    expect(result).toEqual({ snapshotId: 42 });
    expect(runReserveScenarioCalculationMock).toHaveBeenCalledWith(expect.objectContaining({
      fundId: 1,
      scenarioSetId: '00000000-0000-0000-0000-000000000111',
      correlationId: '00000000-0000-0000-0000-000000000123',
      actor: { userId: 17, label: 'analyst@example.com' },
      jobId: 'job-1',
      runId: 'run-1',
      isFinalAttempt: false,
      signal: expect.any(AbortSignal),
      abortController: expect.any(AbortController),
    }));
    expect(loggerInfoMock).toHaveBeenCalledWith(
      'Processing reserve scenario calculation',
      expect.objectContaining({ jobId: 'job-1' })
    );
  });

  it('treats a private ownership-loss outcome as a completed delivery', async () => {
    const { handleFundScenarioCalcJob } =
      await import('../../../workers/fund-scenario-calc-handler');
    runReserveScenarioCalculationMock.mockResolvedValue(ownershipLostOutcome);

    await expect(
      handleFundScenarioCalcJob({
        id: 'job-lost-owner',
        attemptsMade: 0,
        opts: { attempts: 2 },
        data: {
          fundId: 1,
          scenarioSetId: '00000000-0000-0000-0000-000000000111',
          correlationId: '00000000-0000-0000-0000-000000000123',
          calculationMode: 'async_reserve_allocation',
          runId: 'run-lost-owner',
          actor: null,
        },
      })
    ).resolves.toBeUndefined();

    expect(loggerErrorMock).not.toHaveBeenCalled();
    expect(reserveMetricTimerMock).not.toHaveBeenCalled();
    expect(reserveEngineErrorMock).not.toHaveBeenCalled();
    expect(reserveFailureCounterMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported calculation modes and logs failures', async () => {
    const { handleFundScenarioCalcJob } =
      await import('../../../workers/fund-scenario-calc-handler');

    await expect(
      handleFundScenarioCalcJob({
        id: 'job-2',
        attemptsMade: 0,
        opts: { attempts: 1 },
        data: {
          fundId: 1,
          scenarioSetId: '00000000-0000-0000-0000-000000000111',
          correlationId: '00000000-0000-0000-0000-000000000123',
          calculationMode: 'sync_fee_profile',
          runId: 'run-unsupported',
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

  it('routes tagged hard-timeout aborts to an unrecoverable BullMQ failure', async () => {
    const { handleFundScenarioCalcJob } =
      await import('../../../workers/fund-scenario-calc-handler');
    const { FundScenarioHardTimeoutError } =
      await import('../../../server/services/fund-scenario-timeout');
    runReserveScenarioCalculationMock.mockRejectedValue(
      new FundScenarioHardTimeoutError('run-timeout')
    );

    await expect(
      handleFundScenarioCalcJob({
        id: 'job-timeout',
        attemptsMade: 0,
        opts: { attempts: 2 },
        data: {
          fundId: 1,
          scenarioSetId: '00000000-0000-0000-0000-000000000111',
          correlationId: '00000000-0000-0000-0000-000000000123',
          calculationMode: 'async_reserve_allocation',
          runId: 'run-timeout',
          actor: null,
        },
      })
    ).rejects.toMatchObject({ name: 'UnrecoverableError' });

    expect(fundScenarioHardTimeoutsMock.inc).toHaveBeenCalledTimes(1);
    expect(fundScenarioHardTimeoutDurationMock.observe).toHaveBeenCalledWith(30);
    expect(loggerErrorMock).not.toHaveBeenCalled();
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
    FUND_SCENARIO_SWEEP_ENABLED: process.env['FUND_SCENARIO_SWEEP_ENABLED'],
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env['FUND_SCENARIO_WORKER_HEALTH_PORT'];
    delete process.env['PORT'];
    delete process.env['WORKER_HEALTH_PORT'];
    delete process.env['FUND_SCENARIO_SWEEP_ENABLED'];
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

  it('registers and immediately runs the gated 60-second deadline sweep', async () => {
    process.env['FUND_SCENARIO_SWEEP_ENABLED'] = '1';
    const { startFundScenarioCalcWorker } =
      await import('../../../workers/fund-scenario-calc-worker');

    const runtime = startFundScenarioCalcWorker({ healthPort: null });
    await runtime.ready;

    expect(queueConstructorMock).toHaveBeenCalledWith(
      'fund-scenario-calc',
      expect.objectContaining({ connection: expect.any(Object) })
    );
    expect(queueUpsertSchedulerMock).toHaveBeenCalledWith(
      'fund-scenario-deadline-sweep',
      { every: 60_000 },
      expect.objectContaining({ name: 'fund-scenario-deadline-sweep' })
    );
    expect(sweepDeadlineMock).toHaveBeenCalledTimes(1);

    await runtime.close();
    expect(queueCloseMock).toHaveBeenCalledTimes(1);
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

  it('attaches an error listener that logs sanitized errors without Redis command args', async () => {
    const { startFundScenarioCalcWorker } =
      await import('../../../workers/fund-scenario-calc-worker');

    const runtime = startFundScenarioCalcWorker({ healthPort: 0 });
    const listener = (
      runtime.worker as unknown as { listeners: Map<string, (error: Error) => void> }
    ).listeners.get('error');
    expect(listener).toBeTypeOf('function');

    const secret = 'redis-credential-sentinel';
    const replyError = new Error('WRONGPASS invalid username-password pair or user is disabled');
    replyError.name = 'ReplyError';
    Object.assign(replyError, { command: { name: 'auth', args: ['default', secret] } });

    listener!(replyError);

    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
    const call = loggerErrorMock.mock.calls[0];
    expect(call[0]).toContain('fund-scenario-calc worker');
    expect(JSON.stringify(call)).toContain('WRONGPASS');
    expect(JSON.stringify(call)).not.toContain(secret);
    expect(JSON.stringify(call)).not.toContain('"command"');
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
