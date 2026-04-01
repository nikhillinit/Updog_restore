/**
 * Metrics Attribution Tests
 *
 * Tests for:
 * - getAttributedKPIs: public standalone helper in variance-tracking.ts
 * - ensureAttributedFundMetricsForCalcRun: writer in fund-metrics-attribution-service.ts
 * - createBaseline integration with attributed KPIs
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// Mock setup via vi.hoisted for deterministic ordering
// ============================================================================

const { mockDb, mockCalculateFundMetrics } = vi.hoisted(() => {
  const fundMetricsFindFirst = vi.fn();
  const calcRunsFindFirst = vi.fn();
  const insertReturning = vi.fn();
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));

  return {
    mockDb: {
      query: {
        fundMetrics: { findFirst: fundMetricsFindFirst },
        calcRuns: { findFirst: calcRunsFindFirst },
      },
      insert,
      _insertValues: insertValues,
      _insertReturning: insertReturning,
    },
    mockCalculateFundMetrics: vi.fn(),
  };
});

vi.mock('../../../server/db', () => ({
  db: mockDb,
}));

vi.mock('../../../server/services/fund-metrics-calculator', () => ({
  calculateFundMetrics: mockCalculateFundMetrics,
}));

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

import { getAttributedKPIs } from '../../../server/services/variance-tracking';
import { ensureAttributedFundMetricsForCalcRun } from '../../../server/services/fund-metrics-attribution-service';

// ============================================================================
// getAttributedKPIs
// ============================================================================

describe('getAttributedKPIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns KPIs for a specific runId when attributed metrics exist', async () => {
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

    const result = await getAttributedKPIs(1, 42);

    expect(result).toEqual({
      totalValue: '2750000.00',
      irr: '0.1950',
      multiple: '1.5100',
      dpi: '0.9300',
      tvpi: '1.4200',
    });
    // Should have been called exactly once (the attributed query)
    expect(mockDb.query.fundMetrics.findFirst).toHaveBeenCalledTimes(1);
  });

  it('returns null when no metrics exist for the fund at all', async () => {
    mockDb.query.fundMetrics.findFirst.mockResolvedValue(null);

    const result = await getAttributedKPIs(1, 42);

    expect(result).toBeNull();
  });

  it('falls back to latest metrics when runId has no attributed metrics', async () => {
    mockDb.query.fundMetrics.findFirst
      .mockResolvedValueOnce(null) // attributed query returns nothing
      .mockResolvedValueOnce({
        fundId: 1,
        runId: null,
        totalValue: '2000000.00',
        irr: '0.1500',
        multiple: '1.2000',
        dpi: '0.8000',
        tvpi: '1.1500',
        metricDate: new Date(),
      });

    const result = await getAttributedKPIs(1, 99);

    expect(result).toEqual({
      totalValue: '2000000.00',
      irr: '0.1500',
      multiple: '1.2000',
      dpi: '0.8000',
      tvpi: '1.1500',
    });
    expect(mockDb.query.fundMetrics.findFirst).toHaveBeenCalledTimes(2);
  });

  it('returns latest metrics when runId is omitted', async () => {
    mockDb.query.fundMetrics.findFirst.mockResolvedValue({
      fundId: 1,
      runId: null,
      totalValue: '1500000.00',
      irr: '0.1200',
      multiple: '1.1000',
      dpi: '0.7500',
      tvpi: '1.0500',
      metricDate: new Date(),
    });

    const result = await getAttributedKPIs(1);

    expect(result).toEqual({
      totalValue: '1500000.00',
      irr: '0.1200',
      multiple: '1.1000',
      dpi: '0.7500',
      tvpi: '1.0500',
    });
    // Only one query (no attributed lookup when runId omitted)
    expect(mockDb.query.fundMetrics.findFirst).toHaveBeenCalledTimes(1);
  });

  it('returns null when fund has no metrics and runId is omitted', async () => {
    mockDb.query.fundMetrics.findFirst.mockResolvedValue(null);

    const result = await getAttributedKPIs(1);

    expect(result).toBeNull();
  });

  it('handles nullable KPI fields correctly', async () => {
    mockDb.query.fundMetrics.findFirst.mockResolvedValue({
      fundId: 1,
      runId: 10,
      totalValue: '500000.00',
      irr: null,
      multiple: null,
      dpi: null,
      tvpi: null,
      metricDate: new Date(),
    });

    const result = await getAttributedKPIs(1, 10);

    expect(result).toEqual({
      totalValue: '500000.00',
      irr: null,
      multiple: null,
      dpi: null,
      tvpi: null,
    });
  });
});

// ============================================================================
// ensureAttributedFundMetricsForCalcRun (writer path)
// ============================================================================

describe('ensureAttributedFundMetricsForCalcRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when calc run does not exist', async () => {
    mockDb.query.calcRuns.findFirst.mockResolvedValue(null);

    await expect(ensureAttributedFundMetricsForCalcRun(999)).rejects.toThrow(
      'Calc run 999 not found'
    );
  });

  it('returns existing attributed metrics without inserting', async () => {
    const existingMetrics = {
      id: 7,
      fundId: 1,
      runId: 42,
      totalValue: '2750000.00',
      irr: '0.1950',
    };

    mockDb.query.calcRuns.findFirst.mockResolvedValue({
      id: 42,
      fundId: 1,
      configId: 3,
      configVersion: 5,
      completedAt: new Date('2025-06-15'),
    });
    mockDb.query.fundMetrics.findFirst.mockResolvedValue(existingMetrics);

    const result = await ensureAttributedFundMetricsForCalcRun(42);

    expect(result).toEqual(existingMetrics);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('creates attributed metrics with runId, configId, configVersion when none exist', async () => {
    const completedAt = new Date('2025-06-15T10:00:00Z');

    mockDb.query.calcRuns.findFirst.mockResolvedValue({
      id: 42,
      fundId: 1,
      configId: 3,
      configVersion: 5,
      completedAt,
    });
    mockDb.query.fundMetrics.findFirst.mockResolvedValue(null);

    mockCalculateFundMetrics.mockResolvedValue({
      totalValue: 3000000,
      irr: 0.22,
      moic: 1.6,
      dpi: 0.95,
      tvpi: 1.45,
    });

    const insertedRow = {
      id: 10,
      fundId: 1,
      runId: 42,
      configId: 3,
      configVersion: 5,
      totalValue: '3000000.00',
      irr: '0.2200',
      multiple: '1.60',
      dpi: '0.95',
      tvpi: '1.45',
      metricDate: completedAt,
      asOfDate: completedAt,
    };
    mockDb._insertReturning.mockResolvedValue([insertedRow]);

    const result = await ensureAttributedFundMetricsForCalcRun(42);

    expect(result).toEqual(insertedRow);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);

    // Verify the values passed to insert include attribution columns
    const insertedValues = mockDb._insertValues.mock.calls[0]?.[0];
    expect(insertedValues).toMatchObject({
      fundId: 1,
      runId: 42,
      configId: 3,
      configVersion: 5,
    });
  });

  it('uses current date when completedAt is null', async () => {
    mockDb.query.calcRuns.findFirst.mockResolvedValue({
      id: 50,
      fundId: 2,
      configId: 1,
      configVersion: 1,
      completedAt: null,
    });
    mockDb.query.fundMetrics.findFirst.mockResolvedValue(null);

    mockCalculateFundMetrics.mockResolvedValue({
      totalValue: 1000000,
      irr: 0.1,
      moic: 1.1,
      dpi: 0.5,
      tvpi: 1.0,
    });

    const insertedRow = {
      id: 11,
      fundId: 2,
      runId: 50,
      configId: 1,
      configVersion: 1,
      totalValue: '1000000.00',
    };
    mockDb._insertReturning.mockResolvedValue([insertedRow]);

    const result = await ensureAttributedFundMetricsForCalcRun(50);

    expect(result).toEqual(insertedRow);

    const insertedValues = mockDb._insertValues.mock.calls[0]?.[0];
    expect(insertedValues.metricDate).toBeInstanceOf(Date);
    expect(insertedValues.runId).toBe(50);
  });

  it('handles null irr/moic/dpi/tvpi from calculator', async () => {
    mockDb.query.calcRuns.findFirst.mockResolvedValue({
      id: 60,
      fundId: 3,
      configId: 2,
      configVersion: 1,
      completedAt: new Date(),
    });
    mockDb.query.fundMetrics.findFirst.mockResolvedValue(null);

    mockCalculateFundMetrics.mockResolvedValue({
      totalValue: 500000,
      irr: null,
      moic: null,
      dpi: null,
      tvpi: null,
    });

    const insertedRow = { id: 12, fundId: 3, runId: 60 };
    mockDb._insertReturning.mockResolvedValue([insertedRow]);

    const result = await ensureAttributedFundMetricsForCalcRun(60);

    expect(result).toEqual(insertedRow);

    const insertedValues = mockDb._insertValues.mock.calls[0]?.[0];
    expect(insertedValues.irr).toBeNull();
    expect(insertedValues.multiple).toBeNull();
    expect(insertedValues.dpi).toBeNull();
    expect(insertedValues.tvpi).toBeNull();
    // totalValue is always required
    expect(insertedValues.totalValue).toBe('500000.00');
  });

  it('returns the concurrently inserted row on fund_metrics_run_unique violation', async () => {
    const completedAt = new Date('2025-06-15T10:00:00Z');
    const concurrentRow = {
      id: 13,
      fundId: 4,
      runId: 70,
      configId: 8,
      configVersion: 2,
      totalValue: '1200000.00',
      irr: '0.1400',
      multiple: '1.20',
      dpi: '0.60',
      tvpi: '1.30',
      metricDate: completedAt,
      asOfDate: completedAt,
    };

    mockDb.query.calcRuns.findFirst.mockResolvedValue({
      id: 70,
      fundId: 4,
      configId: 8,
      configVersion: 2,
      completedAt,
    });
    mockDb.query.fundMetrics.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(concurrentRow);

    mockCalculateFundMetrics.mockResolvedValue({
      totalValue: 1200000,
      irr: 0.14,
      moic: 1.2,
      dpi: 0.6,
      tvpi: 1.3,
    });
    mockDb._insertReturning.mockRejectedValueOnce({
      code: '23505',
      constraint: 'fund_metrics_run_unique',
    });

    const result = await ensureAttributedFundMetricsForCalcRun(70);

    expect(result).toEqual(concurrentRow);
  });
});
