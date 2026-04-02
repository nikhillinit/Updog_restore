import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Decimal } from '@shared/lib/decimal-utils';

const {
  mockDb,
  mockEnsureAttributedFundMetricsForCalcRun,
  mockCreateBaselineFromCalcRun,
  mockGetBaselines,
  mockResolveBaselineForFund,
  mockComputeVarianceSnapshot,
  mockUpsertTriggeredAlertIncident,
} = vi.hoisted(() => ({
  mockDb: {
    query: {
      alertRules: {
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
  mockEnsureAttributedFundMetricsForCalcRun: vi.fn(),
  mockCreateBaselineFromCalcRun: vi.fn(),
  mockGetBaselines: vi.fn(),
  mockResolveBaselineForFund: vi.fn(),
  mockComputeVarianceSnapshot: vi.fn(),
  mockUpsertTriggeredAlertIncident: vi.fn(),
}));

vi.mock('../../../server/db', () => ({
  db: mockDb,
}));

vi.mock('../../../server/services/fund-metrics-attribution-service', () => ({
  ensureAttributedFundMetricsForCalcRun: mockEnsureAttributedFundMetricsForCalcRun,
}));

vi.mock('../../../server/services/variance-tracking', () => ({
  varianceTrackingService: {
    baselines: {
      createBaselineFromCalcRun: mockCreateBaselineFromCalcRun,
      getBaselines: mockGetBaselines,
      resolveBaselineForFund: mockResolveBaselineForFund,
    },
    calculations: {
      computeVarianceSnapshot: mockComputeVarianceSnapshot,
    },
    alerts: {
      upsertTriggeredAlertIncident: mockUpsertTriggeredAlertIncident,
    },
  },
}));

vi.mock('../../../server/lib/logger', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe('VarianceAlertAutomationService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockDb.insert.mockImplementation(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: 'job-1' }]),
        })),
      })),
    }));
    mockDb.update.mockImplementation(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    }));
    mockDb.execute.mockResolvedValue({ rows: [] });
  });

  it('runs calc-run realtime alert automation sequentially with replay-safe execution keys', async () => {
    const baseline = {
      id: 'baseline-1',
      snapshotDate: new Date('2026-04-02T12:00:00Z'),
      name: 'Calc Run Baseline',
      periodStart: new Date('2026-01-01T00:00:00Z'),
      periodEnd: new Date('2026-03-31T23:59:59Z'),
    };
    mockCreateBaselineFromCalcRun.mockResolvedValue(baseline);
    mockResolveBaselineForFund.mockResolvedValue(baseline);
    mockComputeVarianceSnapshot.mockResolvedValue({
      baseline,
      asOfDate: new Date('2026-04-02T12:00:00Z'),
      currentMetrics: {},
      baselineMetrics: {},
      variances: {
        irrVariance: new Decimal(-0.07),
      },
      portfolioVariances: null,
      insights: {
        overallScore: '0.2',
        significantVariances: [],
        factors: [],
        riskLevel: 'medium',
        thresholdBreaches: [],
        dataQualityScore: '1.0',
      },
    });
    mockDb.query.alertRules.findMany.mockResolvedValue([
      {
        id: 'rule-1',
        fundId: 7,
        name: 'Realtime IRR Alert',
        ruleType: 'threshold',
        metricName: 'irrVariance',
        operator: 'lt',
        thresholdValue: '-0.05',
        secondaryThreshold: null,
        severity: 'warning',
        category: 'performance',
        isEnabled: true,
        checkFrequency: 'realtime',
        suppressionPeriod: 60,
        version: '1.0.0',
        triggerCount: 0,
      },
    ]);
    mockUpsertTriggeredAlertIncident.mockResolvedValue({
      alert: {
        id: 'alert-1',
        alertType: 'variance_threshold',
        severity: 'warning',
        category: 'performance',
      },
      suppressed: false,
    });

    const { varianceAlertAutomationService } =
      await import('../../../server/services/variance-alert-automation');

    await varianceAlertAutomationService.runCalcRunCompletion(42, 7);

    expect(mockEnsureAttributedFundMetricsForCalcRun).toHaveBeenCalledWith(42);
    expect(mockCreateBaselineFromCalcRun).toHaveBeenCalledWith(42);
    expect(mockUpsertTriggeredAlertIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: 7,
        executionKey: 'calc:42:baseline-1:rule-1',
        runId: 42,
        frequency: 'realtime',
      })
    );
  });

  it('plans one periodic job per fund and frequency and skips funds without a default baseline', async () => {
    mockDb.query.alertRules.findMany.mockResolvedValue([
      { fundId: 7, checkFrequency: 'hourly' },
      { fundId: 7, checkFrequency: 'hourly' },
      { fundId: 9, checkFrequency: 'daily' },
    ]);
    mockGetBaselines.mockImplementation(async (fundId: number) =>
      fundId === 7 ? [{ id: 'baseline-7' }] : []
    );

    const { varianceAlertAutomationService } =
      await import('../../../server/services/variance-alert-automation');

    const enqueued = await varianceAlertAutomationService.planScheduledEvaluations(
      new Date('2026-04-02T12:34:56.000Z')
    );

    expect(enqueued).toBe(1);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    const insertValues = mockDb.insert.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(insertValues.dedupeKey).toBe('variance-alert:7:hourly:2026-04-02T12:00:00.000Z');
  });

  it('processes a scheduled job with scheduler-scoped execution keys', async () => {
    const baseline = {
      id: 'baseline-7',
      snapshotDate: new Date('2026-04-02T12:30:00Z'),
      name: 'Default Baseline',
      periodStart: new Date('2026-01-01T00:00:00Z'),
      periodEnd: new Date('2026-03-31T23:59:59Z'),
    };
    mockGetBaselines.mockResolvedValue([baseline]);
    mockResolveBaselineForFund.mockResolvedValue(baseline);
    mockComputeVarianceSnapshot.mockResolvedValue({
      baseline,
      asOfDate: new Date('2026-04-02T12:34:56Z'),
      currentMetrics: {},
      baselineMetrics: {},
      variances: {
        totalValueVariance: new Decimal(-250000),
      },
      portfolioVariances: null,
      insights: {
        overallScore: '0.4',
        significantVariances: [],
        factors: [],
        riskLevel: 'high',
        thresholdBreaches: [],
        dataQualityScore: '1.0',
      },
    });
    mockDb.query.alertRules.findMany.mockResolvedValue([
      {
        id: 'rule-7',
        fundId: 7,
        name: 'Daily TV Alert',
        ruleType: 'threshold',
        metricName: 'totalValueVariance',
        operator: 'lt',
        thresholdValue: '-100000',
        secondaryThreshold: null,
        severity: 'critical',
        category: 'performance',
        isEnabled: true,
        checkFrequency: 'daily',
        suppressionPeriod: 1440,
        version: '1.0.0',
        triggerCount: 0,
      },
    ]);
    mockUpsertTriggeredAlertIncident.mockResolvedValue({
      alert: {
        id: 'alert-7',
        alertType: 'variance_threshold',
        severity: 'critical',
        category: 'performance',
      },
      suppressed: false,
    });

    const { varianceAlertAutomationService } =
      await import('../../../server/services/variance-alert-automation');

    await varianceAlertAutomationService.processScheduledEvaluationJob({
      id: 'job-7',
      jobType: 'variance_alert_evaluation',
      dedupeKey: 'variance-alert:7:daily:2026-04-02T00:00:00.000Z',
      payload: {
        kind: 'variance_alert_evaluation',
        fundId: 7,
        frequency: 'daily',
        windowStart: '2026-04-02T00:00:00.000Z',
        windowEnd: '2026-04-02T12:34:56.000Z',
      },
      status: 'processing',
      priority: 0,
      attemptCount: 1,
      maxAttempts: 3,
      scheduledFor: new Date('2026-04-02T12:30:00.000Z'),
      processingAt: new Date('2026-04-02T12:35:00.000Z'),
      nextRunAt: new Date('2026-04-02T12:30:00.000Z'),
      completedAt: null,
      errorMessage: null,
      createdAt: new Date('2026-04-02T12:30:00.000Z'),
      updatedAt: new Date('2026-04-02T12:35:00.000Z'),
    });

    expect(mockUpsertTriggeredAlertIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: 7,
        executionKey: 'sched:7:baseline-7:daily:2026-04-02T00:00:00.000Z:rule-7',
        frequency: 'daily',
        windowStart: new Date('2026-04-02T00:00:00.000Z'),
      })
    );
    expect(mockDb.update).toHaveBeenCalled();
  });
});
