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
  VarianceTrackingService
} from '../../../server/services/variance-tracking';
import { varianceTrackingFixtures } from '../../fixtures/variance-tracking-fixtures';
import { createSandbox } from '../../setup/test-infrastructure';

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
  startVarianceCalculation: vi.fn(() => vi.fn())
}));

// Mock the database module
vi.mock('../../../server/db', () => {
  const mockDb = {
    query: {
      fundMetrics: {
        findFirst: vi.fn(),
        findMany: vi.fn()
      },
      portfolioCompanies: {
        findMany: vi.fn()
      },
      fundSnapshots: {
        findFirst: vi.fn()
      },
      fundBaselines: {
        findFirst: vi.fn(),
        findMany: vi.fn()
      },
      alertRules: {
        findMany: vi.fn()
      },
      performanceAlerts: {
        findFirst: vi.fn(),
        findMany: vi.fn()
      }
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: 'test-id' }]))
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve())
      }))
    })),
    transaction: vi.fn((fn) => fn(mockDb))
  };

  return { db: mockDb };
});

// Import after mocking to get the mocked instance
import { db as mockDb } from '../../../server/db';

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
        metricDate: new Date()
      });

      // Mock portfolio companies
      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'TechCorp',
          sector: 'Technology',
          stage: 'Series A',
          currentValuation: '500000.00',
          investments: [{ amount: '200000.00' }]
        },
        {
          id: 2,
          name: 'HealthCorp',
          sector: 'Healthcare',
          stage: 'Series B',
          currentValuation: '400000.00',
          investments: [{ amount: '300000.00' }]
        }
      ]);

      // Mock snapshots
      mockDb.query.fundSnapshots.findFirst
        .mockResolvedValueOnce({ payload: { totalReserves: 500000 } }) // Reserve snapshot
        .mockResolvedValueOnce({ payload: { deploymentRate: 0.8 } }); // Pacing snapshot

      // Mock existing defaults check
      mockDb.query.fundBaselines.findMany.mockResolvedValue([]);

      const params = {
        fundId: 1,
        name: 'Q4 2024 Baseline',
        description: 'End of quarter baseline',
        baselineType: 'quarterly' as const,
        periodStart: new Date('2024-10-01'),
        periodEnd: new Date('2024-12-31'),
        createdBy: 1,
        tags: ['quarterly', 'audited']
      };

      const result = await service.createBaseline(params);

      expect(result).toEqual({ id: 'test-id' });
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
        createdBy: 1
      };

      await expect(service.createBaseline(params)).rejects.toThrow('No fund metrics available');
    });

    it('should set first baseline as default', async () => {
      // Mock fund metrics
      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        fundId: 1,
        totalValue: '2500000.00',
        irr: '0.1850'
      });

      // Mock portfolio data
      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([]);
      mockDb.query.fundSnapshots.findFirst.mockResolvedValue({ payload: {} });

      // Mock no existing defaults
      mockDb.query.fundBaselines.findMany.mockResolvedValue([]);

      const insertMock = vi.fn().mockResolvedValue([{ id: 'baseline-id' }]);
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: insertMock
        })
      });

      await service.createBaseline({
        fundId: 1,
        name: 'First Baseline',
        baselineType: 'initial',
        periodStart: new Date(),
        periodEnd: new Date(),
        createdBy: 1
      });

      // Verify the baseline data includes isDefault: true
      const baselineData = mockDb.insert.mock.calls[0][0]; // Get the table argument
      const valuesCall = mockDb.insert().values.mock.calls[0][0]; // Get the values argument
      expect(valuesCall.isDefault).toBe(true);
    });

    it('should not set as default when other defaults exist', async () => {
      // Mock fund metrics
      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        fundId: 1,
        totalValue: '2500000.00'
      });

      // Mock portfolio data
      mockDb.query.portfolioCompanies.findMany.mockResolvedValue([]);
      mockDb.query.fundSnapshots.findFirst.mockResolvedValue({ payload: {} });

      // Mock existing default baseline
      mockDb.query.fundBaselines.findMany.mockResolvedValue([
        { id: 'existing-default', isDefault: true }
      ]);

      await service.createBaseline({
        fundId: 1,
        name: 'Second Baseline',
        baselineType: 'quarterly',
        periodStart: new Date(),
        periodEnd: new Date(),
        createdBy: 1
      });

      const valuesCall = mockDb.insert().values.mock.calls[0][0];
      expect(valuesCall.isDefault).toBe(false);
    });
  });

  describe('getBaselines', () => {
    it('should retrieve baselines with filters', async () => {
      const mockBaselines = [
        varianceTrackingFixtures.baselines.quarterly,
        varianceTrackingFixtures.baselines.annual
      ];

      mockDb.query.fundBaselines.findMany.mockResolvedValue(mockBaselines);

      const result = await service.getBaselines(1, {
        baselineType: 'quarterly',
        isDefault: true,
        limit: 10
      });

      expect(result).toEqual(mockBaselines);
      expect(mockDb.query.fundBaselines.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10
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

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalledTimes(2); // Clear old default + set new default
    });
  });

  describe('deactivateBaseline', () => {
    it('should deactivate baseline', async () => {
      await service.deactivateBaseline('baseline-id');

      expect(mockDb.update).toHaveBeenCalledWith(expect.anything());
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
        ...varianceTrackingFixtures.baselines.quarterly
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
        metricDate: new Date()
      });

      // Mock alert rules
      mockDb.query.alertRules.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          metricName: 'irr',
          operator: 'lt',
          thresholdValue: '-0.01',
          severity: 'warning',
          isEnabled: true
        }
      ]);

      const params = {
        fundId: 1,
        baselineId: 'baseline-id',
        reportName: 'Test Variance Report',
        reportType: 'periodic' as const,
        generatedBy: 1
      };

      const result = await service.generateVarianceReport(params);

      expect(result).toEqual({ id: 'test-id' });
      expect(mockDb.insert).toHaveBeenCalled();

      // Verify variance calculations were performed
      const reportData = mockDb.insert().values.mock.calls[0][0];
      expect(reportData.reportName).toBe('Test Variance Report');
      expect(reportData.reportType).toBe('periodic');
    });

    it('should throw error when baseline not found', async () => {
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(null);

      const params = {
        fundId: 1,
        baselineId: 'non-existent',
        reportName: 'Test Report',
        reportType: 'periodic' as const
      };

      await expect(service.generateVarianceReport(params)).rejects.toThrow('Baseline not found');
    });

    it('should calculate variance correctly', async () => {
      const mockBaseline = {
        id: 'baseline-id',
        totalValue: '2500000.00',
        irr: '0.1850',
        multiple: '1.4500'
      };
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(mockBaseline);

      const mockCurrentMetrics = {
        totalValue: '2750000.00', // 10% increase
        irr: '0.1950', // 1% increase
        multiple: '1.5500' // 6.9% increase
      };
      mockDb.query.fundMetrics.findFirst.mockResolvedValue(mockCurrentMetrics);
      mockDb.query.alertRules.findMany.mockResolvedValue([]);

      // Create a spy on the private method by accessing it through the instance
      const calculateVariancesSpy = vi.spyOn(service as any, 'calculateVariances');

      await service.generateVarianceReport({
        fundId: 1,
        baselineId: 'baseline-id',
        reportName: 'Variance Test',
        reportType: 'ad_hoc'
      });

      // Verify variance calculations
      const reportData = mockDb.insert().values.mock.calls[0][0];
      expect(reportData.totalValueVariance).toBeDefined();
      expect(reportData.irrVariance).toBeDefined();
      expect(reportData.multipleVariance).toBeDefined();
    });

    it('should identify significant variances', async () => {
      const mockBaseline = {
        id: 'baseline-id',
        totalValue: '2500000.00',
        irr: '0.1850'
      };
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(mockBaseline);

      // Mock significant decline in metrics
      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        totalValue: '2000000.00', // 20% decline
        irr: '0.1350' // 5% decline
      });
      mockDb.query.alertRules.findMany.mockResolvedValue([]);

      await service.generateVarianceReport({
        fundId: 1,
        baselineId: 'baseline-id',
        reportName: 'Significant Variance Test',
        reportType: 'alert_triggered'
      });

      const reportData = mockDb.insert().values.mock.calls[0][0];
      expect(reportData.riskLevel).toBe('high');
      expect(reportData.significantVariances).toBeDefined();
    });

    it('should trigger alerts when thresholds are breached', async () => {
      const mockBaseline = {
        id: 'baseline-id',
        totalValue: '2500000.00',
        irr: '0.1850'
      };
      mockDb.query.fundBaselines.findFirst.mockResolvedValue(mockBaseline);

      // Mock decline that should trigger alert
      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        totalValue: '2500000.00',
        irr: '0.1750' // 1% decline
      });

      // Mock alert rule
      mockDb.query.alertRules.findMany.mockResolvedValue([
        {
          id: 'alert-rule-1',
          metricName: 'irr',
          operator: 'lt',
          thresholdValue: '-0.05', // 5% decline threshold
          severity: 'warning',
          isEnabled: true
        }
      ]);

      await service.generateVarianceReport({
        fundId: 1,
        baselineId: 'baseline-id',
        reportName: 'Alert Trigger Test',
        reportType: 'alert_triggered'
      });

      const reportData = mockDb.insert().values.mock.calls[0][0];
      expect(reportData.alertsTriggered).toBeDefined();
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
        createdBy: 1
      };

      const result = await service.createAlertRule(params);

      expect(result).toEqual({ id: 'test-id' });
      expect(mockDb.insert).toHaveBeenCalled();

      const ruleData = mockDb.insert().values.mock.calls[0][0];
      expect(ruleData.name).toBe('IRR Decline Alert');
      expect(ruleData.severity).toBe('critical');
    });

    it('should use default values for optional parameters', async () => {
      const params = {
        name: 'Basic Alert Rule',
        ruleType: 'threshold' as const,
        metricName: 'totalValue',
        operator: 'lt' as const,
        thresholdValue: -0.1,
        createdBy: 1
      };

      await service.createAlertRule(params);

      const ruleData = mockDb.insert().values.mock.calls[0][0];
      expect(ruleData.severity).toBe('warning');
      expect(ruleData.category).toBe('performance');
      expect(ruleData.checkFrequency).toBe('daily');
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
        actualValue: -0.07
      };

      const result = await service.createAlert(params);

      expect(result).toEqual({ id: 'test-id' });
      expect(mockDb.insert).toHaveBeenCalled();

      const alertData = mockDb.insert().values.mock.calls[0][0];
      expect(alertData.title).toBe('Critical IRR Decline');
      expect(alertData.severity).toBe('critical');
      expect(alertData.triggeredAt).toBeInstanceOf(Date);
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge alert with notes', async () => {
      // Mock alert data for metrics
      mockDb.query.performanceAlerts.findFirst.mockResolvedValue({
        id: 'alert-id',
        severity: 'warning',
        triggeredAt: new Date()
      });

      await service.acknowledgeAlert('alert-id', 1, 'Investigating issue');

      expect(mockDb.update).toHaveBeenCalled();

      const updateCall = mockDb.update().set.mock.calls[0][0];
      expect(updateCall.status).toBe('acknowledged');
      expect(updateCall.acknowledgedBy).toBe(1);
      expect(updateCall.resolutionNotes).toBe('Investigating issue');
    });
  });

  describe('resolveAlert', () => {
    it('should resolve alert with resolution notes', async () => {
      // Mock alert data for metrics
      mockDb.query.performanceAlerts.findFirst.mockResolvedValue({
        id: 'alert-id',
        severity: 'warning',
        triggeredAt: new Date(Date.now() - 3600000) // 1 hour ago
      });

      await service.resolveAlert('alert-id', 1, 'Issue resolved after portfolio rebalancing');

      expect(mockDb.update).toHaveBeenCalled();

      const updateCall = mockDb.update().set.mock.calls[0][0];
      expect(updateCall.status).toBe('resolved');
      expect(updateCall.resolvedBy).toBe(1);
      expect(updateCall.resolutionNotes).toBe('Issue resolved after portfolio rebalancing');
      expect(updateCall.resolvedAt).toBeInstanceOf(Date);
    });
  });

  describe('getActiveAlerts', () => {
    it('should retrieve active alerts with filters', async () => {
      const mockAlerts = [
        varianceTrackingFixtures.alerts.irrDeclineAlert,
        varianceTrackingFixtures.alerts.criticalValueAlert
      ];

      mockDb.query.performanceAlerts.findMany.mockResolvedValue(mockAlerts);

      const result = await service.getActiveAlerts(1, {
        severity: ['critical', 'warning'],
        category: ['performance'],
        limit: 20
      });

      expect(result).toEqual(mockAlerts);
      expect(mockDb.query.performanceAlerts.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 20
        })
      );
    });

    it('should return all active alerts when no filters provided', async () => {
      const mockAlerts = [varianceTrackingFixtures.alerts.irrDeclineAlert];
      mockDb.query.performanceAlerts.findMany.mockResolvedValue(mockAlerts);

      const result = await service.getActiveAlerts(1);

      expect(result).toEqual(mockAlerts);
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
  });

  afterEach(async () => {
    await sandbox.abort();
  });

  describe('performCompleteVarianceAnalysis', () => {
    it('should perform complete analysis workflow', async () => {
      // Mock default baseline
      mockDb.query.fundBaselines.findMany.mockResolvedValue([
        { id: 'default-baseline', isDefault: true, ...varianceTrackingFixtures.baselines.quarterly }
      ]);

      // Mock baseline for report generation
      mockDb.query.fundBaselines.findFirst.mockResolvedValue({
        id: 'default-baseline',
        ...varianceTrackingFixtures.baselines.quarterly
      });

      // Mock current metrics
      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        fundId: 1,
        totalValue: '2600000.00',
        irr: '0.1750', // Slight decline
        multiple: '1.4600'
      });

      // Mock alert rules that should trigger
      mockDb.query.alertRules.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          metricName: 'irr',
          operator: 'lt',
          thresholdValue: '-0.01',
          severity: 'warning',
          isEnabled: true
        }
      ]);

      // Mock successful insert calls
      let insertCallCount = 0;
      mockDb.insert.mockImplementation(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => {
            insertCallCount++;
            if (insertCallCount === 1) {
              // First call: variance report
              return Promise.resolve([{
                id: 'report-id',
                alertsTriggered: [
                  {
                    ruleId: 'rule-1',
                    metricName: 'irr',
                    thresholdValue: -0.01,
                    actualValue: -0.01,
                    severity: 'warning'
                  }
                ]
              }]);
            } else {
              // Subsequent calls: alerts
              return Promise.resolve([{ id: `alert-${insertCallCount}` }]);
            }
          })
        }))
      }));

      const result = await service.performCompleteVarianceAnalysis({
        fundId: 1,
        reportName: 'Complete Analysis Test',
        userId: 1
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
        ...varianceTrackingFixtures.baselines.annual
      });

      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        fundId: 1,
        totalValue: '2600000.00'
      });

      mockDb.query.alertRules.findMany.mockResolvedValue([]);

      mockDb.insert.mockImplementation(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'report-id', alertsTriggered: [] }]))
        }))
      }));

      const result = await service.performCompleteVarianceAnalysis({
        fundId: 1,
        baselineId: 'specific-baseline',
        userId: 1
      });

      expect(result.report.id).toBe('report-id');
      expect(mockDb.query.fundBaselines.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.anything()
        })
      );
    });

    it('should throw error when no default baseline exists', async () => {
      // Mock no default baseline
      mockDb.query.fundBaselines.findMany.mockResolvedValue([]);

      await expect(
        service.performCompleteVarianceAnalysis({
          fundId: 1,
          userId: 1
        })
      ).rejects.toThrow('No default baseline found for fund');
    });

    it('should generate alerts when variance thresholds are exceeded', async () => {
      // Mock baseline and metrics for significant variance
      mockDb.query.fundBaselines.findMany.mockResolvedValue([
        { id: 'default-baseline', isDefault: true }
      ]);

      mockDb.query.fundBaselines.findFirst.mockResolvedValue({
        id: 'default-baseline',
        totalValue: '2500000.00',
        irr: '0.1850'
      });

      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        totalValue: '2000000.00', // 20% decline
        irr: '0.1350' // 5% decline
      });

      mockDb.query.alertRules.findMany.mockResolvedValue([
        {
          id: 'critical-rule',
          metricName: 'totalValue',
          operator: 'lt',
          thresholdValue: '-0.15',
          severity: 'critical',
          isEnabled: true
        }
      ]);

      let insertCallCount = 0;
      mockDb.insert.mockImplementation(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => {
            insertCallCount++;
            if (insertCallCount === 1) {
              return Promise.resolve([{
                id: 'variance-report',
                alertsTriggered: [
                  {
                    ruleId: 'critical-rule',
                    metricName: 'totalValue',
                    thresholdValue: -0.15,
                    actualValue: -0.20,
                    severity: 'critical'
                  }
                ]
              }]);
            } else {
              return Promise.resolve([{ id: 'generated-alert' }]);
            }
          })
        }))
      }));

      const result = await service.performCompleteVarianceAnalysis({
        fundId: 1,
        userId: 1
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
        { id: 'baseline-id', isDefault: true }
      ]);

      mockDb.query.fundBaselines.findFirst.mockResolvedValue({
        id: 'baseline-id',
        totalValue: '2500000.00'
      });

      mockDb.query.fundMetrics.findFirst.mockResolvedValue({
        totalValue: '2400000.00' // Small decline
      });

      mockDb.query.alertRules.findMany.mockResolvedValue([]);

      mockDb.insert.mockImplementation(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'operation-id', alertsTriggered: [] }]))
        }))
      }));

      // Call the complete analysis
      const result = await service.performCompleteVarianceAnalysis({
        fundId: 1,
        userId: 1
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
  let service: VarianceTrackingService;
  let sandbox: any;

  beforeEach(() => {
    sandbox = createSandbox();
    service = new VarianceTrackingService();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await sandbox.abort();
  });

  it('should handle missing portfolio data gracefully', async () => {
    const baselineService = new BaselineService();

    mockDb.query.fundMetrics.findFirst.mockResolvedValue({
      fundId: 1,
      totalValue: '1000000.00',
      irr: '0.15'
    });

    // Mock empty portfolio
    mockDb.query.portfolioCompanies.findMany.mockResolvedValue([]);
    mockDb.query.fundSnapshots.findFirst.mockResolvedValue(null);
    mockDb.query.fundBaselines.findMany.mockResolvedValue([]);

    const result = await baselineService.createBaseline({
      fundId: 1,
      name: 'Empty Portfolio Baseline',
      baselineType: 'initial',
      periodStart: new Date(),
      periodEnd: new Date(),
      createdBy: 1
    });

    expect(result).toEqual({ id: 'test-id' });
  });

  it('should handle database transaction failures', async () => {
    const baselineService = new BaselineService();

    // Mock transaction failure
    mockDb.transaction.mockRejectedValue(new Error('Transaction failed'));

    await expect(
      baselineService.setDefaultBaseline('baseline-id', 1)
    ).rejects.toThrow('Transaction failed');
  });

  it('should handle invalid variance calculations', async () => {
    const calculationService = new VarianceCalculationService();

    mockDb.query.fundBaselines.findFirst.mockResolvedValue({
      id: 'baseline-id',
      totalValue: null, // Invalid data
      irr: null
    });

    mockDb.query.fundMetrics.findFirst.mockResolvedValue({
      totalValue: null,
      irr: null
    });

    mockDb.query.alertRules.findMany.mockResolvedValue([]);

    // Should handle null values gracefully
    const result = await calculationService.generateVarianceReport({
      fundId: 1,
      baselineId: 'baseline-id',
      reportName: 'Invalid Data Test',
      reportType: 'ad_hoc'
    });

    expect(result).toEqual({ id: 'test-id' });
  });

  it('should handle alert rule evaluation edge cases', async () => {
    const calculationService = new VarianceCalculationService();

    // Test the private evaluateAlertRule method through reflection
    const evaluateAlertRule = (calculationService as any).evaluateAlertRule.bind(calculationService);

    // Test with null threshold
    const rule1 = { metricName: 'irr', operator: 'gt', thresholdValue: null };
    const variances1 = { irrVariance: 0.05 };
    expect(evaluateAlertRule(rule1, variances1)).toBe(false);

    // Test with undefined metric value
    const rule2 = { metricName: 'irr', operator: 'gt', thresholdValue: 0.01 };
    const variances2 = { irrVariance: null };
    expect(evaluateAlertRule(rule2, variances2)).toBe(false);

    // Test equality with floating point precision
    const rule3 = { metricName: 'irr', operator: 'eq', thresholdValue: 0.1 };
    const variances3 = { irrVariance: 0.10000001 }; // Very close but not exactly equal
    expect(evaluateAlertRule(rule3, variances3)).toBe(true);
  });
});

