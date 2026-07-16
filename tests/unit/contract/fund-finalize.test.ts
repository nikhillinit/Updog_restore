/**
 * Contract + behavior tests for POST /api/funds/finalize
 *
 * Part 1: Zod schema validation (FundFinalizeV1Schema, FundFinalizeResponseV1Schema)
 * Part 2: Service behavior -- mocks db, uuid, inline calc services
 * Part 3: Route contract -- mocks fund-persistence-service, uses supertest
 *
 * Per MEMORY.md: set mock return values in beforeEach, not at declaration,
 * because restoreMocks wipes them.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FundFinalizeV1Schema,
  FundFinalizeResponseV1Schema,
} from '@shared/contracts/fund-finalize-v1.contract';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validFinalizePayload = {
  name: 'Press On Fund V',
  size: 50_000_000,
  managementFee: 0.02,
  carryPercentage: 0.2,
  vintageYear: 2026,
  modelInputsAsOfDate: '2026-06-30',
  targetMetrics: {
    targetIRR: 0.25,
    targetTVPI: 2.5,
    targetDPI: 1.5,
    targetCompanyCount: 25,
    targetReserveRatio: 0.5,
  },
  stages: [{ id: 'stg-1', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
};

const minimalFinalizePayload = {
  name: 'Minimal Fund',
  size: 10_000_000,
  modelInputsAsOfDate: '2026-06-30',
};

// ---------------------------------------------------------------------------
// Part 1: Zod schema validation
// ---------------------------------------------------------------------------

describe('FundFinalizeV1Schema', () => {
  it('accepts a valid finalize payload with draft config fields', () => {
    const result = FundFinalizeV1Schema.safeParse(validFinalizePayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Press On Fund V');
      expect(result.data.size).toBe(50_000_000);
      expect(result.data.targetMetrics?.targetIRR).toBe(0.25);
      expect(result.data.stages).toHaveLength(1);
    }
  });

  it('accepts minimal publish payload with the required owner date', () => {
    const result = FundFinalizeV1Schema.safeParse(minimalFinalizePayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.managementFee).toBe(0.02);
      expect(result.data.carryPercentage).toBe(0.2);
      expect(result.data.vintageYear).toBeGreaterThanOrEqual(2020);
    }
  });

  it('rejects publish payloads without a model inputs as-of date', () => {
    const { modelInputsAsOfDate: _omitted, ...withoutOwnerDate } = minimalFinalizePayload;

    expect(FundFinalizeV1Schema.safeParse(withoutOwnerDate).success).toBe(false);
  });

  it('rejects non-calendar and non-YYYY-MM-DD model input dates', () => {
    expect(
      FundFinalizeV1Schema.safeParse({
        ...minimalFinalizePayload,
        modelInputsAsOfDate: '2026-02-30',
      }).success
    ).toBe(false);
    expect(
      FundFinalizeV1Schema.safeParse({
        ...minimalFinalizePayload,
        modelInputsAsOfDate: '06/30/2026',
      }).success
    ).toBe(false);
  });

  it('accepts draftFundId for routed wizard finalize', () => {
    const result = FundFinalizeV1Schema.safeParse({
      ...minimalFinalizePayload,
      draftFundId: 77,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.draftFundId).toBe(77);
    }
  });

  it('rejects invalid draftFundId', () => {
    const result = FundFinalizeV1Schema.safeParse({
      ...minimalFinalizePayload,
      draftFundId: 0,
    });

    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const result = FundFinalizeV1Schema.safeParse({ size: 50_000_000 });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = FundFinalizeV1Schema.safeParse({ name: '', size: 50_000_000 });
    expect(result.success).toBe(false);
  });

  it('rejects negative size', () => {
    const result = FundFinalizeV1Schema.safeParse({ name: 'Bad Fund', size: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys (.strict())', () => {
    const result = FundFinalizeV1Schema.safeParse({
      ...minimalFinalizePayload,
      bogusField: true,
    });
    expect(result.success).toBe(false);
  });

  it('preserves all fields through parse round-trip', () => {
    const fullPayload = {
      ...validFinalizePayload,
      waterfallType: 'american' as const,
      recyclingEnabled: true,
    };
    const result = FundFinalizeV1Schema.safeParse(fullPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Press On Fund V');
      expect(result.data.targetMetrics?.targetTVPI).toBe(2.5);
      expect(result.data.waterfallType).toBe('american');
      expect(result.data.recyclingEnabled).toBe(true);
    }
  });
});

describe('FundFinalizeResponseV1Schema', () => {
  it('accepts a valid response', () => {
    const result = FundFinalizeResponseV1Schema.safeParse({
      success: true,
      data: {
        fundId: 1,
        configVersion: 1,
        correlationId: '550e8400-e29b-41d4-a716-446655440000',
        published: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects response with success: false', () => {
    const result = FundFinalizeResponseV1Schema.safeParse({
      success: false,
      data: {
        fundId: 1,
        configVersion: 1,
        correlationId: '550e8400-e29b-41d4-a716-446655440000',
        published: true,
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects response missing data.fundId', () => {
    const result = FundFinalizeResponseV1Schema.safeParse({
      success: true,
      data: {
        configVersion: 1,
        correlationId: '550e8400-e29b-41d4-a716-446655440000',
        published: true,
      },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Part 2: Service behavior tests
// ---------------------------------------------------------------------------

const { mockDb, mockRunReserveCalculation, mockRunPacingCalculation } = vi.hoisted(() => ({
  mockDb: {
    query: {
      fundConfigs: { findFirst: vi.fn() },
      calcRuns: { findFirst: vi.fn() },
      fundSnapshots: { findMany: vi.fn() },
    },
    transaction: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
  mockRunReserveCalculation: vi.fn(),
  mockRunPacingCalculation: vi.fn(),
}));

vi.mock('../../../server/db', () => ({
  db: mockDb,
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'finalize-correlation-id'),
}));

vi.mock('../../../server/services/fund-state-read-service', () => ({
  fundStateReadService: { getState: vi.fn() },
}));

vi.mock('../../../server/services/reserve-calculation-service', () => ({
  runReserveCalculation: mockRunReserveCalculation,
}));

vi.mock('../../../server/services/pacing-calculation-service', () => ({
  runPacingCalculation: mockRunPacingCalculation,
}));

import {
  FundPersistenceService,
  NoActiveDraftForFinalizeError,
} from '../../../server/services/fund-persistence-service';
import type { PublishQueues } from '../../../server/services/fund-persistence-service';

// Drizzle chain helpers (matching fund-recalculate.test.ts pattern)

function valuesReturning(value: unknown) {
  const returning = vi.fn().mockResolvedValue(value);
  return { values: vi.fn(() => ({ returning })) };
}

function valuesResolved(value: unknown) {
  return { values: vi.fn().mockResolvedValue(value) };
}

function whereReturning(value: unknown) {
  const returning = vi.fn().mockResolvedValue(value);
  const where = vi.fn(() => ({ returning }));
  return { set: vi.fn(() => ({ where })) };
}

const nullQueues: PublishQueues = { reserve: null, pacing: null, cohort: null };

describe('FundPersistenceService.finalize behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunReserveCalculation.mockResolvedValue({ snapshotId: 701 });
    mockRunPacingCalculation.mockResolvedValue({ snapshotId: 702 });
  });

  it('creates fund + draft + publishes and returns correlationId', async () => {
    const service = new FundPersistenceService();

    // createFundWithInitialDraft transaction mock
    const fundRow = {
      id: 10,
      name: 'Press On Fund V',
      size: '50000000',
      managementFee: '0.02',
      carryPercentage: '0.2',
      vintageYear: 2026,
    };
    const draftRow = {
      id: 100,
      fundId: 10,
      version: 1,
      config: { modelInputsAsOfDate: '2026-06-30' },
      isDraft: true,
      isPublished: false,
    };

    // publishDraft needs: find draft, update old published, update draft->published, create calcRun, create events
    const publishedRow = {
      ...draftRow,
      isDraft: false,
      isPublished: true,
      publishedAt: new Date(),
    };
    const calcRunRow = {
      id: 200,
      fundId: 10,
      configId: 100,
      configVersion: 1,
      correlationId: 'finalize-correlation-id',
      engines: ['reserve', 'pacing'],
      dispatchState: 'pending',
      requestedAt: new Date(),
    };
    const dispatchedRun = {
      ...calcRunRow,
      dispatchState: 'dispatched',
      dispatchedAt: new Date(),
      lastError: null,
    };

    // First transaction: createFundWithInitialDraft
    // Second transaction: publishDraft
    let txCallCount = 0;
    mockDb.transaction.mockImplementation(
      async (callback: (tx: Record<string, unknown>) => Promise<unknown>) => {
        txCallCount++;
        if (txCallCount === 1) {
          // createFundWithInitialDraft transaction
          const tx = {
            insert: vi
              .fn()
              .mockReturnValueOnce(valuesReturning([fundRow])) // funds insert
              .mockReturnValueOnce(valuesReturning([draftRow])) // fundConfigs insert
              .mockReturnValueOnce(valuesResolved(undefined)), // fundEvents insert
          };
          return callback(tx);
        }
        // publishDraft transaction
        const tx = {
          query: {
            fundConfigs: {
              findFirst: vi.fn().mockResolvedValue(draftRow),
            },
          },
          update: vi
            .fn()
            .mockReturnValueOnce(whereReturning([])) // unpublish old
            .mockReturnValueOnce(whereReturning([publishedRow])), // publish draft
          insert: vi
            .fn()
            .mockReturnValueOnce(valuesReturning([calcRunRow])) // calcRun insert
            .mockReturnValueOnce(valuesResolved(undefined)) // PUBLISHED event
            .mockReturnValueOnce(valuesResolved(undefined)), // CALC_TRIGGERED event
        };
        return callback(tx);
      }
    );

    // dispatchCalcJobs -> update calcRun dispatchState
    mockDb.update.mockReturnValue(whereReturning([dispatchedRun]));

    const result = await service.finalize(validFinalizePayload, nullQueues);

    expect(result.fundId).toBe(10);
    expect(result.configVersion).toBe(1);
    expect(result.correlationId).toBe('finalize-correlation-id');
    expect(result.published).toBe(true);
    expect(mockDb.transaction).toHaveBeenCalledTimes(2);
  });

  it('rejects when name is empty', async () => {
    const service = new FundPersistenceService();

    await expect(service.finalize({ name: '', size: 50_000_000 }, nullQueues)).rejects.toThrow(
      'Fund name is required'
    );
  });

  it('publishes the existing draft fund when draftFundId is provided', async () => {
    const service = new FundPersistenceService();
    const draftRow = {
      id: 177,
      fundId: 77,
      version: 2,
      config: { modelInputsAsOfDate: '2026-06-30' },
      isDraft: true,
      isPublished: false,
    };
    const fundRow = {
      id: 77,
      name: 'Existing Draft Fund',
      size: '50000000',
      managementFee: '0.02',
      carryPercentage: '0.2',
      vintageYear: 2026,
    };
    const publishedRow = { ...draftRow, isDraft: false, isPublished: true };
    const calcRunRow = {
      id: 277,
      fundId: 77,
      configId: 177,
      configVersion: 2,
      correlationId: 'finalize-correlation-id',
      engines: ['reserve', 'pacing'],
      dispatchState: 'pending',
      requestedAt: new Date(),
    };
    const dispatchedRun = {
      ...calcRunRow,
      dispatchState: 'dispatched',
      lastError: null,
    };

    let syncUpdateMock: ReturnType<typeof vi.fn> | null = null;
    let txCallCount = 0;
    mockDb.transaction.mockImplementation(
      async (callback: (tx: Record<string, unknown>) => Promise<unknown>) => {
        txCallCount++;
        if (txCallCount === 1) {
          const updateMock = vi
            .fn()
            .mockReturnValueOnce(whereReturning([draftRow]))
            .mockReturnValueOnce(whereReturning([fundRow]));
          syncUpdateMock = updateMock;
          return callback({
            update: updateMock,
            insert: vi.fn().mockReturnValueOnce(valuesResolved(undefined)),
          });
        }

        const tx = {
          query: { fundConfigs: { findFirst: vi.fn().mockResolvedValue(draftRow) } },
          update: vi
            .fn()
            .mockReturnValueOnce(whereReturning([]))
            .mockReturnValueOnce(whereReturning([publishedRow])),
          insert: vi
            .fn()
            .mockReturnValueOnce(valuesReturning([calcRunRow]))
            .mockReturnValueOnce(valuesResolved(undefined))
            .mockReturnValueOnce(valuesResolved(undefined)),
        };
        return callback(tx);
      }
    );
    mockDb.update.mockReturnValue(whereReturning([dispatchedRun]));

    const result = await service.finalize(
      {
        ...validFinalizePayload,
        draftFundId: 77,
      },
      nullQueues
    );

    expect(result.fundId).toBe(77);
    expect(result.configVersion).toBe(2);
    expect(result.runId).toBe(277);
    expect(syncUpdateMock).not.toBeNull();
    expect(syncUpdateMock).toHaveBeenCalledTimes(2);
    expect(mockDb.transaction).toHaveBeenCalledTimes(2);
  });

  it('rejects draft finalize when no active draft exists', async () => {
    const service = new FundPersistenceService();

    mockDb.transaction.mockImplementationOnce(
      async (callback: (tx: Record<string, unknown>) => Promise<unknown>) =>
        callback({
          update: vi.fn().mockReturnValueOnce(whereReturning([])),
          insert: vi.fn(),
        })
    );

    await expect(
      service.finalize(
        {
          ...validFinalizePayload,
          draftFundId: 77,
        },
        nullQueues
      )
    ).rejects.toThrow(NoActiveDraftForFinalizeError);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });

  it('passes draft config fields to createFundWithInitialDraft configInput', async () => {
    const service = new FundPersistenceService();

    const fundRow = {
      id: 11,
      name: 'Config Fund',
      size: '10000000',
      managementFee: '0.02',
      carryPercentage: '0.2',
      vintageYear: 2026,
    };
    const draftRow = {
      id: 101,
      fundId: 11,
      version: 1,
      config: {
        modelInputsAsOfDate: '2026-06-30',
        stages: [{ id: 'stg-1', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
      },
      isDraft: true,
      isPublished: false,
    };
    const publishedRow = { ...draftRow, isDraft: false, isPublished: true };
    const calcRunRow = {
      id: 201,
      fundId: 11,
      configId: 101,
      configVersion: 1,
      correlationId: 'finalize-correlation-id',
      engines: ['reserve', 'pacing'],
      dispatchState: 'pending',
      requestedAt: new Date(),
    };
    const dispatchedRun = {
      ...calcRunRow,
      dispatchState: 'dispatched',
      lastError: null,
    };

    let createTxInsertMock: ReturnType<typeof vi.fn> | null = null;
    let txCallCount = 0;
    mockDb.transaction.mockImplementation(
      async (callback: (tx: Record<string, unknown>) => Promise<unknown>) => {
        txCallCount++;
        if (txCallCount === 1) {
          const insertMock = vi
            .fn()
            .mockReturnValueOnce(valuesReturning([fundRow]))
            .mockReturnValueOnce(valuesReturning([draftRow]))
            .mockReturnValueOnce(valuesResolved(undefined));
          createTxInsertMock = insertMock;
          return callback({ insert: insertMock });
        }
        const tx = {
          query: { fundConfigs: { findFirst: vi.fn().mockResolvedValue(draftRow) } },
          update: vi
            .fn()
            .mockReturnValueOnce(whereReturning([]))
            .mockReturnValueOnce(whereReturning([publishedRow])),
          insert: vi
            .fn()
            .mockReturnValueOnce(valuesReturning([calcRunRow]))
            .mockReturnValueOnce(valuesResolved(undefined))
            .mockReturnValueOnce(valuesResolved(undefined)),
        };
        return callback(tx);
      }
    );
    mockDb.update.mockReturnValue(whereReturning([dispatchedRun]));

    const payload = {
      name: 'Config Fund',
      size: 10_000_000,
      modelInputsAsOfDate: '2026-06-30',
      targetMetrics: {
        targetIRR: 0.28,
        targetTVPI: 2.8,
        targetCompanyCount: 22,
      },
      stages: [{ id: 'stg-1', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
    };
    await service.finalize(payload, nullQueues);

    // The second insert call in the create transaction is fundConfigs.insert
    // which receives the config object
    expect(createTxInsertMock).not.toBeNull();
    const configInsertCall = createTxInsertMock!.mock.results[1];
    expect(configInsertCall).toBeDefined();
    const configValues = configInsertCall.value.values.mock.calls[0]?.[0];
    expect(configValues.config).toMatchObject({
      fundSize: 10_000_000,
      vintageYear: 2026,
      managementFeeRate: 2,
      carriedInterest: 20,
      modelInputsAsOfDate: '2026-06-30',
      targetMetrics: {
        targetIRR: 0.28,
        targetTVPI: 2.8,
        targetCompanyCount: 22,
      },
      stages: [{ id: 'stg-1', name: 'Seed' }],
    });
  });
});

// ---------------------------------------------------------------------------
// Part 3: Route contract tests (supertest)
// ---------------------------------------------------------------------------

import express from 'express';
import request from 'supertest';
import { clearIdempotencyCache } from '../../../server/middleware/idempotency';

describe('POST /api/funds/finalize route contract', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = {
        id: 'partner-1',
        sub: 'partner-1',
        email: 'partner@example.com',
        role: 'partner',
        roles: ['partner'],
        fundIds: [77],
        ip: '127.0.0.1',
        userAgent: 'vitest',
      };
      next();
    });
    const { registerFundConfigRoutes } = await import('../../../server/routes/fund-config');
    registerFundConfigRoutes(app);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clearIdempotencyCache();
  });

  it('returns 400 for invalid payload (missing name)', async () => {
    const res = await request(app).post('/api/funds/finalize').send({ size: 50_000_000 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('issues');
  });

  it('returns 400 for invalid payload (negative size)', async () => {
    const res = await request(app).post('/api/funds/finalize').send({ name: 'Bad Fund', size: -1 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 403 when user cannot access the requested draft fund', async () => {
    const mod = await import('../../../server/services/fund-persistence-service');
    const finalizeSpy = vi.spyOn(mod.fundPersistenceService, 'finalize').mockResolvedValue({
      fundId: 77,
      configVersion: 2,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      runId: 277,
      dispatchState: 'dispatched',
      published: true,
    });
    const restrictedApp = express();
    restrictedApp.use(express.json());
    restrictedApp.use((req, _res, next) => {
      req.user = {
        id: 'user-7',
        sub: 'user-7',
        email: 'user7@example.com',
        role: 'partner',
        roles: ['partner'],
        fundIds: [99],
        ip: '127.0.0.1',
        userAgent: 'vitest',
      };
      next();
    });
    const { registerFundConfigRoutes } = await import('../../../server/routes/fund-config');
    registerFundConfigRoutes(restrictedApp);

    const res = await request(restrictedApp)
      .post('/api/funds/finalize')
      .set('Idempotency-Key', 'finalize-forbidden-draft')
      .send({ ...minimalFinalizePayload, draftFundId: 77 });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FUND_ACCESS_DENIED');
    expect(finalizeSpy).not.toHaveBeenCalled();
  });

  it('returns 201 with correct response shape on success', async () => {
    const mod = await import('../../../server/services/fund-persistence-service');
    vi.spyOn(mod.fundPersistenceService, 'finalize').mockResolvedValue({
      fundId: 42,
      configVersion: 1,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      published: true,
    });

    const res = await request(app)
      .post('/api/funds/finalize')
      .set('Idempotency-Key', 'finalize-unexpected-error')
      .send(minimalFinalizePayload);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        fundId: 42,
        configVersion: 1,
        correlationId: '550e8400-e29b-41d4-a716-446655440000',
        published: true,
      },
    });
  });

  it('replays completed duplicate finalize requests with the same idempotency key', async () => {
    const mod = await import('../../../server/services/fund-persistence-service');
    const finalizeSpy = vi.spyOn(mod.fundPersistenceService, 'finalize').mockResolvedValue({
      fundId: 77,
      configVersion: 2,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      runId: 277,
      dispatchState: 'dispatched',
      published: true,
    });
    const payload = { ...minimalFinalizePayload, draftFundId: 77 };

    const first = await request(app)
      .post('/api/funds/finalize')
      .set('Idempotency-Key', 'finalize-77-stable')
      .send(payload);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = await request(app)
      .post('/api/funds/finalize')
      .set('Idempotency-Key', 'finalize-77-stable')
      .send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers['idempotency-replay']).toBe('true');
    expect(second.body.data.fundId).toBe(77);
    expect(finalizeSpy).toHaveBeenCalledTimes(1);
  });

  it('returns 409 when draftFundId has no active draft to publish', async () => {
    const mod = await import('../../../server/services/fund-persistence-service');
    vi.spyOn(mod.fundPersistenceService, 'finalize').mockRejectedValue(
      new NoActiveDraftForFinalizeError(77)
    );

    const res = await request(app)
      .post('/api/funds/finalize')
      .set('Idempotency-Key', 'finalize-no-active-draft')
      .send({ ...minimalFinalizePayload, draftFundId: 77 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_ACTIVE_DRAFT');
  });

  it('returns 500 when service throws unexpected error', async () => {
    const mod = await import('../../../server/services/fund-persistence-service');
    vi.spyOn(mod.fundPersistenceService, 'finalize').mockRejectedValue(
      new Error('Database connection lost')
    );

    const res = await request(app).post('/api/funds/finalize').send(minimalFinalizePayload);

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('releases idempotency locks after uncached finalize errors', async () => {
    const mod = await import('../../../server/services/fund-persistence-service');
    const finalizeSpy = vi
      .spyOn(mod.fundPersistenceService, 'finalize')
      .mockRejectedValue(new Error('Database connection lost'));

    const first = await request(app)
      .post('/api/funds/finalize')
      .set('Idempotency-Key', 'finalize-error-lock-release')
      .send(minimalFinalizePayload);
    const second = await request(app)
      .post('/api/funds/finalize')
      .set('Idempotency-Key', 'finalize-error-lock-release')
      .send(minimalFinalizePayload);

    expect(first.status).toBe(500);
    expect(second.status).toBe(500);
    expect(finalizeSpy).toHaveBeenCalledTimes(2);
  });
});
