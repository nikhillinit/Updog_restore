/**
 * System Actor Tests
 *
 * Validates the SYSTEM_ACTOR_ID constant and its integration with
 * BaselineService for automated baseline creation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SYSTEM_ACTOR_ID, SYSTEM_ACTOR_USERNAME } from '@shared/constants/system-actor';
import { positiveInt } from '@shared/schema-helpers';
import { BaselineService } from '../../../server/services/variance-tracking';
import { db } from '../../../server/db';

// Mock metrics (same pattern as variance-tracking.test.ts)
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

// Mock database
vi.mock('../../../server/db', () => {
  let lastInsertData: Record<string, unknown> | null = null;

  const queryMocks = {
    fundMetrics: { findFirst: vi.fn(), findMany: vi.fn() },
    portfolioCompanies: { findMany: vi.fn() },
    fundSnapshots: { findFirst: vi.fn() },
    fundBaselines: { findFirst: vi.fn(), findMany: vi.fn() },
    calcRuns: { findFirst: vi.fn(), findMany: vi.fn() },
    varianceReports: { findFirst: vi.fn(), findMany: vi.fn() },
    alertRules: { findMany: vi.fn() },
    performanceAlerts: { findFirst: vi.fn(), findMany: vi.fn() },
  };

  const valuesMock = vi.fn((data: Record<string, unknown>) => {
    lastInsertData = data;
    return {
      returning: vi.fn(() => Promise.resolve([{ id: 'test-id', ...data }])),
    };
  });

  const insertMock = vi.fn(() => ({ values: valuesMock }));
  const updateMock = vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })),
  }));

  return {
    db: {
      query: queryMocks,
      insert: insertMock,
      update: updateMock,
      transaction: vi.fn((fn: (tx: unknown) => unknown) => {
        const txDb = { query: queryMocks, insert: insertMock, update: updateMock };
        return fn(txDb);
      }),
      __getLastInsertData: () => lastInsertData,
    },
  };
});

const mockDb = db as Record<string, unknown> & {
  query: Record<
    string,
    { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
  >;
  __getLastInsertData: () => Record<string, unknown> | null;
};

describe('System Actor Constants', () => {
  it('SYSTEM_ACTOR_ID passes positiveInt validation', () => {
    const schema = positiveInt();
    const result = schema.safeParse(SYSTEM_ACTOR_ID);
    expect(result.success).toBe(true);
  });

  it('SYSTEM_ACTOR_ID is a positive integer >= 1', () => {
    expect(SYSTEM_ACTOR_ID).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(SYSTEM_ACTOR_ID)).toBe(true);
  });

  it('SYSTEM_ACTOR_ID is 999999', () => {
    expect(SYSTEM_ACTOR_ID).toBe(999999);
  });

  it('SYSTEM_ACTOR_USERNAME is system', () => {
    expect(SYSTEM_ACTOR_USERNAME).toBe('system');
  });

  it('zero would fail positiveInt validation', () => {
    const schema = positiveInt();
    const result = schema.safeParse(0);
    expect(result.success).toBe(false);
  });
});

describe('BaselineService system actor integration', () => {
  let service: BaselineService;

  function seedMetricsMocks(): void {
    mockDb.query.fundMetrics.findFirst.mockResolvedValue({
      fundId: 1,
      totalValue: '1000000.00',
      irr: '0.1500',
      multiple: '1.20',
      dpi: '0.80',
      tvpi: '1.20',
      metricDate: new Date(),
    });
    mockDb.query.portfolioCompanies.findMany.mockResolvedValue([]);
    mockDb.query.fundSnapshots.findFirst.mockResolvedValue(null);
    mockDb.query.fundBaselines.findFirst.mockResolvedValue(undefined);
  }

  beforeEach(() => {
    service = new BaselineService();
    vi.clearAllMocks();
  });

  it('uses explicit createdBy when provided', async () => {
    seedMetricsMocks();

    await service.createBaseline({
      fundId: 1,
      name: 'Manual Baseline',
      baselineType: 'quarterly',
      periodStart: new Date('2025-01-01'),
      periodEnd: new Date('2025-03-31'),
      createdBy: 42,
    });

    const inserted = mockDb.__getLastInsertData();
    expect(inserted).not.toBeNull();
    expect(inserted!['createdBy']).toBe(42);
  });

  it('falls back to SYSTEM_ACTOR_ID when createdBy is omitted', async () => {
    seedMetricsMocks();

    await service.createBaseline({
      fundId: 1,
      name: 'Automated Baseline',
      baselineType: 'milestone',
      periodStart: new Date('2025-01-01'),
      periodEnd: new Date('2025-03-31'),
    });

    const inserted = mockDb.__getLastInsertData();
    expect(inserted).not.toBeNull();
    expect(inserted!['createdBy']).toBe(SYSTEM_ACTOR_ID);
  });

  it('createBaselineFromCalcRun uses SYSTEM_ACTOR_ID', async () => {
    mockDb.query.calcRuns.findFirst.mockResolvedValue({
      id: 10,
      fundId: 1,
      configVersion: 3,
      requestedAt: new Date('2025-01-01'),
      completedAt: new Date('2025-01-02'),
    });
    seedMetricsMocks();

    await service.createBaselineFromCalcRun(10);

    const inserted = mockDb.__getLastInsertData();
    expect(inserted).not.toBeNull();
    expect(inserted!['createdBy']).toBe(SYSTEM_ACTOR_ID);
  });
});
