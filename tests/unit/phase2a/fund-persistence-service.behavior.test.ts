import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockRunReserveCalculation, mockRunPacingCalculation, mockRunEconomicsCalculation } =
  vi.hoisted(() => ({
    mockDb: {
      query: {
        fundConfigs: {
          findFirst: vi.fn(),
        },
        calcRuns: {
          findFirst: vi.fn(),
        },
        fundSnapshots: {
          findMany: vi.fn(),
        },
      },
      transaction: vi.fn(),
      update: vi.fn(),
    },
    mockRunReserveCalculation: vi.fn(),
    mockRunPacingCalculation: vi.fn(),
    mockRunEconomicsCalculation: vi.fn(),
  }));

vi.mock('../../../server/db', () => ({
  db: mockDb,
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'new-correlation-id'),
}));

vi.mock('../../../server/services/reserve-calculation-service', () => ({
  runReserveCalculation: mockRunReserveCalculation,
}));

vi.mock('../../../server/services/pacing-calculation-service', () => ({
  runPacingCalculation: mockRunPacingCalculation,
}));

vi.mock('../../../server/services/economics-calculation-service', () => ({
  runEconomicsCalculation: mockRunEconomicsCalculation,
}));

import { FundPersistenceService } from '../../../server/services/fund-persistence-service';

function whereResolved(value: unknown) {
  const where = vi.fn().mockResolvedValue(value);
  return {
    set: vi.fn(() => ({ where })),
  };
}

function whereReturning(value: unknown) {
  const returning = vi.fn().mockResolvedValue(value);
  const where = vi.fn(() => ({ returning }));
  return {
    set: vi.fn(() => ({ where })),
  };
}

function valuesResolved(value: unknown) {
  return {
    values: vi.fn().mockResolvedValue(value),
  };
}

function valuesReturning(value: unknown) {
  const returning = vi.fn().mockResolvedValue(value);
  return {
    values: vi.fn(() => ({ returning })),
  };
}