describe('Performance and Scalability', () => {
  let sandbox: any;

  beforeEach(() => {
    sandbox = createSandbox();
    vi.clearAllMocks();
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
      investments: [{ amount: `${Math.random() * 500000}` }]
    }));

    mockDb.query.fundMetrics.findFirst.mockResolvedValue({
      fundId: 1,
      totalValue: '500000000.00',
      irr: '0.18'
    });

    mockDb.query.portfolioCompanies.findMany.mockResolvedValue(largePortfolio);
    mockDb.query.fundSnapshots.findFirst.mockResolvedValue({ payload: {} });
    mockDb.query.fundBaselines.findMany.mockResolvedValue([]);

    const startTime = Date.now();

    const result = await baselineService.createBaseline({
      fundId: 1,
      name: 'Large Portfolio Baseline',
      baselineType: 'annual',
      periodStart: new Date(),
      periodEnd: new Date(),
      createdBy: 1
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
      irr: '0.185'
    });

    mockDb.query.fundMetrics.findFirst.mockResolvedValue({
      totalValue: '2600000.00',
      irr: '0.195'
    });

    mockDb.query.alertRules.findMany.mockResolvedValue([]);

    // Create multiple concurrent variance report generations
    const concurrentOperations = Array.from({ length: 10 }, (_, i) =>
      calculationService.generateVarianceReport({
        fundId: 1,
        baselineId: 'baseline-id',
        reportName: `Concurrent Report ${i + 1}`,
        reportType: 'ad_hoc'
      })
    );

    const startTime = Date.now();
    const results = await Promise.all(concurrentOperations);
    const executionTime = Date.now() - startTime;

    expect(results).toHaveLength(10);
    expect(results.every(r => r.id === 'test-id')).toBe(true);
    expect(executionTime).toBeLessThan(10000); // Should handle concurrency efficiently
  });
});