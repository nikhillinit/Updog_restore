/**
 * Contract + behavior tests for POST /api/funds/:id/recalculate
 *
 * Part 1: Service behavior -- mocks db, uuid, fund-state-read-service
 * Part 2: Route contract -- mocks fund-persistence-service, uses supertest
 *
 * Per MEMORY.md: set mock return values in beforeEach, not at declaration,
 * because restoreMocks wipes them.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Part 1: Service behavior tests ──

const { mockDb, mockGetState, mockRunReserveCalculation, mockRunPacingCalculation } = vi.hoisted(
  () => ({
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
    mockGetState: vi.fn(),
    mockRunReserveCalculation: vi.fn(),
    mockRunPacingCalculation: vi.fn(),
  })
);

vi.mock('../../../server/db', () => ({
  db: mockDb,
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'recalc-correlation-id'),
}));

vi.mock('../../../server/services/fund-state-read-service', () => ({
  fundStateReadService: {
    getState: mockGetState,
  },
}));

vi.mock('../../../server/services/reserve-calculation-service', () => ({
  runReserveCalculation: mockRunReserveCalculation,
}));

vi.mock('../../../server/services/pacing-calculation-service', () => ({
  runPacingCalculation: mockRunPacingCalculation,
}));

import { FundPersistenceService } from '../../../server/services/fund-persistence-service';
import type { FundStateReadV1 } from '@shared/contracts/fund-state-read-v1.contract';

// ── Fixtures ──

function publishedFundState(overrides?: Partial<FundStateReadV1>): FundStateReadV1 {
  return {
    fundId: 1,
    configState: {
      latestVersion: 2,
      draftVersion: null,
      publishedVersion: 2,
      hasDraft: false,
      hasPublished: true,
      publishedAt: '2026-03-20T12:00:00.000Z',
      draftUpdatedAt: null,
      publishedUpdatedAt: '2026-03-20T12:00:00.000Z',
    },
    calculationState: {
      status: 'ready',
      configVersion: 2,
      runId: 10,
      correlationId: 'old-corr-id',
      dispatchState: 'dispatched',
      availableSnapshotTypes: ['RESERVE', 'PACING'],
      expectedSnapshotTypes: ['RESERVE', 'PACING'],
      lastCalculatedAt: '2026-03-20T12:30:00.000Z',
      lastError: null,
      legacyEvidence: false,
    },
    legacy: { engineResultsPresent: false },
    ...overrides,
  };
}

function unpublishedFundState(): FundStateReadV1 {
  return {
    fundId: 1,
    configState: {
      latestVersion: 1,
      draftVersion: 1,
      publishedVersion: null,
      hasDraft: true,
      hasPublished: false,
      publishedAt: null,
      draftUpdatedAt: '2026-03-20T10:00:00.000Z',
      publishedUpdatedAt: null,
    },
    calculationState: {
      status: 'not_requested',
      configVersion: null,
      runId: null,
      correlationId: null,
      dispatchState: null,
      availableSnapshotTypes: [],
      expectedSnapshotTypes: ['RESERVE', 'PACING'],
      lastCalculatedAt: null,
      lastError: null,
      legacyEvidence: false,
    },
    legacy: { engineResultsPresent: false },
  };
}

function publishedConfig(modelInputsAsOfDate?: string) {
  return {
    id: 20,
    fundId: 1,
    version: 2,
    config: {
      fundName: 'Published Fund',
      fundSize: 100_000_000,
      ...(modelInputsAsOfDate !== undefined && { modelInputsAsOfDate }),
    },
    isDraft: false,
    isPublished: true,
  };
}

function pendingCalcRun() {
  return {
    id: 50,
    fundId: 1,
    configId: 20,
    configVersion: 2,
    correlationId: 'existing-pending-corr',
    engines: ['reserve', 'pacing'],
    dispatchState: 'pending' as const,
    requestedAt: new Date('2026-03-20T12:00:00.000Z'),
    lastError: null,
  };
}

function failedCalcRun() {
  return {
    id: 49,
    fundId: 1,
    configId: 20,
    configVersion: 2,
    correlationId: 'failed-corr',
    engines: ['reserve', 'pacing'],
    dispatchState: 'failed' as const,
    requestedAt: new Date('2026-03-20T11:00:00.000Z'),
    lastError: 'Inline reserve calculation failed: timeout',
  };
}

// Helper to build Drizzle-like query chain mocks

function whereReturning(value: unknown) {
  const returning = vi.fn().mockResolvedValue(value);
  const where = vi.fn(() => ({ returning }));
  return {
    set: vi.fn(() => ({ where })),
  };
}

function valuesReturning(value: unknown) {
  const returning = vi.fn().mockResolvedValue(value);
  return {
    values: vi.fn(() => ({ returning })),
  };
}

function valuesResolved(value: unknown) {
  return {
    values: vi.fn().mockResolvedValue(value),
  };
}

describe('FundPersistenceService.recalculatePublished behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunReserveCalculation.mockResolvedValue({ snapshotId: 601 });
    mockRunPacingCalculation.mockResolvedValue({ snapshotId: 602 });
  });

  it('throws NoPublishedConfigError when no published config exists', async () => {
    const service = new FundPersistenceService();
    mockGetState.mockResolvedValue(unpublishedFundState());

    await expect(
      service.recalculatePublished(1, { reserve: null, pacing: null, cohort: null })
    ).rejects.toThrow('No published configuration');
  });

  it('throws CalculationInProgressError when status is submitted', async () => {
    const service = new FundPersistenceService();
    mockGetState.mockResolvedValue(
      publishedFundState({
        calculationState: {
          status: 'submitted',
          configVersion: 2,
          runId: 10,
          correlationId: 'sub-corr',
          dispatchState: 'dispatched',
          availableSnapshotTypes: [],
          expectedSnapshotTypes: ['RESERVE', 'PACING'],
          lastCalculatedAt: null,
          lastError: null,
          legacyEvidence: false,
        },
      })
    );

    await expect(
      service.recalculatePublished(1, { reserve: null, pacing: null, cohort: null })
    ).rejects.toThrow('Calculation already in progress');
  });

  it('throws CalculationInProgressError when status is calculating', async () => {
    const service = new FundPersistenceService();
    mockGetState.mockResolvedValue(
      publishedFundState({
        calculationState: {
          status: 'calculating',
          configVersion: 2,
          runId: 10,
          correlationId: 'calc-corr',
          dispatchState: 'dispatched',
          availableSnapshotTypes: ['RESERVE'],
          expectedSnapshotTypes: ['RESERVE', 'PACING'],
          lastCalculatedAt: null,
          lastError: null,
          legacyEvidence: false,
        },
      })
    );

    await expect(
      service.recalculatePublished(1, { reserve: null, pacing: null, cohort: null })
    ).rejects.toThrow('Calculation already in progress');
  });

  it('creates new calcRun when no existing run for published version', async () => {
    const service = new FundPersistenceService();
    mockGetState.mockResolvedValue(publishedFundState());
    mockDb.query.fundConfigs.findFirst.mockResolvedValue(publishedConfig());
    mockDb.query.calcRuns.findFirst.mockResolvedValue(null);

    const newRun = {
      id: 55,
      fundId: 1,
      configId: 20,
      configVersion: 2,
      correlationId: 'recalc-correlation-id',
      engines: ['reserve', 'pacing'],
      dispatchState: 'pending',
      requestedAt: new Date(),
    };
    const dispatchedRun = {
      ...newRun,
      dispatchState: 'dispatched',
      dispatchedAt: new Date(),
      lastError: null,
    };

    const tx = {
      insert: vi
        .fn()
        .mockReturnValueOnce(valuesReturning([newRun])) // calcRun insert
        .mockReturnValueOnce(valuesResolved(undefined)), // fundEvent insert
    };

    mockDb.transaction.mockImplementation(async (callback: (t: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );
    mockDb.update.mockReturnValue(whereReturning([dispatchedRun]));

    const result = await service.recalculatePublished(1, {
      reserve: null,
      pacing: null,
      cohort: null,
    });

    expect(result.correlationId).toBe('recalc-correlation-id');
    expect(result.run.id).toBe(55);
    expect(tx.insert).toHaveBeenCalledTimes(2);
    const legacyRunValues = tx.insert.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(legacyRunValues).toMatchObject({
      modelInputsAsOfDate: null,
      comparisonLineageVersion: null,
    });
  });

  it('copies the owner date and eligible lineage marker onto a new recalculation run', async () => {
    const service = new FundPersistenceService();
    mockGetState.mockResolvedValue(publishedFundState());
    mockDb.query.fundConfigs.findFirst.mockResolvedValue(publishedConfig('2026-06-30'));
    mockDb.query.calcRuns.findFirst.mockResolvedValue(null);

    const newRun = {
      id: 57,
      fundId: 1,
      configId: 20,
      configVersion: 2,
      correlationId: 'recalc-correlation-id',
      engines: ['reserve', 'pacing'],
      dispatchState: 'pending',
      requestedAt: new Date(),
    };
    const tx = {
      insert: vi
        .fn()
        .mockReturnValueOnce(valuesReturning([newRun]))
        .mockReturnValueOnce(valuesResolved(undefined)),
    };
    mockDb.transaction.mockImplementation(async (callback: (t: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );
    mockDb.update.mockReturnValue(
      whereReturning([{ ...newRun, dispatchState: 'dispatched', lastError: null }])
    );

    await service.recalculatePublished(1, {
      reserve: null,
      pacing: null,
      cohort: null,
    });

    const runValues = tx.insert.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(runValues).toMatchObject({
      modelInputsAsOfDate: '2026-06-30',
      comparisonLineageVersion: 'comparison-lineage-v1',
    });
  });

  it('redispatches existing pending run instead of creating new', async () => {
    const service = new FundPersistenceService();
    mockGetState.mockResolvedValue(publishedFundState());
    mockDb.query.fundConfigs.findFirst.mockResolvedValue(publishedConfig());
    mockDb.query.calcRuns.findFirst.mockResolvedValue(pendingCalcRun());

    const redispatchedRun = {
      ...pendingCalcRun(),
      dispatchState: 'dispatched',
      dispatchedAt: new Date(),
      lastError: null,
    };

    mockDb.update.mockReturnValue(whereReturning([redispatchedRun]));
    mockDb.query.fundSnapshots.findMany.mockResolvedValue([]);

    const result = await service.recalculatePublished(1, {
      reserve: null,
      pacing: null,
      cohort: null,
    });

    expect(result.correlationId).toBe('existing-pending-corr');
    expect(result.run.id).toBe(50);
    // No transaction should be called (no new run created)
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('creates new calcRun when existing run is failed', async () => {
    const service = new FundPersistenceService();
    mockGetState.mockResolvedValue(publishedFundState());
    mockDb.query.fundConfigs.findFirst.mockResolvedValue(publishedConfig());
    mockDb.query.calcRuns.findFirst.mockResolvedValue(failedCalcRun());

    const newRun = {
      id: 56,
      fundId: 1,
      configId: 20,
      configVersion: 2,
      correlationId: 'recalc-correlation-id',
      engines: ['reserve', 'pacing'],
      dispatchState: 'pending',
      requestedAt: new Date(),
    };
    const dispatchedRun = {
      ...newRun,
      dispatchState: 'dispatched',
      dispatchedAt: new Date(),
      lastError: null,
    };

    const tx = {
      insert: vi
        .fn()
        .mockReturnValueOnce(valuesReturning([newRun]))
        .mockReturnValueOnce(valuesResolved(undefined)),
    };

    mockDb.transaction.mockImplementation(async (callback: (t: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );
    mockDb.update.mockReturnValue(whereReturning([dispatchedRun]));

    const result = await service.recalculatePublished(1, {
      reserve: null,
      pacing: null,
      cohort: null,
    });

    expect(result.correlationId).toBe('recalc-correlation-id');
    expect(result.run.id).toBe(56);
    expect(tx.insert).toHaveBeenCalledTimes(2); // calcRun + fundEvent
  });

  it('logs CALC_TRIGGERED fundEvent with correlationId and userId', async () => {
    const service = new FundPersistenceService();
    mockGetState.mockResolvedValue(publishedFundState());
    mockDb.query.fundConfigs.findFirst.mockResolvedValue(publishedConfig());
    mockDb.query.calcRuns.findFirst.mockResolvedValue(null);

    const newRun = {
      id: 60,
      fundId: 1,
      configId: 20,
      configVersion: 2,
      correlationId: 'recalc-correlation-id',
      engines: ['reserve', 'pacing'],
      dispatchState: 'pending',
      requestedAt: new Date(),
    };
    const dispatchedRun = { ...newRun, dispatchState: 'dispatched', lastError: null };

    const tx = {
      insert: vi
        .fn()
        .mockReturnValueOnce(valuesReturning([newRun]))
        .mockReturnValueOnce(valuesResolved(undefined)),
    };

    mockDb.transaction.mockImplementation(async (callback: (t: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );
    mockDb.update.mockReturnValue(whereReturning([dispatchedRun]));

    await service.recalculatePublished(1, { reserve: null, pacing: null, cohort: null }, 42);

    // Second insert call = fundEvent
    const insertCalls = tx.insert.mock.calls;
    expect(insertCalls).toHaveLength(2);

    // Verify the fundEvent insert was called with values containing CALC_TRIGGERED
    const secondInsertReturn = tx.insert.mock.results[1];
    expect(secondInsertReturn).toBeDefined();
    // The values() call on the second insert should have been called with CALC_TRIGGERED payload
    const secondInsertChain = tx.insert.mock.results[1]?.value;
    const valuesArg = secondInsertChain.values.mock.calls[0]?.[0];
    expect(valuesArg).toMatchObject({
      fundId: 1,
      eventType: 'CALC_TRIGGERED',
      correlationId: 'recalc-correlation-id',
      userId: 42,
    });
    expect(valuesArg.payload).toMatchObject({
      engines: ['reserve', 'pacing'],
      correlationId: 'recalc-correlation-id',
    });
  });

  it('returns shape with run and correlationId', async () => {
    const service = new FundPersistenceService();
    mockGetState.mockResolvedValue(publishedFundState());
    mockDb.query.fundConfigs.findFirst.mockResolvedValue(publishedConfig());
    mockDb.query.calcRuns.findFirst.mockResolvedValue(null);

    const newRun = {
      id: 61,
      fundId: 1,
      configId: 20,
      configVersion: 2,
      correlationId: 'recalc-correlation-id',
      engines: ['reserve', 'pacing'],
      dispatchState: 'pending',
      requestedAt: new Date(),
    };
    const dispatchedRun = { ...newRun, dispatchState: 'dispatched', lastError: null };

    const tx = {
      insert: vi
        .fn()
        .mockReturnValueOnce(valuesReturning([newRun]))
        .mockReturnValueOnce(valuesResolved(undefined)),
    };

    mockDb.transaction.mockImplementation(async (callback: (t: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );
    mockDb.update.mockReturnValue(whereReturning([dispatchedRun]));

    const result = await service.recalculatePublished(1, {
      reserve: null,
      pacing: null,
      cohort: null,
    });

    expect(result).toHaveProperty('run');
    expect(result).toHaveProperty('correlationId');
    expect(result.run).toHaveProperty('id');
    expect(result.run).toHaveProperty('dispatchState');
    expect(typeof result.correlationId).toBe('string');
  });
});

// ── Part 2: Route contract tests ──

// The route tests use a separate mocking strategy: mock the persistence service
// at module level and test HTTP layer only. We need a separate describe block
// that registers routes after the persistence service mock is in place.
// Since fund-config.ts uses dynamic import for the persistence service,
// our vi.mock above already intercepts it.

describe('POST /api/funds/:id/recalculate route contract', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    const { registerFundConfigRoutes } = await import('../../../server/routes/fund-config');
    registerFundConfigRoutes(app);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when no published configuration exists', async () => {
    // Import the service class to mock recalculatePublished
    const mod = await import('../../../server/services/fund-persistence-service');
    const { NoPublishedConfigError } = mod;
    vi.spyOn(mod.fundPersistenceService, 'recalculatePublished').mockRejectedValue(
      new NoPublishedConfigError()
    );

    const res = await request(app).post('/api/funds/1/recalculate');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'No published configuration');
    expect(res.body).toHaveProperty('message', 'Publish a configuration first');
  });

  it('returns 409 when calculation is already in progress', async () => {
    const mod = await import('../../../server/services/fund-persistence-service');
    const { CalculationInProgressError } = mod;
    vi.spyOn(mod.fundPersistenceService, 'recalculatePublished').mockRejectedValue(
      new CalculationInProgressError()
    );

    const res = await request(app).post('/api/funds/1/recalculate');

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error', 'Calculation already in progress');
    expect(res.body).toHaveProperty('message', 'Wait for the current calculation to complete');
  });

  it('returns 200 with success, runId, correlationId, and dispatchState', async () => {
    const mod = await import('../../../server/services/fund-persistence-service');
    vi.spyOn(mod.fundPersistenceService, 'recalculatePublished').mockResolvedValue({
      run: {
        id: 55,
        fundId: 1,
        configId: 20,
        configVersion: 2,
        correlationId: 'recalc-corr-200',
        engines: ['reserve', 'pacing'],
        dispatchState: 'dispatched',
        requestedAt: new Date(),
        dispatchedAt: new Date(),
        failedAt: null,
        lastError: null,
      },
      correlationId: 'recalc-corr-200',
    });

    const res = await request(app).post('/api/funds/1/recalculate');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      correlationId: 'recalc-corr-200',
      runId: 55,
      dispatchState: 'dispatched',
    });
  });

  it('does not forward NaN userId when authenticated subject is nonnumeric', async () => {
    const mod = await import('../../../server/services/fund-persistence-service');
    const recalculateSpy = vi
      .spyOn(mod.fundPersistenceService, 'recalculatePublished')
      .mockResolvedValue({
        run: {
          id: 55,
          fundId: 1,
          configId: 20,
          configVersion: 2,
          correlationId: 'recalc-corr-200',
          engines: ['reserve', 'pacing'],
          dispatchState: 'dispatched',
          requestedAt: new Date(),
          dispatchedAt: new Date(),
          failedAt: null,
          lastError: null,
        },
        correlationId: 'recalc-corr-200',
      });
    const appWithStringUser = express();
    appWithStringUser.use(express.json());
    appWithStringUser.use((req, _res, next) => {
      req.user = {
        id: 'auth0|user-7',
        sub: 'auth0|user-7',
        email: 'user7@example.com',
        roles: [],
        fundIds: [1],
        ip: '127.0.0.1',
        userAgent: 'vitest',
      };
      next();
    });
    const { registerFundConfigRoutes } = await import('../../../server/routes/fund-config');
    registerFundConfigRoutes(appWithStringUser);

    const res = await request(appWithStringUser).post('/api/funds/1/recalculate');

    expect(res.status).toBe(200);
    expect(recalculateSpy).toHaveBeenCalledWith(
      1,
      { reserve: null, pacing: null, cohort: null },
      undefined
    );
  });

  it('returns 403 without recalculating when user lacks fund scope', async () => {
    const mod = await import('../../../server/services/fund-persistence-service');
    const recalculateSpy = vi
      .spyOn(mod.fundPersistenceService, 'recalculatePublished')
      .mockResolvedValue({
        run: {
          id: 55,
          fundId: 1,
          configId: 20,
          configVersion: 2,
          correlationId: 'recalc-corr-200',
          engines: ['reserve', 'pacing'],
          dispatchState: 'dispatched',
          requestedAt: new Date(),
          dispatchedAt: new Date(),
          failedAt: null,
          lastError: null,
        },
        correlationId: 'recalc-corr-200',
      });
    const restrictedApp = express();
    restrictedApp.use(express.json());
    restrictedApp.use((req, _res, next) => {
      req.user = {
        id: 'user-7',
        sub: 'user-7',
        email: 'user7@example.com',
        roles: [],
        fundIds: [99],
        ip: '127.0.0.1',
        userAgent: 'vitest',
      };
      next();
    });
    const { registerFundConfigRoutes } = await import('../../../server/routes/fund-config');
    registerFundConfigRoutes(restrictedApp);

    const res = await request(restrictedApp).post('/api/funds/1/recalculate');

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: 'Forbidden',
      code: 'FUND_ACCESS_DENIED',
      message: 'You do not have access to fund 1',
    });
    expect(recalculateSpy).not.toHaveBeenCalled();
  });

  it('returns 400 for non-integer fund ID', async () => {
    const res = await request(app).post('/api/funds/abc/recalculate');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid fund ID');
  });
});