describe('FundPersistenceService publishDraft behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunReserveCalculation.mockResolvedValue({ snapshotId: 501 });
    mockRunPacingCalculation.mockResolvedValue({ snapshotId: 502 });
    mockRunEconomicsCalculation.mockResolvedValue({ snapshotId: 503 });
  });

  afterEach(() => {
    delete process.env['ENABLE_GP_ECONOMICS_ENGINE'];
  });

  it('runs authoritative calculations inline when no producer queues are available', async () => {
    const service = new FundPersistenceService();
    const draft = {
      id: 11,
      fundId: 1,
      version: 3,
      config: { fundSize: 125_000_000 },
    };
    const published = {
      id: 11,
      fundId: 1,
      version: 3,
      config: { fundSize: 125_000_000 },
      isDraft: false,
      isPublished: true,
    };
    const pendingRun = {
      id: 44,
      fundId: 1,
      configId: 11,
      configVersion: 3,
      correlationId: 'new-correlation-id',
      engines: ['reserve', 'pacing'],
      dispatchState: 'pending',
      requestedAt: new Date('2026-03-22T10:00:00.000Z'),
      lastError: null,
    };
    const dispatchedRun = {
      ...pendingRun,
      dispatchState: 'dispatched',
      dispatchedAt: new Date('2026-03-22T10:00:01.000Z'),
      lastError: null,
    };

    const tx = {
      query: {
        fundConfigs: {
          findFirst: vi.fn().mockResolvedValue(draft),
        },
      },
      update: vi
        .fn()
        .mockReturnValueOnce(whereResolved(undefined))
        .mockReturnValueOnce(whereReturning([published])),
      insert: vi
        .fn()
        .mockReturnValueOnce(valuesReturning([pendingRun]))
        .mockReturnValueOnce(valuesResolved(undefined))
        .mockReturnValueOnce(valuesResolved(undefined)),
    };

    mockDb.transaction.mockImplementation(async (callback: (tx: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );
    mockDb.update.mockReturnValue(whereReturning([dispatchedRun]));

    const result = await service.publishDraft(1, { reserve: null, pacing: null, cohort: null }, 99);

    expect(result.run.dispatchState).toBe('dispatched');
    expect(result.run.lastError).toBeNull();
    expect(mockRunReserveCalculation).toHaveBeenCalledTimes(1);
    expect(mockRunPacingCalculation).toHaveBeenCalledTimes(1);
  });

  it('runs experimental economics inline when the flag and assumptions are present', async () => {
    process.env['ENABLE_GP_ECONOMICS_ENGINE'] = 'true';
    const service = new FundPersistenceService();
    const config = {
      fundName: 'Economics Fund',
      fundSize: 125_000_000,
      economicsAssumptions: { version: 'v1' },
    };
    const draft = {
      id: 12,
      fundId: 1,
      version: 4,
      config,
    };
    const published = {
      id: 12,
      fundId: 1,
      version: 4,
      config,
      isDraft: false,
      isPublished: true,
    };
    const pendingRun = {
      id: 45,
      fundId: 1,
      configId: 12,
      configVersion: 4,
      correlationId: 'new-correlation-id',
      engines: ['reserve', 'pacing', 'economics'],
      dispatchState: 'pending',
      requestedAt: new Date('2026-03-22T10:00:00.000Z'),
      lastError: null,
    };
    const dispatchedRun = {
      ...pendingRun,
      dispatchState: 'dispatched',
      dispatchedAt: new Date('2026-03-22T10:00:01.000Z'),
      lastError: null,
    };

    const tx = {
      query: {
        fundConfigs: {
          findFirst: vi.fn().mockResolvedValue(draft),
        },
      },
      update: vi
        .fn()
        .mockReturnValueOnce(whereResolved(undefined))
        .mockReturnValueOnce(whereReturning([published])),
      insert: vi
        .fn()
        .mockReturnValueOnce(valuesReturning([pendingRun]))
        .mockReturnValueOnce(valuesResolved(undefined))
        .mockReturnValueOnce(valuesResolved(undefined)),
    };

    mockDb.transaction.mockImplementation(async (callback: (tx: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );
    mockDb.update.mockReturnValue(whereReturning([dispatchedRun]));

    const result = await service.publishDraft(
      1,
      { reserve: null, pacing: null, cohort: null, economics: null },
      99
    );

    expect(result.run.dispatchState).toBe('dispatched');
    expect(mockRunReserveCalculation).toHaveBeenCalledTimes(1);
    expect(mockRunPacingCalculation).toHaveBeenCalledTimes(1);
    expect(mockRunEconomicsCalculation).toHaveBeenCalledTimes(1);
    expect(mockRunEconomicsCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: 1,
        runId: 45,
        configId: 12,
        configVersion: 4,
      })
    );
  });

  it('re-dispatches partial runs using only missing authoritative engines', async () => {
    const service = new FundPersistenceService();
    const published = {
      id: 21,
      fundId: 1,
      version: 4,
      config: { fundSize: 90_000_000 },
      isDraft: false,
      isPublished: true,
    };
    const partialRun = {
      id: 77,
      fundId: 1,
      configId: 21,
      configVersion: 4,
      correlationId: 'existing-correlation-id',
      engines: ['reserve', 'pacing', 'cohort'],
      dispatchState: 'partial',
      requestedAt: new Date('2026-03-22T10:15:00.000Z'),
      lastError: 'Inline pacing calculation failed: timeout',
    };
    const redispatchedRun = {
      ...partialRun,
      dispatchState: 'dispatched',
      dispatchedAt: new Date('2026-03-22T10:15:10.000Z'),
      lastError: null,
    };

    const tx = {
      query: {
        fundConfigs: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    };

    const pacingQueue = {
      add: vi.fn().mockResolvedValue({ id: 'run:77:pacing' }),
    };
    const reserveQueue = {
      add: vi.fn(),
    };
    const cohortQueue = {
      add: vi.fn(),
    };

    mockDb.transaction.mockImplementation(async (callback: (tx: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );
    mockDb.query.fundConfigs.findFirst.mockResolvedValue(published);
    mockDb.query.calcRuns.findFirst.mockResolvedValue(partialRun);
    mockDb.query.fundSnapshots.findMany.mockResolvedValue([{ type: 'RESERVE' }]);
    mockDb.update.mockReturnValue(whereReturning([redispatchedRun]));

    const result = await service.publishDraft(
      1,
      {
        reserve: reserveQueue as any,
        pacing: pacingQueue as any,
        cohort: cohortQueue as any,
      },
      99
    );

    expect(result.correlationId).toBe('existing-correlation-id');
    expect(pacingQueue.add).toHaveBeenCalledTimes(1);
    expect(reserveQueue.add).not.toHaveBeenCalled();
    expect(cohortQueue.add).not.toHaveBeenCalled();
    expect(mockRunReserveCalculation).not.toHaveBeenCalled();
    expect(mockRunPacingCalculation).not.toHaveBeenCalled();
  });

  it('reuses the published run when a concurrent request already consumed the draft', async () => {
    const service = new FundPersistenceService();
    const draft = {
      id: 31,
      fundId: 1,
      version: 5,
      config: { fundSize: 110_000_000 },
    };
    const published = {
      id: 31,
      fundId: 1,
      version: 5,
      config: { fundSize: 110_000_000 },
      isDraft: false,
      isPublished: true,
    };
    const existingRun = {
      id: 88,
      fundId: 1,
      configId: 31,
      configVersion: 5,
      correlationId: 'winner-correlation-id',
      engines: ['reserve', 'pacing', 'cohort'],
      dispatchState: 'dispatched',
      requestedAt: new Date('2026-03-22T10:30:00.000Z'),
      lastError: null,
    };

    const txInsert = vi.fn();
    const tx = {
      query: {
        fundConfigs: {
          findFirst: vi.fn().mockResolvedValue(draft),
        },
      },
      update: vi
        .fn()
        .mockReturnValueOnce(whereResolved(undefined))
        .mockReturnValueOnce(whereReturning([])),
      insert: txInsert,
    };

    mockDb.transaction.mockImplementation(async (callback: (tx: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );
    mockDb.query.fundConfigs.findFirst.mockResolvedValue(published);
    mockDb.query.calcRuns.findFirst.mockResolvedValue(existingRun);

    const result = await service.publishDraft(1, { reserve: null, pacing: null, cohort: null }, 99);

    expect(result.correlationId).toBe('winner-correlation-id');
    expect(result.run.id).toBe(existingRun.id);
    expect(txInsert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockRunReserveCalculation).not.toHaveBeenCalled();
    expect(mockRunPacingCalculation).not.toHaveBeenCalled();
  });
});
