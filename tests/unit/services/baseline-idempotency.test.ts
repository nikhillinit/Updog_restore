/**
 * Baseline Idempotency Tests
 *
 * Decision 0.2: Validates that baseline creation is idempotent when keyed
 * to calc-run identity (sourceRunId). Covers the duplicate-guard transaction,
 * the first-default race closure, and the unique-constraint fallback path.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BaselineService } from '../../../server/services/variance-tracking';
import { createSandbox } from '../../setup/test-infrastructure';
import { db } from '../../../server/db';
import { SYSTEM_ACTOR_ID } from '../../../shared/constants/system-actor';

// Mock metrics (no-op for these tests)
vi.mock('../../../server/metrics/variance-metrics', () => ({
  recordVarianceReportGenerated: vi.fn(),
  recordBaselineOperation: vi.fn(),
  recordAlertGenerated: vi.fn(),
  recordAlertAction: vi.fn(),
  updateFundVarianceScore: vi.fn(),
  recordThresholdBreach: vi.fn(),
  updateDataQualityScore: vi.fn(),
  recordSystemError: vi.fn(),
  startVarianceCalculation: vi.fn(() => vi.fn()),
}));

// Mock database with transaction support
vi.mock('../../../server/db', () => {
  let lastInsertData: Record<string, unknown> | null = null;

  const queryMocks = {
    fundMetrics: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    portfolioCompanies: {
      findMany: vi.fn(),
    },
    fundSnapshots: {
      findFirst: vi.fn(),
    },
    fundBaselines: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    calcRuns: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    varianceReports: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    alertRules: {
      findMany: vi.fn(),
    },
    performanceAlerts: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  };

  const valuesMock = vi.fn((data: Record<string, unknown>) => {
    lastInsertData = data;
    return {
      returning: vi.fn(() => Promise.resolve([{ id: 'new-baseline-id', ...data }])),
    };
  });

  const setMock = vi.fn((data: Record<string, unknown>) => ({
    where: vi.fn(() => Promise.resolve([{ id: 'updated-id', ...data }])),
  }));

  const insertMock = vi.fn(() => ({
    values: valuesMock,
  }));

  const updateMock = vi.fn(() => ({
    set: setMock,
  }));

  return {
    db: {
      query: queryMocks,
      insert: insertMock,
      update: updateMock,
      transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => {
        const txDb = {
          query: queryMocks,
          insert: insertMock,
          update: updateMock,
        };
        return fn(txDb);
      }),
      __getLastInsertData: () => lastInsertData,
      __resetInsertData: () => {
        lastInsertData = null;
      },
    },
  };
});

const mockDb = db as any;

// Standard mock setup for a successful baseline creation
function setupStandardMocks(overrides?: {
  existingDefault?: boolean;
  existingBaseline?: Record<string, unknown> | undefined;
}) {
  mockDb.query.fundMetrics.findFirst.mockResolvedValue({
    fundId: 1,
    totalValue: '2500000.00',
    irr: '0.1850',
    multiple: '1.4500',
    dpi: '0.9200',
    tvpi: '1.3800',
    metricDate: new Date(),
  });

  mockDb.query.portfolioCompanies.findMany.mockResolvedValue([]);
  mockDb.query.fundSnapshots.findFirst.mockResolvedValue({ payload: {} });

  // First findFirst call inside the transaction checks for existing baseline by sourceRunId
  // Second findFirst call checks for existing default
  if (overrides?.existingBaseline) {
    mockDb.query.fundBaselines.findFirst.mockResolvedValue(overrides.existingBaseline);
  } else if (overrides?.existingDefault) {
    // No matching sourceRunId baseline, but there IS an existing default
    mockDb.query.fundBaselines.findFirst
      .mockResolvedValueOnce(undefined) // sourceRunId check
      .mockResolvedValue({ id: 'existing-default', isDefault: true, isActive: true });
  } else {
    mockDb.query.fundBaselines.findFirst.mockResolvedValue(undefined);
  }
}

const BASE_PARAMS = {
  fundId: 1,
  name: 'Test Baseline',
  baselineType: 'milestone' as const,
  periodStart: new Date('2026-01-01'),
  periodEnd: new Date('2026-03-31'),
};

describe('Baseline Idempotency (Decision 0.2)', () => {
  let service: BaselineService;
  let sandbox: ReturnType<typeof createSandbox>;

  beforeEach(() => {
    sandbox = createSandbox();
    service = new BaselineService();
    vi.clearAllMocks();
    mockDb.__resetInsertData();
  });

  afterEach(async () => {
    await sandbox.abort();
  });

  describe('sourceRunId duplicate guard', () => {
    it('returns existing baseline when same sourceRunId already exists', async () => {
      const existingBaseline = {
        id: 'existing-baseline-abc',
        fundId: 1,
        sourceRunId: 42,
        name: 'Already Created Baseline',
        isDefault: true,
        isActive: true,
      };

      setupStandardMocks({ existingBaseline });

      const result = await service.createBaseline({
        ...BASE_PARAMS,
        sourceRunId: 42,
      });

      expect(result).toEqual(existingBaseline);
      // INSERT must NOT have been called -- the existing baseline was returned
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('creates new baseline when different sourceRunId is used', async () => {
      setupStandardMocks();

      const result = await service.createBaseline({
        ...BASE_PARAMS,
        sourceRunId: 99,
      });

      expect(result.id).toBe('new-baseline-id');
      expect(mockDb.__getLastInsertData().sourceRunId).toBe(99);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('persists sourceRunId in the INSERT payload', async () => {
      setupStandardMocks();

      await service.createBaseline({
        ...BASE_PARAMS,
        sourceRunId: 77,
      });

      const insertedData = mockDb.__getLastInsertData();
      expect(insertedData).not.toBeNull();
      expect(insertedData.sourceRunId).toBe(77);
    });
  });

  describe('user-created baselines (no sourceRunId)', () => {
    it('creates baseline normally when sourceRunId is omitted', async () => {
      setupStandardMocks();

      const result = await service.createBaseline({
        ...BASE_PARAMS,
        createdBy: 5,
      });

      expect(result.id).toBe('new-baseline-id');
      expect(mockDb.insert).toHaveBeenCalled();

      const insertedData = mockDb.__getLastInsertData();
      expect(insertedData.sourceRunId).toBeUndefined();
      expect(insertedData.createdBy).toBe(5);
    });

    it('skips sourceRunId duplicate check when sourceRunId is undefined', async () => {
      setupStandardMocks();

      await service.createBaseline({
        ...BASE_PARAMS,
        createdBy: 5,
      });

      // The first findFirst call should be the existingDefault check, not a
      // sourceRunId-keyed lookup. With no sourceRunId, the transaction goes
      // straight to metrics fetch and then the default check.
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('uses SYSTEM_ACTOR_ID when createdBy is omitted', async () => {
      setupStandardMocks();

      await service.createBaseline({
        ...BASE_PARAMS,
        sourceRunId: 10,
      });

      const insertedData = mockDb.__getLastInsertData();
      expect(insertedData.createdBy).toBe(SYSTEM_ACTOR_ID);
    });
  });

  describe('first-default race closure', () => {
    it('first baseline for a fund gets isDefault=true', async () => {
      setupStandardMocks({ existingDefault: false });

      await service.createBaseline({
        ...BASE_PARAMS,
        createdBy: 1,
      });

      const insertedData = mockDb.__getLastInsertData();
      expect(insertedData.isDefault).toBe(true);
    });

    it('second baseline gets isDefault=false when default already exists', async () => {
      setupStandardMocks({ existingDefault: true });

      await service.createBaseline({
        ...BASE_PARAMS,
        createdBy: 1,
        sourceRunId: 55,
      });

      const insertedData = mockDb.__getLastInsertData();
      expect(insertedData.isDefault).toBe(false);
    });

    it('default check runs inside the transaction', async () => {
      setupStandardMocks();

      await service.createBaseline({
        ...BASE_PARAMS,
        createdBy: 1,
      });

      // Verify transaction was used (the wrapper calls our mock fn with txDb)
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('unique constraint violation fallback', () => {
    it('catches source_run_unique violation and returns existing baseline', async () => {
      // Make the transaction throw a unique constraint error
      const constraintError = Object.assign(new Error('duplicate key value'), {
        code: '23505',
        constraint: 'fund_baselines_source_run_unique',
      });

      mockDb.transaction.mockRejectedValueOnce(constraintError);

      // The fallback query after the catch
      const existingBaseline = {
        id: 'race-winner',
        fundId: 1,
        sourceRunId: 42,
        name: 'Race Winner Baseline',
      };
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(existingBaseline);

      const result = await service.createBaseline({
        ...BASE_PARAMS,
        sourceRunId: 42,
      });

      expect(result).toEqual(existingBaseline);
    });

    it('catches default_unique violation and returns existing baseline', async () => {
      const constraintError = Object.assign(new Error('duplicate key value'), {
        code: '23505',
        constraint: 'fund_baselines_default_unique',
      });

      mockDb.transaction.mockRejectedValueOnce(constraintError);

      const existingBaseline = {
        id: 'default-race-winner',
        fundId: 1,
        sourceRunId: 42,
        name: 'Default Race Winner',
      };
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(existingBaseline);

      const result = await service.createBaseline({
        ...BASE_PARAMS,
        sourceRunId: 42,
      });

      expect(result).toEqual(existingBaseline);
    });

    it('rethrows non-constraint errors', async () => {
      const genericError = new Error('connection lost');
      mockDb.transaction.mockRejectedValueOnce(genericError);

      await expect(
        service.createBaseline({
          ...BASE_PARAMS,
          sourceRunId: 42,
        })
      ).rejects.toThrow('connection lost');
    });

    it('rethrows constraint violation when no sourceRunId is set', async () => {
      const constraintError = Object.assign(new Error('duplicate key value'), {
        code: '23505',
        constraint: 'fund_baselines_default_unique',
      });

      mockDb.transaction.mockRejectedValueOnce(constraintError);

      await expect(
        service.createBaseline({
          ...BASE_PARAMS,
          createdBy: 1,
          // No sourceRunId -- user-created baseline, no idempotency fallback
        })
      ).rejects.toThrow('duplicate key value');
    });
  });

  describe('createBaselineFromCalcRun integration', () => {
    it('passes sourceRunId from calc run through to createBaseline', async () => {
      mockDb.query.calcRuns.findFirst.mockResolvedValue({
        id: 42,
        fundId: 1,
        configVersion: 7,
        requestedAt: new Date('2026-01-01T00:00:00Z'),
        completedAt: new Date('2026-01-15T00:00:00Z'),
      });

      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        fundId: 1,
        runId: 42,
        totalValue: '2750000.00',
        irr: '0.1950',
        multiple: '1.5100',
        dpi: '0.9300',
        tvpi: '1.4200',
        metricDate: new Date(),
      });

      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([]);
      mockDb.query.fundSnapshots.findFirst.mockResolvedValue({ payload: {} });
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(undefined);

      const result = await service.createBaselineFromCalcRun(42);

      expect(result.name).toBe('Automated Baseline v7');
      expect(mockDb.__getLastInsertData().sourceRunId).toBe(42);
      expect(mockDb.__getLastInsertData().createdBy).toBe(SYSTEM_ACTOR_ID);
    });

    it('is idempotent when called twice for the same calc run', async () => {
      const existingBaseline = {
        id: 'already-created',
        fundId: 1,
        sourceRunId: 42,
        name: 'Automated Baseline v7',
        createdBy: SYSTEM_ACTOR_ID,
      };

      mockDb.query.calcRuns.findFirst.mockResolvedValue({
        id: 42,
        fundId: 1,
        configVersion: 7,
        requestedAt: new Date('2026-01-01T00:00:00Z'),
        completedAt: new Date('2026-01-15T00:00:00Z'),
      });

      // The duplicate guard inside createBaseline finds the existing baseline
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(existingBaseline);

      const result = await service.createBaselineFromCalcRun(42);

      expect(result).toEqual(existingBaseline);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('throws when calc run does not exist', async () => {
      mockDb.query.calcRuns.findFirst.mockResolvedValue(undefined);

      await expect(service.createBaselineFromCalcRun(999)).rejects.toThrow(
        'Calc run 999 not found'
      );
    });
  });
});
