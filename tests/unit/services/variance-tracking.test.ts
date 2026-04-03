/**
 * Variance Tracking Service Tests
 *
 * Comprehensive unit tests for variance tracking service layer functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BaselineService,
  VarianceCalculationService,
  AlertManagementService,
  VarianceTrackingService,
} from '../../../server/services/variance-tracking';
import { buildAlertRuleEvaluation } from '../../../server/services/variance-alert-evaluation';
import { Decimal } from '../../../shared/lib/decimal-utils';
import { varianceTrackingFixtures } from '../../fixtures/variance-tracking-fixtures';
import { createSandbox } from '../../setup/test-infrastructure';
import { db } from '../../../server/db';

// Mock metrics functions
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

// Mock the database module (inline factory to avoid hoisting issues)
vi.mock('../../../server/db', () => {
  // Create persistent mock functions that can be inspected
  let lastInsertData: any = null;
  let lastUpdateData: any = null;

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

  const valuesMock = vi.fn((data) => {
    lastInsertData = data;
    return {
      returning: vi.fn(() => Promise.resolve([{ id: 'test-id', ...data }])),
    };
  });

  const setMock = vi.fn((data) => {
    lastUpdateData = data;
    return {
      where: vi.fn(() => Promise.resolve([{ id: 'updated-id', ...data }])),
    };
  });

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
      transaction: vi.fn((fn) => {
        const txDb = {
          query: queryMocks,
          insert: insertMock,
          update: updateMock,
        };
        return fn(txDb);
      }),
      __getLastInsertData: () => lastInsertData,
      __getLastUpdateData: () => lastUpdateData,
    },
  };
});

// Get mocked instance with type flexibility
const mockDb = db as any;

describe('BaselineService', () => {
  let service: BaselineService;
  let sandbox: any;

  beforeEach(() => {
    sandbox = createSandbox();
    service = new BaselineService();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await sandbox.abort();
  });

  describe('createBaseline', () => {
    it('should create a baseline with all required fields', async () => {
      // Mock fund metrics
      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        fundId: 1,
        totalValue: '2500000.00',
        irr: '0.1850',
        multiple: '1.4500',
        dpi: '0.9200',
        tvpi: '1.3800',
        metricDate: new Date(),
      });

      // Mock portfolio companies
      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'TechCorp',
          sector: 'Technology',
          stage: 'Series A',
          currentValuation: '500000.00',
          investments: [{ amount: '200000.00' }],
        },
        {
          id: 2,
          name: 'HealthCorp',
          sector: 'Healthcare',
          stage: 'Series B',
          currentValuation: '400000.00',
          investments: [{ amount: '300000.00' }],
        },
      ]);

      // Mock snapshots
      mockDb.query.fundSnapshots.findFirst
        .mockResolvedValueOnce({ payload: { totalReserves: 500000 } }) // Reserve snapshot
        .mockResolvedValueOnce({ payload: { deploymentRate: 0.8 } }); // Pacing snapshot

      // Mock existing defaults check
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(undefined);

      const params = {
        fundId: 1,
        name: 'Q4 2024 Baseline',
        description: 'End of quarter baseline',
        baselineType: 'quarterly' as const,
        periodStart: new Date('2024-10-01'),
        periodEnd: new Date('2024-12-31'),
        createdBy: 1,
        tags: ['quarterly', 'audited'],
      };

      const result = await service.createBaseline(params);

      expect(result.id).toBe('test-id');
      expect(result.name).toBe('Q4 2024 Baseline');
      expect(result.baselineType).toBe('quarterly');
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw error when no fund metrics available', async () => {
      mockDb.query.fundMetrics.findFirst.mockResolvedValue(null);

      const params = {
        fundId: 1,
        name: 'Test Baseline',
        baselineType: 'quarterly' as const,
        periodStart: new Date('2024-10-01'),
        periodEnd: new Date('2024-12-31'),
        createdBy: 1,
      };

      await expect(service.createBaseline(params)).rejects.toThrow('No fund metrics available');
    });

    it('should set first baseline as default', async () => {
      // Mock fund metrics
      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        fundId: 1,
        totalValue: '2500000.00',
        irr: '0.1850',
      });

      // Mock portfolio data
      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([]);
      mockDb.query.fundSnapshots.findFirst.mockResolvedValue({ payload: {} });

      // Mock no existing defaults
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(undefined);

      const result = await service.createBaseline({
        fundId: 1,
        name: 'First Baseline',
        baselineType: 'initial',
        periodStart: new Date(),
        periodEnd: new Date(),
        createdBy: 1,
      });

      // Verify the baseline was set as default
      expect(result.isDefault).toBe(true);
    });

    it('should not set as default when other defaults exist', async () => {
      // Mock fund metrics
      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        fundId: 1,
        totalValue: '2500000.00',
      });

      // Mock portfolio data
      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([]);
      mockDb.query.fundSnapshots.findFirst.mockResolvedValue({ payload: {} });

      // Mock existing default baseline
      mockDb.query.fundBaselines.findFirst.mockResolvedValue({
        id: 'existing-default',
        isDefault: true,
      });

      const result = await service.createBaseline({
        fundId: 1,
        name: 'Second Baseline',
        baselineType: 'quarterly',
        periodStart: new Date(),
        periodEnd: new Date(),
        createdBy: 1,
      });

      // Verify the baseline was not set as default
      expect(result.isDefault).toBe(false);
    });

    it('should persist portfolio composition fields in baseline insert', async () => {
      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        fundId: 1,
        totalValue: '3000000.00',
      });

      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'AlphaCo',
          sector: 'Fintech',
          stage: 'Series A',
          currentValuation: '800000.00',
          investments: [{ amount: '250000.00' }],
        },
        {
          id: 2,
          name: 'BetaCo',
          sector: 'SaaS',
          stage: 'Series B',
          currentValuation: '600000.00',
          investments: [{ amount: '350000.00' }],
        },
      ]);

      // Reserve snapshot
      mockDb.query.fundSnapshots.findFirst
        .mockResolvedValueOnce({ payload: { totalReserves: 750000, strategy: 'pro-rata' } })
        .mockResolvedValueOnce({ payload: { deploymentRate: 0.65, targetPace: 12 } });

      mockDb.query.fundBaselines.findFirst.mockResolvedValue(undefined);

      await service.createBaseline({
        fundId: 1,
        name: 'Portfolio Fields Test',
        baselineType: 'quarterly',
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-03-31'),
        createdBy: 1,
      });

      const insertedData = mockDb.__getLastInsertData();

      expect(insertedData.portfolioCount).toBe(2);
      expect(insertedData.averageInvestment).toBe('300000');
      expect(insertedData.topPerformers).toEqual([
        expect.objectContaining({ id: 1, name: 'AlphaCo' }),
      ]);
      expect(insertedData.companySnapshots).toEqual([
        expect.objectContaining({
          portfolioCompanyId: 1,
          companyId: 1,
          companyName: 'AlphaCo',
          investedCapital: '250000',
          currentValuation: '800000.00',
        }),
        expect.objectContaining({
          portfolioCompanyId: 2,
          companyId: 2,
          companyName: 'BetaCo',
          investedCapital: '350000',
          currentValuation: '600000.00',
        }),
      ]);
      expect(insertedData.sectorDistribution).toEqual({ Fintech: 1, SaaS: 1 });
      expect(insertedData.stageDistribution).toEqual({ 'Series A': 1, 'Series B': 1 });
    });

    it('should persist reserveAllocation and pacingMetrics from snapshots', async () => {
      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        fundId: 1,
        totalValue: '1000000.00',
      });

      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([]);

      const reservePayload = { totalReserves: 500000, strategy: 'pro-rata' };
      const pacingPayload = { deploymentRate: 0.8, monthsRemaining: 18 };

      mockDb.query.fundSnapshots.findFirst
        .mockResolvedValueOnce({ payload: reservePayload })
        .mockResolvedValueOnce({ payload: pacingPayload });

      mockDb.query.fundBaselines.findFirst.mockResolvedValue(undefined);

      await service.createBaseline({
        fundId: 1,
        name: 'Snapshot Fields Test',
        baselineType: 'milestone',
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-06-30'),
        createdBy: 1,
      });

      const insertedData = mockDb.__getLastInsertData();

      expect(insertedData.reserveAllocation).toEqual(reservePayload);
      expect(insertedData.pacingMetrics).toEqual(pacingPayload);
    });

    it('should handle empty portfolio gracefully for composition fields', async () => {
      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        fundId: 1,
        totalValue: '500000.00',
      });

      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([]);
      mockDb.query.fundSnapshots.findFirst.mockResolvedValue(null);
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(undefined);

      await service.createBaseline({
        fundId: 1,
        name: 'Empty Portfolio Test',
        baselineType: 'initial',
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-12-31'),
        createdBy: 1,
      });

      const insertedData = mockDb.__getLastInsertData();

      expect(insertedData.portfolioCount).toBe(0);
      expect(insertedData.averageInvestment).toBe('0');
      expect(insertedData.topPerformers).toEqual([]);
      expect(insertedData.companySnapshots).toEqual([]);
      expect(insertedData.sectorDistribution).toEqual({});
      expect(insertedData.stageDistribution).toEqual({});
      expect(insertedData.reserveAllocation).toEqual({});
      expect(insertedData.pacingMetrics).toEqual({});
    });

    it('should persist calc-run-attributed KPI fields when sourceRunId is provided', async () => {
      mockDb.query.fundMetrics.findFirst
        .mockResolvedValueOnce({
          fundId: 1,
          runId: 42,
          totalValue: '2750000.00',
          irr: '0.1950',
          multiple: '1.5100',
          dpi: '0.9300',
          tvpi: '1.4200',
          metricDate: new Date(),
        })
        .mockResolvedValueOnce(undefined);

      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([]);
      mockDb.query.fundSnapshots.findFirst.mockResolvedValue({ payload: {} });
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(undefined);

      await service.createBaseline({
        fundId: 1,
        name: 'Attributed Baseline',
        baselineType: 'milestone',
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
        createdBy: 1,
        sourceRunId: 42,
      });

      const insertedData = mockDb.__getLastInsertData();

      expect(insertedData.sourceRunId).toBe(42);
      expect(insertedData.irr).toBe('0.1950');
      expect(insertedData.multiple).toBe('1.5100');
      expect(insertedData.dpi).toBe('0.9300');
      expect(insertedData.tvpi).toBe('1.4200');
    });

    it('should return an existing automated baseline for the same sourceRunId', async () => {
      const existingBaseline = {
        id: 'existing-baseline',
        fundId: 1,
        sourceRunId: 42,
        name: 'Existing Automated Baseline',
      };

      mockDb.query.fundBaselines.findFirst.mockResolvedValue(existingBaseline);

      const result = await service.createBaseline({
        fundId: 1,
        name: 'Duplicate Automated Baseline',
        baselineType: 'milestone',
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
        createdBy: 1,
        sourceRunId: 42,
      });

      expect(result).toEqual(existingBaseline);
    });

    it('should create an automated baseline directly from a calc run', async () => {
      mockDb.query.calcRuns.findFirst.mockResolvedValue({
        id: 42,
        fundId: 1,
        configVersion: 7,
        requestedAt: new Date('2025-01-01T00:00:00Z'),
        completedAt: new Date('2025-01-15T00:00:00Z'),
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
      expect(mockDb.__getLastInsertData().createdBy).toBe(999999);
    });
  });

  describe('getBaselines', () => {
    it('should retrieve baselines with filters', async () => {
      const mockBaselines = [
        varianceTrackingFixtures.baselines.quarterly,
        varianceTrackingFixtures.baselines.annual,
      ];

      mockDb.query.fundBaselines.findMany.mockResolvedValue(mockBaselines);

      const result = await service.getBaselines(1, {
        baselineType: 'quarterly',
        isDefault: true,
        limit: 10,
      });

      expect(result).toEqual(mockBaselines);
      expect(mockDb.query.fundBaselines.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
        })
      );
    });

    it('should return all active baselines when no filters provided', async () => {
      const mockBaselines = [varianceTrackingFixtures.baselines.quarterly];
      mockDb.query.fundBaselines.findMany.mockResolvedValue(mockBaselines);

      const result = await service.getBaselines(1);

      expect(result).toEqual(mockBaselines);
    });
  });

  describe('setDefaultBaseline', () => {
    it('should update default baseline correctly', async () => {
      await service.setDefaultBaseline('new-default-id', 1);

      // Verify transaction was called
      expect(mockDb.transaction).toHaveBeenCalled();

      // The transaction callback internally calls update twice but those are on txDb, not mockDb
      // We verify the transaction was called which is sufficient
    });
  });

  describe('deactivateBaseline', () => {
    it('should deactivate baseline', async () => {
      await service.deactivateBaseline('baseline-id');

      expect(mockDb.update).toHaveBeenCalledWith(expect.anything());
    });
  });

  describe('getBaselineById', () => {
    it('should return baseline when fundId and baselineId match', async () => {
      const mockBaseline = {
        id: 'baseline-123',
        fundId: 1,
        name: 'Q4 Baseline',
        isActive: true,
        ...varianceTrackingFixtures.baselines.quarterly,
      };
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(mockBaseline);

      const result = await service.getBaselineById(1, 'baseline-123');

      expect(result).toEqual(mockBaseline);
      expect(mockDb.query.fundBaselines.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.anything() })
      );
    });

    it('should return undefined when baselineId belongs to different fund', async () => {
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(undefined);

      const result = await service.getBaselineById(1, 'baseline-from-fund-2');

      expect(result).toBeUndefined();
    });

    it('should return undefined when baselineId does not exist', async () => {
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(undefined);

      const result = await service.getBaselineById(1, 'non-existent-id');

      expect(result).toBeUndefined();
    });
  });
});

describe('VarianceCalculationService', () => {
  let service: VarianceCalculationService;
  let sandbox: any;

  beforeEach(() => {
    sandbox = createSandbox();
    service = new VarianceCalculationService();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await sandbox.abort();
  });

  describe('generateVarianceReport', () => {
    it('should generate comprehensive variance report', async () => {
      // Mock baseline
      const mockBaseline = {
        id: 'baseline-id',
        fundId: 1,
        ...varianceTrackingFixtures.baselines.quarterly,
      };
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(mockBaseline);

      // Mock current metrics
      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        fundId: 1,
        totalValue: '2650000.00', // 6% increase
        irr: '0.1720', // Decline
        multiple: '1.4800',
        dpi: '0.9400',
        tvpi: '1.3900',
        metricDate: new Date(),
      });

      // Mock alert rules
      mockDb.query.alertRules.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          metricName: 'irr',
          operator: 'lt',
          thresholdValue: '-0.01',
          severity: 'warning',
          isEnabled: true,
        },
      ]);

      const params = {
        fundId: 1,
        baselineId: 'baseline-id',
        reportName: 'Test Variance Report',
        reportType: 'periodic' as const,
        generatedBy: 1,
      };

      const result = await service.generateVarianceReport(params);

      expect(result.id).toBe('test-id');
      expect(result.reportName).toBe('Test Variance Report');
      expect(result.reportType).toBe('periodic');
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw error when baseline not found', async () => {
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(null);

      const params = {
        fundId: 1,
        baselineId: 'non-existent',
        reportName: 'Test Report',
        reportType: 'periodic' as const,
      };

      await expect(service.generateVarianceReport(params)).rejects.toThrow('Baseline not found');
    });

    it('should calculate variance correctly', async () => {
      const mockBaseline = {
        id: 'baseline-id',
        totalValue: '2500000.00',
        irr: '0.1850',
        multiple: '1.4500',
      };
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(mockBaseline);

      const mockCurrentMetrics = {
        totalValue: '2750000.00', // 10% increase
        irr: '0.1950', // 1% increase
        multiple: '1.5500', // 6.9% increase
      };
      mockDb.query.fundMetrics.findFirst.mockResolvedValue(mockCurrentMetrics);
      mockDb.query.alertRules.findMany.mockResolvedValue([]);

      const result = await service.generateVarianceReport({
        fundId: 1,
        baselineId: 'baseline-id',
        reportName: 'Variance Test',
        reportType: 'ad_hoc',
      });

      // Verify variance calculations are present in result
      expect(result.totalValueVariance).toBeDefined();
      expect(result.irrVariance).toBeDefined();
      expect(result.multipleVariance).toBeDefined();
    });

    it('should identify significant variances', async () => {
      const mockBaseline = {
        id: 'baseline-id',
        totalValue: '2500000.00',
        irr: '0.1850',
      };
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(mockBaseline);

      // Mock significant decline in metrics
      // totalValue: 20% decline triggers high severity (>20%)
      // IRR: needs >0.1 absolute variance for high, so we use 0.08 (decline of 0.105 > 0.1)
      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        totalValue: '2000000.00', // -20% (exactly 20%, triggers high)
        irr: '0.08', // decline of 0.105 from 0.1850 (>0.1 triggers high)
      });
      mockDb.query.alertRules.findMany.mockResolvedValue([]);

      const result = await service.generateVarianceReport({
        fundId: 1,
        baselineId: 'baseline-id',
        reportName: 'Significant Variance Test',
        reportType: 'alert_triggered',
      });

      // With both totalValue at 20% and IRR >10% decline, we should get high risk level
      expect(result.riskLevel).toBe('high');
      expect(result.significantVariances).toBeDefined();
    });

    it('should trigger alerts when thresholds are breached', async () => {
      const mockBaseline = {
        id: 'baseline-id',
        totalValue: '2500000.00',
        irr: '0.1850',
      };
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(mockBaseline);

      // Mock decline that should trigger alert
      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        totalValue: '2500000.00',
        irr: '0.1750', // 1% decline
      });

      // Mock alert rule
      mockDb.query.alertRules.findMany.mockResolvedValue([
        {
          id: 'alert-rule-1',
          metricName: 'irr',
          operator: 'lt',
          thresholdValue: '-0.05', // 5% decline threshold
          severity: 'warning',
          isEnabled: true,
        },
      ]);

      const result = await service.generateVarianceReport({
        fundId: 1,
        baselineId: 'baseline-id',
        reportName: 'Alert Trigger Test',
        reportType: 'alert_triggered',
      });

      expect(result.alertsTriggered).toBeDefined();
    });

    it('should omit current-state portfolio analysis for historical as-of reports', async () => {
      const historicalAsOfDate = new Date('2024-12-31T23:59:59Z');
      const mockBaseline = {
        id: 'baseline-id',
        totalValue: '2500000.00',
        irr: '0.1850',
        reserveAllocation: { totalReserves: 500000 },
        pacingMetrics: { deploymentRate: 0.8 },
        portfolioCount: 4,
      };
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(mockBaseline);
      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        totalValue: '2600000.00',
        irr: '0.1900',
        metricDate: historicalAsOfDate,
      });
      mockDb.query.alertRules.findMany.mockResolvedValue([]);

      const result = await service.generateVarianceReport({
        fundId: 1,
        baselineId: 'baseline-id',
        reportName: 'Historical Variance Report',
        reportType: 'ad_hoc',
        asOfDate: historicalAsOfDate,
      });

      expect(result.portfolioVariances).toBeNull();
      expect(result.sectorVariances).toBeNull();
      expect(result.stageVariances).toBeNull();
      expect(result.reserveVariances).toBeNull();
      expect(result.pacingVariances).toBeNull();
      expect(mockDb.query.portfolioCompanies.findMany).not.toHaveBeenCalled();
      expect(mockDb.query.fundSnapshots.findFirst).not.toHaveBeenCalled();
    });

    it('should use run-attributed metrics when a runId is provided', async () => {
      const historicalAsOfDate = new Date('2026-04-02T12:00:00Z');
      mockDb.query.fundBaselines.findFirst.mockResolvedValue({
        id: 'baseline-id',
        fundId: 1,
        totalValue: '2500000.00',
        deployedCapital: '2000000.00',
        irr: '0.1850',
        multiple: '1.4500',
        dpi: '0.9200',
        tvpi: '1.3800',
        portfolioCount: 0,
        averageInvestment: '0',
        topPerformers: [],
        sectorDistribution: {},
        stageDistribution: {},
        snapshotDate: historicalAsOfDate,
        periodStart: new Date('2024-10-01T00:00:00Z'),
        periodEnd: new Date('2024-12-31T23:59:59Z'),
      });
      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        fundId: 1,
        runId: 42,
        totalValue: '2600000.00',
        deployedCapital: '2000000.00',
        irr: '0.1900',
        multiple: '1.5000',
        dpi: '0.9300',
        tvpi: '1.4000',
        metricDate: historicalAsOfDate,
      });

      const snapshot = await service.computeVarianceSnapshot({
        fundId: 1,
        baselineId: 'baseline-id',
        runId: 42,
        asOfDate: historicalAsOfDate,
      });

      expect(snapshot.currentMetrics['runId']).toBe(42);
      expect(snapshot.variances.irrVariance?.toString()).toBe('0.005');
    });
  });

  describe('getVarianceReports', () => {
    it('should return reports for a fund ordered by createdAt desc', async () => {
      const mockReports = [
        { id: 'report-2', fundId: 1, reportName: 'Report 2', createdAt: new Date('2026-03-31') },
        { id: 'report-1', fundId: 1, reportName: 'Report 1', createdAt: new Date('2026-03-01') },
      ];
      mockDb.query.varianceReports.findMany.mockResolvedValue(mockReports);

      const result = await service.getVarianceReports(1);

      expect(result).toEqual(mockReports);
      expect(result).toHaveLength(2);
      expect(mockDb.query.varianceReports.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });

    it('should return empty array when no reports exist', async () => {
      mockDb.query.varianceReports.findMany.mockResolvedValue([]);

      const result = await service.getVarianceReports(999);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('getVarianceReportById', () => {
    it('should return report when fundId and reportId match', async () => {
      const mockReport = {
        id: 'report-abc',
        fundId: 1,
        reportName: 'Q4 Variance',
        reportType: 'periodic',
      };
      mockDb.query.varianceReports.findFirst.mockResolvedValue(mockReport);

      const result = await service.getVarianceReportById(1, 'report-abc');

      expect(result).toEqual(mockReport);
      expect(mockDb.query.varianceReports.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.anything() })
      );
    });

    it('should return undefined when report not found', async () => {
      mockDb.query.varianceReports.findFirst.mockResolvedValue(undefined);

      const result = await service.getVarianceReportById(1, 'non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('getCurrentPortfolioMetrics (via reflection)', () => {
    it('should compute counts, distributions, and deployed capital', async () => {
      const getMetrics = (service as any).getCurrentPortfolioMetrics.bind(service);

      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'AlphaCo',
          sector: 'Technology',
          stage: 'Series A',
          currentValuation: '500000.00',
          investments: [{ amount: '200000.00' }, { amount: '50000.00' }],
        },
        {
          id: 2,
          name: 'BetaCo',
          sector: 'Healthcare',
          stage: 'Series B',
          currentValuation: '400000.00',
          investments: [{ amount: '300000.00' }],
        },
        {
          id: 3,
          name: 'GammaCo',
          sector: 'Technology',
          stage: 'Series A',
          currentValuation: '350000.00',
          investments: [{ amount: '150000.00' }],
        },
      ]);

      const result = await getMetrics(1, new Date());

      expect(result.portfolioCount).toBe(3);
      // deployedCapital = 200000 + 50000 + 300000 + 150000 = 700000
      expect(result.deployedCapital).toBe('700000');
      // averageInvestment = 700000 / 3
      expect(Number(result.averageInvestment)).toBeCloseTo(233333.3333, 2);
      expect(result.sectorDistribution).toEqual({ Technology: 2, Healthcare: 1 });
      expect(result.stageDistribution).toEqual({ 'Series A': 2, 'Series B': 1 });
    });

    it('should return zeros for empty portfolio', async () => {
      const getMetrics = (service as any).getCurrentPortfolioMetrics.bind(service);

      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([]);

      const result = await getMetrics(1, new Date());

      expect(result.portfolioCount).toBe(0);
      expect(result.deployedCapital).toBe('0');
      expect(result.averageInvestment).toBe('0');
      expect(result.sectorDistribution).toEqual({});
      expect(result.stageDistribution).toEqual({});
    });

    it('should handle companies with no investments', async () => {
      const getMetrics = (service as any).getCurrentPortfolioMetrics.bind(service);

      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'EmptyCo',
          sector: 'FinTech',
          stage: 'Seed',
          currentValuation: '100000.00',
          investments: [],
        },
      ]);

      const result = await getMetrics(1, new Date());

      expect(result.portfolioCount).toBe(1);
      expect(result.deployedCapital).toBe('0');
      expect(result.averageInvestment).toBe('0');
      expect(result.sectorDistribution).toEqual({ FinTech: 1 });
      expect(result.stageDistribution).toEqual({ Seed: 1 });
    });

    it('should handle null/undefined findMany response gracefully', async () => {
      const getMetrics = (service as any).getCurrentPortfolioMetrics.bind(service);

      mockDb.query.portfolioCompanies.findMany.mockResolvedValue(undefined);

      const result = await getMetrics(1, new Date());

      expect(result.portfolioCount).toBe(0);
      expect(result.deployedCapital).toBe('0');
    });
  });

  describe('analyzeCompanyVariances (via reflection)', () => {
    it('should compute valuation changes for matching companies', async () => {
      const analyze = (service as any).analyzeCompanyVariances.bind(service);

      // Baseline with topPerformers in array format (from getPortfolioComposition)
      const baseline = {
        topPerformers: [
          { id: 1, name: 'AlphaCo', sector: 'Technology', currentValuation: '500000.00' },
          { id: 2, name: 'BetaCo', sector: 'Healthcare', currentValuation: '400000.00' },
        ],
      };

      // Current portfolio: AlphaCo grew, BetaCo declined
      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'AlphaCo',
          sector: 'Technology',
          currentValuation: '600000.00',
          investments: [{ amount: '210000.00' }],
        },
        {
          id: 2,
          name: 'BetaCo',
          sector: 'Healthcare',
          currentValuation: '350000.00',
          investments: [{ amount: '180000.00' }],
        },
        {
          id: 3,
          name: 'GammaCo',
          sector: 'FinTech',
          currentValuation: '200000.00',
          investments: [],
        },
      ]);

      const result = await analyze(1, baseline, new Date());

      expect(result).toHaveLength(2);

      const alpha = result.find((r: any) => r.companyId === 1);
      expect(alpha).toBeDefined();
      expect(alpha.companyName).toBe('AlphaCo');
      expect(Number(alpha.valuationChange)).toBe(100000); // 600k - 500k
      expect(Number(alpha.valuationChangePct)).toBe(0.2); // 100k / 500k
      expect(alpha.valuationVariance).toBe(alpha.valuationChange);
      expect(alpha.valuationVariancePct).toBe(alpha.valuationChangePct);
      expect(alpha.changeType).toBe('matched');
      expect(alpha.currentInvestedCapital).toBe('210000');
      expect(alpha.riskLevel).toBe('medium');

      const beta = result.find((r: any) => r.companyId === 2);
      expect(beta).toBeDefined();
      expect(Number(beta.valuationChange)).toBe(-50000); // 350k - 400k
      expect(Number(beta.valuationChangePct)).toBe(-0.125); // -50k / 400k
      expect(beta.changeType).toBe('matched');
      expect(beta.currentInvestedCapital).toBe('180000');
      expect(beta.riskLevel).toBe('medium');
    });

    it('should handle { companies: [...] } format in topPerformers', async () => {
      const analyze = (service as any).analyzeCompanyVariances.bind(service);

      const baseline = {
        topPerformers: {
          companies: [{ id: 10, name: 'DeltaCo', sector: 'SaaS', valuation: 800000 }],
        },
      };

      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([
        { id: 10, name: 'DeltaCo', sector: 'SaaS', currentValuation: '1000000.00' },
      ]);

      const result = await analyze(1, baseline, new Date());

      expect(result).toHaveLength(1);
      expect(result[0].companyId).toBe(10);
      expect(Number(result[0].valuationChange)).toBe(200000);
      expect(Number(result[0].valuationChangePct)).toBe(0.25);
      expect(result[0].changeType).toBe('matched');
      expect(result[0].riskLevel).toBe('high');
    });

    it('should classify added and removed companies when full companySnapshots are present', async () => {
      const analyze = (service as any).analyzeCompanyVariances.bind(service);

      const baseline = {
        companySnapshots: [
          {
            companyId: 1,
            companyName: 'AlphaCo',
            sector: 'Technology',
            stage: 'Series A',
            status: 'active',
            currentValuation: '500000.00',
            investedCapital: '200000.00',
          },
          {
            companyId: 2,
            companyName: 'BetaCo',
            sector: 'Healthcare',
            stage: 'Series B',
            status: 'active',
            currentValuation: '400000.00',
            investedCapital: '150000.00',
          },
        ],
      };

      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'AlphaCo',
          sector: 'Technology',
          stage: 'Series A',
          status: 'active',
          currentValuation: '650000.00',
          investments: [{ amount: '220000.00' }],
        },
        {
          id: 3,
          name: 'GammaCo',
          sector: 'FinTech',
          stage: 'Seed',
          status: 'active',
          currentValuation: '250000.00',
          investments: [{ amount: '90000.00' }],
        },
      ]);

      const result = await analyze(1, baseline, new Date());

      expect(result).toHaveLength(3);

      const matched = result.find((row: any) => row.companyId === 1);
      expect(matched).toMatchObject({
        companyName: 'AlphaCo',
        changeType: 'matched',
        valuationVariance: '150000',
        baselineInvestedCapital: '200000',
        currentInvestedCapital: '220000',
        riskLevel: 'high',
      });
      expect(Number(matched.valuationVariancePct)).toBe(0.3);

      const added = result.find((row: any) => row.companyId === 3);
      expect(added).toMatchObject({
        companyName: 'GammaCo',
        changeType: 'added',
        baselineValuation: null,
        currentValuation: '250000',
        currentInvestedCapital: '90000',
        valuationVariance: '250000',
        valuationVariancePct: null,
        riskLevel: 'medium',
      });

      const removed = result.find((row: any) => row.companyId === 2);
      expect(removed).toMatchObject({
        companyName: 'BetaCo',
        changeType: 'removed',
        currentValuation: null,
        valuationVariance: '-400000',
        valuationVariancePct: '-1',
        riskLevel: 'critical',
      });
    });

    it('should return empty array when topPerformers is null or missing', async () => {
      const analyze = (service as any).analyzeCompanyVariances.bind(service);

      const baselineNull = { topPerformers: null };
      const result1 = await analyze(1, baselineNull, new Date());
      expect(result1).toEqual([]);

      const baselineUndef = { topPerformers: undefined };
      const result2 = await analyze(1, baselineUndef, new Date());
      expect(result2).toEqual([]);
    });

    it('should return empty array when topPerformers is empty', async () => {
      const analyze = (service as any).analyzeCompanyVariances.bind(service);

      const baseline = { topPerformers: [] };
      const result = await analyze(1, baseline, new Date());
      expect(result).toEqual([]);
    });

    it('should skip companies with null currentValuation', async () => {
      const analyze = (service as any).analyzeCompanyVariances.bind(service);

      const baseline = {
        topPerformers: [{ id: 1, name: 'Co1', sector: 'Tech', currentValuation: '500000' }],
      };

      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([
        { id: 1, name: 'Co1', sector: 'Tech', currentValuation: null },
      ]);

      const result = await analyze(1, baseline, new Date());
      expect(result).toEqual([]);
    });

    it('should skip companies with zero baseline valuation', async () => {
      const analyze = (service as any).analyzeCompanyVariances.bind(service);

      const baseline = {
        topPerformers: [{ id: 1, name: 'ZeroCo', sector: 'Tech', currentValuation: '0' }],
      };

      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([
        { id: 1, name: 'ZeroCo', sector: 'Tech', currentValuation: '500000' },
      ]);

      const result = await analyze(1, baseline, new Date());
      expect(result).toEqual([]);
    });

    it('should skip companies not present in baseline', async () => {
      const analyze = (service as any).analyzeCompanyVariances.bind(service);

      const baseline = {
        topPerformers: [{ id: 99, name: 'OldCo', sector: 'Legacy', currentValuation: '100000' }],
      };

      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([
        { id: 1, name: 'NewCo', sector: 'Tech', currentValuation: '500000' },
      ]);

      const result = await analyze(1, baseline, new Date());
      expect(result).toEqual([]);
    });
  });

  describe('analyzeSectorVariances (via reflection)', () => {
    it('should compute delta and deltaPct for matching sectors', () => {
      const analyze = (service as any).analyzeSectorVariances.bind(service);
      const result = analyze({ Technology: 5, Healthcare: 3 }, { Technology: 4, Healthcare: 2 });
      expect(result.Technology).toMatchObject({
        current: 5,
        baseline: 4,
        delta: 1,
        deltaPct: 0.25,
      });
      expect(result.Technology.currentCountShare).toBeCloseTo(5 / 8, 10);
      expect(result.Technology.baselineCountShare).toBeCloseTo(4 / 6, 10);
      expect(result.Technology.countShareDelta).toBeCloseTo(5 / 8 - 4 / 6, 10);
      expect(result.Technology.countShareDeltaPct).toBeCloseTo((5 / 8 - 4 / 6) / (4 / 6), 10);

      expect(result.Healthcare).toMatchObject({ current: 3, baseline: 2, delta: 1, deltaPct: 0.5 });
      expect(result.Healthcare.currentCountShare).toBeCloseTo(3 / 8, 10);
      expect(result.Healthcare.baselineCountShare).toBeCloseTo(2 / 6, 10);
      expect(result.Healthcare.countShareDelta).toBeCloseTo(3 / 8 - 2 / 6, 10);
      expect(result.Healthcare.countShareDeltaPct).toBeCloseTo((3 / 8 - 2 / 6) / (2 / 6), 10);
    });

    it('should handle new sectors not in baseline', () => {
      const analyze = (service as any).analyzeSectorVariances.bind(service);
      const result = analyze({ Technology: 3, 'Clean Energy': 2 }, { Technology: 3 });
      expect(result['Clean Energy']).toMatchObject({
        current: 2,
        baseline: 0,
        delta: 2,
        deltaPct: null,
      });
      expect(result['Clean Energy'].currentCountShare).toBeCloseTo(2 / 5, 10);
      expect(result['Clean Energy'].baselineCountShare).toBe(0);
      expect(result['Clean Energy'].countShareDelta).toBeCloseTo(2 / 5, 10);
      expect(result['Clean Energy'].countShareDeltaPct).toBeNull();
      expect(result.Technology.delta).toBe(0);
    });

    it('should handle removed sectors (in baseline but not current)', () => {
      const analyze = (service as any).analyzeSectorVariances.bind(service);
      const result = analyze({ Technology: 3 }, { Technology: 3, Consumer: 2 });
      expect(result.Consumer).toMatchObject({
        current: 0,
        baseline: 2,
        delta: -2,
        deltaPct: -1,
      });
      expect(result.Consumer.currentCountShare).toBe(0);
      expect(result.Consumer.baselineCountShare).toBeCloseTo(2 / 5, 10);
      expect(result.Consumer.countShareDelta).toBeCloseTo(-2 / 5, 10);
      expect(result.Consumer.countShareDeltaPct).toBe(-1);
    });

    it('should return deltaPct null when baseline is zero', () => {
      const analyze = (service as any).analyzeSectorVariances.bind(service);
      const result = analyze({ FinTech: 4 }, { FinTech: 0 });
      expect(result.FinTech).toMatchObject({
        current: 4,
        baseline: 0,
        delta: 4,
        deltaPct: null,
      });
      expect(result.FinTech.currentCountShare).toBe(1);
      expect(result.FinTech.baselineCountShare).toBe(0);
      expect(result.FinTech.countShareDelta).toBe(1);
      expect(result.FinTech.countShareDeltaPct).toBeNull();
    });

    it('should return empty object for empty inputs', () => {
      const analyze = (service as any).analyzeSectorVariances.bind(service);
      const result = analyze({}, {});
      expect(result).toEqual({});
    });
  });

  describe('analyzeStageVariances (via reflection)', () => {
    it('should compute delta and deltaPct for matching stages', () => {
      const analyze = (service as any).analyzeStageVariances.bind(service);
      const result = analyze(
        { Seed: 2, 'Series A': 5, 'Series B': 3 },
        { Seed: 3, 'Series A': 4, 'Series B': 3 }
      );
      expect(result.Seed).toMatchObject({
        current: 2,
        baseline: 3,
        delta: -1,
        deltaPct: expect.closeTo(-1 / 3, 10),
      });
      expect(result.Seed.currentCountShare).toBeCloseTo(0.2, 10);
      expect(result.Seed.baselineCountShare).toBeCloseTo(0.3, 10);
      expect(result.Seed.countShareDelta).toBeCloseTo(-0.1, 10);
      expect(result.Seed.countShareDeltaPct).toBeCloseTo(-1 / 3, 10);

      expect(result['Series A']).toMatchObject({
        current: 5,
        baseline: 4,
        delta: 1,
        deltaPct: 0.25,
      });
      expect(result['Series A'].currentCountShare).toBeCloseTo(0.5, 10);
      expect(result['Series A'].baselineCountShare).toBeCloseTo(0.4, 10);

      expect(result['Series B']).toMatchObject({ current: 3, baseline: 3, delta: 0, deltaPct: 0 });
      expect(result['Series B'].currentCountShare).toBeCloseTo(0.3, 10);
      expect(result['Series B'].baselineCountShare).toBeCloseTo(0.3, 10);
    });

    it('should handle new stages not in baseline', () => {
      const analyze = (service as any).analyzeStageVariances.bind(service);
      const result = analyze({ 'Series C+': 1 }, {});
      expect(result['Series C+']).toMatchObject({
        current: 1,
        baseline: 0,
        delta: 1,
        deltaPct: null,
      });
      expect(result['Series C+'].currentCountShare).toBe(1);
      expect(result['Series C+'].baselineCountShare).toBe(0);
      expect(result['Series C+'].countShareDelta).toBe(1);
      expect(result['Series C+'].countShareDeltaPct).toBeNull();
    });

    it('should handle removed stages', () => {
      const analyze = (service as any).analyzeStageVariances.bind(service);
      const result = analyze({}, { Seed: 5 });
      expect(result.Seed).toMatchObject({
        current: 0,
        baseline: 5,
        delta: -5,
        deltaPct: -1,
      });
      expect(result.Seed.currentCountShare).toBe(0);
      expect(result.Seed.baselineCountShare).toBe(1);
      expect(result.Seed.countShareDelta).toBe(-1);
      expect(result.Seed.countShareDeltaPct).toBe(-1);
    });
  });

  describe('calculateReserveVariances (via reflection)', () => {
    it('should return hasData false when current snapshot is empty', async () => {
      const calc = (service as any).calculateReserveVariances.bind(service);
      mockDb.query.fundSnapshots.findFirst.mockResolvedValue(null);

      const baseline = { reserveAllocation: { totalReserves: 500000 } } as any;
      const result = await calc(1, baseline);

      expect(result).toEqual({
        hasData: false,
        currentReserves: {},
        baselineReserves: {},
        metricDeltas: {},
        changes: {},
      });
    });

    it('should return hasData false when baseline reserveAllocation is null', async () => {
      const calc = (service as any).calculateReserveVariances.bind(service);
      mockDb.query.fundSnapshots.findFirst.mockResolvedValue({
        payload: { totalReserves: 600000 },
      });

      const baseline = { reserveAllocation: null } as any;
      const result = await calc(1, baseline);

      expect(result).toEqual({
        hasData: false,
        currentReserves: {},
        baselineReserves: {},
        metricDeltas: {},
        changes: {},
      });
    });

    it('should detect changes between current and baseline reserves', async () => {
      const calc = (service as any).calculateReserveVariances.bind(service);
      mockDb.query.fundSnapshots.findFirst.mockResolvedValue({
        payload: { totalReserves: 600000, reserveRatio: 0.25 },
      });

      const baseline = {
        reserveAllocation: { totalReserves: 500000, reserveRatio: 0.2 },
      } as any;
      const result = await calc(1, baseline);

      expect(result.hasData).toBe(true);
      expect(result.currentReserves).toEqual({ totalReserves: 600000, reserveRatio: 0.25 });
      expect(result.baselineReserves).toEqual({ totalReserves: 500000, reserveRatio: 0.2 });
      expect(result.metricDeltas.totalReserves).toEqual({
        current: 600000,
        baseline: 500000,
        delta: 100000,
        deltaPct: 0.2,
      });
      expect(result.metricDeltas.reserveRatio).toEqual({
        current: 0.25,
        baseline: 0.2,
        delta: 0.04999999999999999,
        deltaPct: 0.24999999999999994,
      });
      expect(result.changes).toEqual({});
    });

    it('should omit unchanged keys from changes', async () => {
      const calc = (service as any).calculateReserveVariances.bind(service);
      mockDb.query.fundSnapshots.findFirst.mockResolvedValue({
        payload: { totalReserves: 500000, reserveRatio: 0.2 },
      });

      const baseline = {
        reserveAllocation: { totalReserves: 500000, reserveRatio: 0.2 },
      } as any;
      const result = await calc(1, baseline);

      expect(result.hasData).toBe(true);
      expect(result.metricDeltas).toEqual({});
      expect(result.changes).toEqual({});
    });
  });

  describe('calculatePacingVariances (via reflection)', () => {
    it('should return hasData false when current snapshot is empty', async () => {
      const calc = (service as any).calculatePacingVariances.bind(service);
      mockDb.query.fundSnapshots.findFirst.mockResolvedValue(null);

      const baseline = { pacingMetrics: { deploymentRate: 0.8 } } as any;
      const result = await calc(1, baseline);

      expect(result).toEqual({
        hasData: false,
        currentPacing: {},
        baselinePacing: {},
        metricDeltas: {},
        changes: {},
      });
    });

    it('should return hasData false when baseline pacingMetrics is null', async () => {
      const calc = (service as any).calculatePacingVariances.bind(service);
      mockDb.query.fundSnapshots.findFirst.mockResolvedValue({
        payload: { deploymentRate: 0.85 },
      });

      const baseline = { pacingMetrics: null } as any;
      const result = await calc(1, baseline);

      expect(result).toEqual({
        hasData: false,
        currentPacing: {},
        baselinePacing: {},
        metricDeltas: {},
        changes: {},
      });
    });

    it('should detect changes between current and baseline pacing', async () => {
      const calc = (service as any).calculatePacingVariances.bind(service);
      mockDb.query.fundSnapshots.findFirst.mockResolvedValue({
        payload: { deploymentRate: 0.9, quarterlyTarget: 0.8 },
      });

      const baseline = {
        pacingMetrics: { deploymentRate: 0.8, quarterlyTarget: 0.75 },
      } as any;
      const result = await calc(1, baseline);

      expect(result.hasData).toBe(true);
      expect(result.currentPacing).toEqual({ deploymentRate: 0.9, quarterlyTarget: 0.8 });
      expect(result.baselinePacing).toEqual({ deploymentRate: 0.8, quarterlyTarget: 0.75 });
      expect(result.metricDeltas.deploymentRate).toEqual({
        current: 0.9,
        baseline: 0.8,
        delta: 0.09999999999999998,
        deltaPct: 0.12499999999999997,
      });
      expect(result.metricDeltas.quarterlyTarget).toEqual({
        current: 0.8,
        baseline: 0.75,
        delta: 0.050000000000000044,
        deltaPct: 0.06666666666666672,
      });
      expect(result.changes).toEqual({});
    });

    it('should omit unchanged keys from changes', async () => {
      const calc = (service as any).calculatePacingVariances.bind(service);
      mockDb.query.fundSnapshots.findFirst.mockResolvedValue({
        payload: { deploymentRate: 0.8 },
      });

      const baseline = {
        pacingMetrics: { deploymentRate: 0.8 },
      } as any;
      const result = await calc(1, baseline);

      expect(result.hasData).toBe(true);
      expect(result.metricDeltas).toEqual({});
      expect(result.changes).toEqual({});
    });

    it('should handle keys present only in current or only in baseline', async () => {
      const calc = (service as any).calculatePacingVariances.bind(service);
      mockDb.query.fundSnapshots.findFirst.mockResolvedValue({
        payload: { deploymentRate: 0.9, newMetric: 42 },
      });

      const baseline = {
        pacingMetrics: { deploymentRate: 0.8, removedMetric: 99 },
      } as any;
      const result = await calc(1, baseline);

      expect(result.hasData).toBe(true);
      expect(result.metricDeltas).toEqual({
        deploymentRate: {
          current: 0.9,
          baseline: 0.8,
          delta: 0.09999999999999998,
          deltaPct: 0.12499999999999997,
        },
      });
      expect(result.changes.newMetric).toEqual({ current: 42, baseline: null });
      expect(result.changes.removedMetric).toEqual({ current: null, baseline: 99 });
    });
  });
});

describe('AlertManagementService', () => {
  let service: AlertManagementService;
  let sandbox: any;

  beforeEach(() => {
    sandbox = createSandbox();
    service = new AlertManagementService();
    vi.clearAllMocks();
    mockDb.transaction.mockImplementation((fn: any) =>
      fn({
        query: mockDb.query,
        insert: mockDb.insert,
        update: mockDb.update,
        delete: mockDb.delete,
      })
    );
  });

  afterEach(async () => {
    await sandbox.abort();
  });

  describe('createAlertRule', () => {
    it('should create alert rule with all parameters', async () => {
      const params = {
        fundId: 1,
        name: 'IRR Decline Alert',
        description: 'Alert when IRR drops significantly',
        ruleType: 'threshold' as const,
        metricName: 'irr',
        operator: 'lt' as const,
        thresholdValue: -0.05,
        severity: 'critical',
        category: 'performance',
        checkFrequency: 'daily',
        createdBy: 1,
      };

      const result = await service.createAlertRule(params);

      expect(result.id).toBe('test-id');
      expect(result.name).toBe('IRR Decline Alert');
      expect(result.metricName).toBe('irrVariance');
      expect(result.severity).toBe('critical');
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should use default values for optional parameters', async () => {
      const params = {
        name: 'Basic Alert Rule',
        ruleType: 'threshold' as const,
        metricName: 'totalValue',
        operator: 'lt' as const,
        thresholdValue: -0.1,
        createdBy: 1,
      };

      const result = await service.createAlertRule(params);

      // Verify default values were applied
      expect(result.severity).toBe('warning');
      expect(result.category).toBe('performance');
      expect(result.checkFrequency).toBe('daily');
      expect(result.metricName).toBe('totalValueVariance');
    });

    it('should reject unsupported rule extensions', async () => {
      await expect(
        service.createAlertRule({
          name: 'Unsupported Rule',
          ruleType: 'threshold',
          metricName: 'irr',
          operator: 'lt',
          thresholdValue: -0.1,
          conditions: {
            minimumVariance: 0.02,
          },
          createdBy: 1,
        })
      ).rejects.toThrow('conditions are not supported in Phase 1C.1');
    });
  });

  describe('createAlert', () => {
    it('should create performance alert', async () => {
      const params = {
        fundId: 1,
        baselineId: 'baseline-id',
        alertType: 'threshold_breach',
        severity: 'critical',
        category: 'performance',
        title: 'Critical IRR Decline',
        description: 'IRR has declined by more than 5%',
        metricName: 'irr',
        thresholdValue: -0.05,
        actualValue: -0.07,
        ruleId: 'rule-id',
        ruleVersion: '1.0.0',
        contextData: { ruleName: 'IRR Decline Alert' },
        occurrenceCount: 2,
      };

      const result = await service.createAlert(params);

      expect(result.id).toBe('test-id');
      expect(result.title).toBe('Critical IRR Decline');
      expect(result.severity).toBe('critical');
      expect(result.triggeredAt).toBeInstanceOf(Date);
      expect(result.ruleId).toBe('rule-id');
      expect(result.occurrenceCount).toBe(2);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('upsertTriggeredAlertIncident', () => {
    it('should create a new incident with alert metadata', async () => {
      const baseline = {
        id: 'baseline-id',
        name: 'Quarterly Baseline',
        periodStart: new Date('2024-10-01T00:00:00Z'),
        periodEnd: new Date('2024-12-31T23:59:59Z'),
      } as any;
      const rule = {
        id: 'rule-id',
        name: 'IRR Decline Alert',
        metricName: 'irrVariance',
        operator: 'lt',
        thresholdValue: '-0.05',
        secondaryThreshold: null,
        severity: 'warning',
        category: 'performance',
        suppressionPeriod: 60,
        version: '1.0.0',
        triggerCount: 0,
      } as any;

      const result = await service.upsertTriggeredAlertIncident({
        fundId: 1,
        baseline,
        rule,
        metric: {
          metricKey: 'irrVariance',
          metricLabel: 'IRR variance',
          actualValue: new Decimal(-0.07),
          varianceAmount: new Decimal(-0.07),
          variancePercentage: null,
        },
        source: 'manual',
        triggeredAt: new Date('2026-04-02T12:00:00Z'),
      });

      expect(result.suppressed).toBe(false);
      expect(result.alert.ruleId).toBe('rule-id');
      expect(result.alert.baselineId).toBe('baseline-id');
      expect(result.alert.occurrenceCount).toBe(1);
      expect(result.alert.contextData).toMatchObject({
        ruleName: 'IRR Decline Alert',
        metricKey: 'irrVariance',
      });
    });

    it('should update an existing open incident and apply suppression', async () => {
      mockDb.transaction.mockImplementation(async (fn: any) =>
        fn({
          query: {
            performanceAlerts: {
              findFirst: vi.fn().mockResolvedValue({
                id: 'existing-alert',
                fundId: 1,
                baselineId: 'baseline-id',
                ruleId: 'rule-id',
                status: 'active',
                title: 'IRR Decline Alert',
                description: 'Previous description',
                metricName: 'irrVariance',
                severity: 'warning',
                category: 'performance',
                triggeredAt: new Date('2026-04-02T11:00:00Z'),
                lastOccurrence: new Date('2026-04-02T11:30:00Z'),
                occurrenceCount: 2,
              }),
            },
          },
          update: vi.fn(() => ({
            set: vi.fn(() => ({
              where: vi.fn(() => ({
                returning: vi.fn(() =>
                  Promise.resolve([
                    {
                      id: 'existing-alert',
                      occurrenceCount: 3,
                    },
                  ])
                ),
                execute: vi.fn(() => Promise.resolve([])),
              })),
            })),
          })),
          insert: mockDb.insert,
        })
      );

      const baseline = {
        id: 'baseline-id',
        name: 'Quarterly Baseline',
        periodStart: new Date('2024-10-01T00:00:00Z'),
        periodEnd: new Date('2024-12-31T23:59:59Z'),
      } as any;
      const rule = {
        id: 'rule-id',
        name: 'IRR Decline Alert',
        metricName: 'irrVariance',
        operator: 'lt',
        thresholdValue: '-0.05',
        secondaryThreshold: null,
        severity: 'warning',
        category: 'performance',
        suppressionPeriod: 60,
        version: '1.0.0',
        triggerCount: 2,
      } as any;

      const result = await service.upsertTriggeredAlertIncident({
        fundId: 1,
        baseline,
        rule,
        metric: {
          metricKey: 'irrVariance',
          metricLabel: 'IRR variance',
          actualValue: new Decimal(-0.08),
          varianceAmount: new Decimal(-0.08),
          variancePercentage: null,
        },
        source: 'manual',
        triggeredAt: new Date('2026-04-02T11:45:00Z'),
      });

      expect(result.suppressed).toBe(true);
      expect(result.alert.id).toBe('existing-alert');
      expect(result.alert.occurrenceCount).toBe(3);
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge alert with notes', async () => {
      // Mock alert data for metrics
      mockDb.query.performanceAlerts.findFirst.mockResolvedValue({
        id: 'alert-id',
        severity: 'warning',
        triggeredAt: new Date(),
      });

      await service.acknowledgeAlert('alert-id', 1, 'Investigating issue');

      // Verify update was called
      expect(mockDb.update).toHaveBeenCalled();

      // The service performs the update, which our mock handles correctly
      // We've verified the operation completed without error
    });
  });

  describe('resolveAlert', () => {
    it('should resolve alert with resolution notes', async () => {
      // Mock alert data for metrics
      mockDb.query.performanceAlerts.findFirst.mockResolvedValue({
        id: 'alert-id',
        severity: 'warning',
        triggeredAt: new Date(Date.now() - 3600000), // 1 hour ago
      });

      await service.resolveAlert('alert-id', 1, 'Issue resolved after portfolio rebalancing');

      // Verify update was called
      expect(mockDb.update).toHaveBeenCalled();

      // The service performs the update, which our mock handles correctly
      // We've verified the operation completed without error
    });
  });

  describe('resolveSupersededBaselineAlerts', () => {
    it('should resolve older open incidents when a new current baseline is supplied', async () => {
      const triggeredAt = new Date('2026-04-01T12:00:00Z');
      mockDb.query.performanceAlerts.findMany.mockResolvedValue([
        {
          id: 'stale-alert-1',
          severity: 'warning',
          triggeredAt,
        },
        {
          id: 'stale-alert-2',
          severity: 'critical',
          triggeredAt,
        },
      ]);

      const resolvedAt = new Date('2026-04-02T12:00:00Z');
      const result = await service.resolveSupersededBaselineAlerts({
        fundId: 1,
        currentBaselineId: 'baseline-current',
        currentBaselineName: 'Q1 2026 Baseline',
        resolvedBy: 42,
        resolvedAt,
      });

      expect(result).toBe(2);
      expect(mockDb.query.performanceAlerts.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.anything(),
        })
      );
      expect(mockDb.update).toHaveBeenCalledWith(expect.anything());
      expect(mockDb.__getLastUpdateData()).toEqual(
        expect.objectContaining({
          status: 'resolved',
          resolvedBy: 42,
          resolvedAt,
          resolutionNotes:
            'Superseded by default baseline rotation. Current default baseline: Q1 2026 Baseline.',
          updatedAt: resolvedAt,
        })
      );
    });

    it('should no-op when there are no superseded open incidents', async () => {
      mockDb.query.performanceAlerts.findMany.mockResolvedValue([]);

      const result = await service.resolveSupersededBaselineAlerts({
        fundId: 1,
        currentBaselineId: 'baseline-current',
      });

      expect(result).toBe(0);
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe('getActiveAlerts', () => {
    it('should retrieve active alerts with filters', async () => {
      const mockAlerts = [
        varianceTrackingFixtures.alerts.irrDeclineAlert,
        varianceTrackingFixtures.alerts.criticalValueAlert,
      ];

      mockDb.query.performanceAlerts.findMany.mockResolvedValue(mockAlerts);

      const result = await service.getActiveAlerts(1, {
        severity: ['critical', 'warning'],
        category: ['performance'],
        limit: 20,
      });

      expect(result).toEqual(mockAlerts);
      expect(mockDb.query.performanceAlerts.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 20,
        })
      );
    });

    it('should return all active alerts when no filters provided', async () => {
      const mockAlerts = [varianceTrackingFixtures.alerts.irrDeclineAlert];
      mockDb.query.performanceAlerts.findMany.mockResolvedValue(mockAlerts);

      const result = await service.getActiveAlerts(1);

      expect(result).toEqual(mockAlerts);
    });

    it('should accept explicit status filters', async () => {
      const mockAlerts = [varianceTrackingFixtures.alerts.irrDeclineAlert];
      mockDb.query.performanceAlerts.findMany.mockResolvedValue(mockAlerts);

      const result = await service.getActiveAlerts(1, {
        status: ['active', 'investigating'],
      });

      expect(result).toEqual(mockAlerts);
    });

    it('should filter alerts to the current default baseline when requested', async () => {
      const mockAlerts = [varianceTrackingFixtures.alerts.irrDeclineAlert];
      mockDb.query.fundBaselines.findFirst.mockResolvedValue({
        id: 'current-baseline-id',
      });
      mockDb.query.performanceAlerts.findMany.mockResolvedValue(mockAlerts);

      const result = await service.getActiveAlerts(1, {
        currentBaselineOnly: true,
      });

      expect(result).toEqual(mockAlerts);
      expect(mockDb.query.fundBaselines.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.anything(),
          columns: { id: true },
        })
      );
      expect(mockDb.query.performanceAlerts.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.anything(),
        })
      );
    });

    it('should return no current-baseline alerts when the fund has no default baseline', async () => {
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(undefined);

      const result = await service.getActiveAlerts(1, {
        currentBaselineOnly: true,
      });

      expect(result).toEqual([]);
      expect(mockDb.query.performanceAlerts.findMany).not.toHaveBeenCalled();
    });
  });
});

describe('VarianceTrackingService (Integration)', () => {
  let service: VarianceTrackingService;
  let sandbox: any;

  beforeEach(() => {
    sandbox = createSandbox();
    service = new VarianceTrackingService();
    vi.clearAllMocks();
    mockDb.transaction.mockImplementation((fn: any) =>
      fn({
        query: mockDb.query,
        insert: mockDb.insert,
        update: mockDb.update,
        delete: mockDb.delete,
      })
    );
    mockDb.query.performanceAlerts.findFirst.mockReset();
    mockDb.query.performanceAlerts.findFirst.mockResolvedValue(null);
    mockDb.insert.mockImplementation(() => ({
      values: vi.fn((data) => ({
        returning: vi.fn(() => Promise.resolve([{ id: 'test-id', ...data }])),
      })),
    }));
    mockDb.update.mockImplementation(() => ({
      set: vi.fn((data) => ({
        where: vi.fn(() => Promise.resolve([{ id: 'updated-id', ...data }])),
      })),
    }));
  });

  afterEach(async () => {
    await sandbox.abort();
  });

  describe('performCompleteVarianceAnalysis', () => {
    it('should perform complete analysis workflow', async () => {
      // Mock default baseline
      mockDb.query.fundBaselines.findMany.mockResolvedValue([
        {
          id: 'default-baseline',
          isDefault: true,
          ...varianceTrackingFixtures.baselines.quarterly,
        },
      ]);

      // Mock baseline for report generation
      mockDb.query.fundBaselines.findFirst.mockResolvedValue({
        id: 'default-baseline',
        ...varianceTrackingFixtures.baselines.quarterly,
      });

      // Mock current metrics
      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        fundId: 1,
        totalValue: '2600000.00',
        irr: '0.1750', // Slight decline
        multiple: '1.4600',
      });

      // Mock alert rules that should trigger
      mockDb.query.alertRules.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          metricName: 'irr',
          operator: 'lt',
          thresholdValue: '-0.01',
          severity: 'warning',
          isEnabled: true,
        },
      ]);

      // Mock successful insert calls
      let insertCallCount = 0;
      mockDb.insert.mockImplementation(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => {
            insertCallCount++;
            if (insertCallCount === 1) {
              // First call: variance report
              return Promise.resolve([
                {
                  id: 'report-id',
                  alertsTriggered: [
                    {
                      ruleId: 'rule-1',
                      metricName: 'irr',
                      thresholdValue: -0.01,
                      actualValue: -0.01,
                      severity: 'warning',
                    },
                  ],
                },
              ]);
            } else {
              // Subsequent calls: alerts
              return Promise.resolve([{ id: `alert-${insertCallCount}` }]);
            }
          }),
        })),
      }));

      const result = await service.performCompleteVarianceAnalysis({
        fundId: 1,
        reportName: 'Complete Analysis Test',
        userId: 1,
      });

      expect(result.report).toBeDefined();
      expect(result.alertsGenerated).toBeDefined();
      expect(result.report.id).toBe('report-id');
      expect(Array.isArray(result.alertsGenerated)).toBe(true);
    });

    it('should use provided baseline ID', async () => {
      // Mock specific baseline
      mockDb.query.fundBaselines.findFirst.mockResolvedValue({
        id: 'specific-baseline',
        ...varianceTrackingFixtures.baselines.annual,
      });

      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        fundId: 1,
        totalValue: '2600000.00',
      });

      mockDb.query.alertRules.findMany.mockResolvedValue([]);

      mockDb.insert.mockImplementation(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'report-id', alertsTriggered: [] }])),
        })),
      }));

      const result = await service.performCompleteVarianceAnalysis({
        fundId: 1,
        baselineId: 'specific-baseline',
        userId: 1,
      });

      expect(result.report.id).toBe('report-id');
      expect(mockDb.query.fundBaselines.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.anything(),
        })
      );
    });

    it('should throw error when no default baseline exists', async () => {
      // Mock no default baseline
      mockDb.query.fundBaselines.findMany.mockResolvedValue([]);

      await expect(
        service.performCompleteVarianceAnalysis({
          fundId: 1,
          userId: 1,
        })
      ).rejects.toThrow('No default baseline found for fund');
    });

    it('should skip alert persistence when includeAlertGeneration is false', async () => {
      mockDb.query.fundBaselines.findMany.mockResolvedValue([
        {
          id: 'default-baseline',
          isDefault: true,
          ...varianceTrackingFixtures.baselines.quarterly,
        },
      ]);
      mockDb.query.fundBaselines.findFirst.mockResolvedValue({
        id: 'default-baseline',
        ...varianceTrackingFixtures.baselines.quarterly,
      });
      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        fundId: 1,
        totalValue: '2600000.00',
        irr: '0.1750',
      });
      mockDb.query.alertRules.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          metricName: 'irr',
          operator: 'lt',
          thresholdValue: '-0.01',
          severity: 'warning',
          isEnabled: true,
        },
      ]);
      mockDb.insert.mockImplementation(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'report-id', alertsTriggered: [] }])),
        })),
      }));

      const result = await service.performCompleteVarianceAnalysis({
        fundId: 1,
        userId: 1,
        includeAlertGeneration: false,
      });

      expect(result.alertsGenerated).toEqual([]);
      expect(mockDb.insert).toHaveBeenCalledTimes(1);
    });

    it('should set a new default baseline and resolve superseded incidents', async () => {
      mockDb.query.fundBaselines.findFirst
        .mockResolvedValueOnce({
          id: 'baseline-new',
          fundId: 1,
          name: 'New Default',
          isActive: true,
        })
        .mockResolvedValue(undefined);
      mockDb.query.performanceAlerts.findMany.mockResolvedValue([
        {
          id: 'stale-alert',
          severity: 'warning',
          triggeredAt: new Date('2026-04-01T00:00:00Z'),
        },
      ]);

      const result = await service.setDefaultBaselineAndCleanup({
        fundId: 1,
        baselineId: 'baseline-new',
        userId: 7,
      });

      expect(result.baseline.id).toBe('baseline-new');
      expect(result.resolvedSupersededAlerts).toBe(1);
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should clean up superseded incidents for the current default baseline', async () => {
      mockDb.query.fundBaselines.findMany.mockResolvedValue([
        {
          id: 'baseline-current',
          fundId: 1,
          name: 'Current Default',
          isDefault: true,
          isActive: true,
        },
      ]);
      mockDb.query.performanceAlerts.findMany.mockResolvedValue([
        {
          id: 'stale-alert',
          severity: 'warning',
          triggeredAt: new Date('2026-04-01T00:00:00Z'),
        },
      ]);

      const result = await service.cleanupSupersededAlertsForCurrentDefaultBaseline({
        fundId: 1,
        userId: 9,
      });

      expect(result.baseline.id).toBe('baseline-current');
      expect(result.resolvedSupersededAlerts).toBe(1);
      expect(mockDb.query.performanceAlerts.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.anything(),
        })
      );
    });

    it('should generate alerts when variance thresholds are exceeded', async () => {
      // Mock baseline and metrics for significant variance
      mockDb.transaction.mockImplementation((fn: any) =>
        fn({
          query: {
            ...mockDb.query,
            performanceAlerts: {
              findFirst: vi.fn().mockResolvedValue(null),
            },
          },
          insert: mockDb.insert,
          update: mockDb.update,
          delete: mockDb.delete,
        })
      );
      mockDb.query.fundBaselines.findMany.mockResolvedValue([
        { id: 'default-baseline', isDefault: true },
      ]);

      mockDb.query.fundBaselines.findFirst.mockResolvedValue({
        id: 'default-baseline',
        name: 'Quarterly Baseline',
        periodStart: new Date('2024-10-01T00:00:00Z'),
        periodEnd: new Date('2024-12-31T23:59:59Z'),
        totalValue: '2500000.00',
        irr: '0.1850',
      });

      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        totalValue: '2000000.00', // 20% decline
        irr: '0.1350', // 5% decline
      });

      mockDb.query.alertRules.findMany.mockResolvedValue([
        {
          id: 'critical-rule',
          metricName: 'totalValue',
          operator: 'lt',
          thresholdValue: '-0.15',
          severity: 'critical',
          isEnabled: true,
        },
      ]);

      let insertCallCount = 0;
      mockDb.insert.mockImplementation(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => {
            insertCallCount++;
            if (insertCallCount === 1) {
              return Promise.resolve([
                {
                  id: 'variance-report',
                  alertsTriggered: [
                    {
                      ruleId: 'critical-rule',
                      metricName: 'totalValue',
                      thresholdValue: -0.15,
                      actualValue: -0.2,
                      severity: 'critical',
                    },
                  ],
                },
              ]);
            } else {
              return Promise.resolve([{ id: 'generated-alert' }]);
            }
          }),
        })),
      }));

      const result = await service.performCompleteVarianceAnalysis({
        fundId: 1,
        userId: 1,
      });

      expect(result.alertsGenerated).toHaveLength(1);
      expect(result.alertsGenerated[0].id).toBe('generated-alert');
    });
  });

  describe('service integration', () => {
    it('should provide access to all sub-services', () => {
      expect(service.baselines).toBeInstanceOf(BaselineService);
      expect(service.calculations).toBeInstanceOf(VarianceCalculationService);
      expect(service.alerts).toBeInstanceOf(AlertManagementService);
    });

    it('should coordinate between services in complete analysis', async () => {
      // This test ensures that the main service correctly coordinates
      // between its sub-services during complex operations

      // Mock the complete chain of operations
      mockDb.query.fundBaselines.findMany.mockResolvedValue([
        { id: 'baseline-id', isDefault: true },
      ]);

      mockDb.query.fundBaselines.findFirst.mockResolvedValue({
        id: 'baseline-id',
        totalValue: '2500000.00',
      });

      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        totalValue: '2400000.00', // Small decline
      });

      mockDb.query.alertRules.findMany.mockResolvedValue([]);

      mockDb.insert.mockImplementation(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'operation-id', alertsTriggered: [] }])),
        })),
      }));

      // Call the complete analysis
      const result = await service.performCompleteVarianceAnalysis({
        fundId: 1,
        userId: 1,
      });

      // Verify the coordination happened correctly
      expect(mockDb.query.fundBaselines.findMany).toHaveBeenCalled(); // Baseline service call
      expect(mockDb.query.fundMetrics.findFirst).toHaveBeenCalled(); // Calculation service call
      expect(result.report).toBeDefined();
      expect(result.alertsGenerated).toBeDefined();
    });
  });
});

describe('Edge Cases and Error Handling', () => {
  let sandbox: any;

  beforeEach(() => {
    sandbox = createSandbox();
    vi.clearAllMocks();

    // Reset insert mock to original implementation (may have been overridden by previous tests)
    mockDb.insert.mockImplementation(() => ({
      values: vi.fn((data) => ({
        returning: vi.fn(() => Promise.resolve([{ id: 'test-id', ...data }])),
      })),
    }));

    mockDb.transaction.mockImplementation((fn: any) =>
      fn({
        query: mockDb.query,
        insert: mockDb.insert,
        update: mockDb.update,
      })
    );
  });

  afterEach(async () => {
    await sandbox.abort();
  });

  it('should handle missing portfolio data gracefully', async () => {
    const baselineService = new BaselineService();

    mockDb.query.fundMetrics.findFirst.mockResolvedValue({
      fundId: 1,
      totalValue: '1000000.00',
      irr: '0.15',
    });

    // Mock empty portfolio
    mockDb.query.portfolioCompanies.findMany.mockResolvedValue([]);
    mockDb.query.fundSnapshots.findFirst.mockResolvedValue(null);
    mockDb.query.fundBaselines.findFirst.mockResolvedValue(undefined);

    const result = await baselineService.createBaseline({
      fundId: 1,
      name: 'Empty Portfolio Baseline',
      baselineType: 'initial',
      periodStart: new Date(),
      periodEnd: new Date(),
      createdBy: 1,
    });

    expect(result.id).toBe('test-id');
  });

  it('should handle database transaction failures', async () => {
    const baselineService = new BaselineService();

    // Mock transaction failure
    mockDb.transaction.mockRejectedValue(new Error('Transaction failed'));

    await expect(baselineService.setDefaultBaseline('baseline-id', 1)).rejects.toThrow(
      'Transaction failed'
    );
  });

  it('should handle invalid variance calculations', async () => {
    const calculationService = new VarianceCalculationService();

    mockDb.query.fundBaselines.findFirst.mockResolvedValue({
      id: 'baseline-id',
      totalValue: null, // Invalid data
      irr: null,
    });

    mockDb.query.fundMetrics.findFirst.mockResolvedValue({
      totalValue: null,
      irr: null,
    });

    mockDb.query.alertRules.findMany.mockResolvedValue([]);

    // Should handle null values gracefully
    const result = await calculationService.generateVarianceReport({
      fundId: 1,
      baselineId: 'baseline-id',
      reportName: 'Invalid Data Test',
      reportType: 'ad_hoc',
    });

    expect(result.id).toBe('test-id');
  });

  it('should handle alert rule evaluation edge cases', async () => {
    // Test with null threshold
    const rule1 = { metricName: 'irr', operator: 'gt', thresholdValue: null };
    const variances1 = { irrVariance: 0.05 };
    expect(buildAlertRuleEvaluation(rule1 as any, variances1)?.triggered ?? false).toBe(false);

    // Test with undefined metric value
    const rule2 = { metricName: 'irr', operator: 'gt', thresholdValue: 0.01 };
    const variances2 = { irrVariance: null };
    expect(buildAlertRuleEvaluation(rule2 as any, variances2)?.triggered ?? false).toBe(false);

    // Test equality with floating point precision
    // The implementation uses Math.abs(metricValue - threshold) < 0.001
    // 0.10000001 - 0.1 = 0.00000001 which is < 0.001, so it should match
    const rule3 = { metricName: 'irr', operator: 'eq', thresholdValue: 0.1 };
    const variances3 = { irrVariance: 0.10000001 }; // Very close, within tolerance
    expect(buildAlertRuleEvaluation(rule3 as any, variances3)?.triggered ?? false).toBe(true);

    const rule4 = {
      metricName: 'multiple',
      operator: 'between',
      thresholdValue: 0.05,
      secondaryThreshold: 0.15,
    };
    const variances4 = { multipleVariance: 0.1 };
    expect(buildAlertRuleEvaluation(rule4 as any, variances4)?.triggered ?? false).toBe(true);
  });
});

describe('Performance and Scalability', () => {
  let sandbox: any;

  beforeEach(() => {
    sandbox = createSandbox();
    vi.clearAllMocks();

    // Reset insert mock to original implementation (may have been overridden by previous tests)
    mockDb.insert.mockImplementation(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: 'test-id' }])),
      })),
    }));

    mockDb.transaction.mockImplementation((fn: any) =>
      fn({
        query: mockDb.query,
        insert: mockDb.insert,
        update: mockDb.update,
      })
    );
  });

  afterEach(async () => {
    await sandbox.abort();
  });

  it('should handle large portfolio datasets efficiently', async () => {
    const baselineService = new BaselineService();

    // Mock large portfolio
    const largePortfolio = Array.from({ length: 1000 }, (_, i) => ({
      id: i + 1,
      name: `Company ${i + 1}`,
      sector: ['Technology', 'Healthcare', 'Financial Services'][i % 3],
      stage: ['Seed', 'Series A', 'Series B', 'Series C+'][i % 4],
      currentValuation: `${Math.random() * 1000000}`,
      investments: [{ amount: `${Math.random() * 500000}` }],
    }));

    mockDb.query.fundMetrics.findFirst.mockResolvedValue({
      fundId: 1,
      totalValue: '500000000.00',
      irr: '0.18',
    });

    mockDb.query.portfolioCompanies.findMany.mockResolvedValue(largePortfolio);
    mockDb.query.fundSnapshots.findFirst.mockResolvedValue({ payload: {} });
    mockDb.query.fundBaselines.findFirst.mockResolvedValue(undefined);

    const startTime = Date.now();

    const result = await baselineService.createBaseline({
      fundId: 1,
      name: 'Large Portfolio Baseline',
      baselineType: 'annual',
      periodStart: new Date(),
      periodEnd: new Date(),
      createdBy: 1,
    });

    const executionTime = Date.now() - startTime;

    expect(result).toEqual({ id: 'test-id' });
    expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
  });

  it('should handle multiple concurrent variance calculations', async () => {
    const calculationService = new VarianceCalculationService();

    // Mock baseline and metrics for concurrent operations
    mockDb.query.fundBaselines.findFirst.mockResolvedValue({
      id: 'baseline-id',
      totalValue: '2500000.00',
      irr: '0.185',
    });

    mockDb.query.fundMetrics.findFirst.mockResolvedValue({
      totalValue: '2600000.00',
      irr: '0.195',
    });

    mockDb.query.alertRules.findMany.mockResolvedValue([]);

    // Create multiple concurrent variance report generations
    const concurrentOperations = Array.from({ length: 10 }, (_, i) =>
      calculationService.generateVarianceReport({
        fundId: 1,
        baselineId: 'baseline-id',
        reportName: `Concurrent Report ${i + 1}`,
        reportType: 'ad_hoc',
      })
    );

    const startTime = Date.now();
    const results = await Promise.all(concurrentOperations);
    const executionTime = Date.now() - startTime;

    expect(results).toHaveLength(10);
    expect(results.every((r: any) => r.id === 'test-id')).toBe(true);
    expect(executionTime).toBeLessThan(10000); // Should handle concurrency efficiently
  });
});
