import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Decimal } from '@shared/lib/decimal-utils';

async function flushAsyncTurns() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

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

  it('enables by default outside tests and can be disabled via env', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const { varianceAlertAutomationService } =
      await import('../../../server/services/variance-alert-automation');

    try {
      mockDb.query.alertRules.findMany.mockResolvedValue([]);
      varianceAlertAutomationService.start({
        plannerIntervalMs: 60_000,
        processorIntervalMs: 60_000,
      });

      expect(varianceAlertAutomationService.getHealth().enabled).toBe(true);

      await varianceAlertAutomationService.stop();

      vi.stubEnv('ENABLE_VARIANCE_ALERT_AUTOMATION', '0');
      varianceAlertAutomationService.start({
        plannerIntervalMs: 60_000,
        processorIntervalMs: 60_000,
      });

      expect(varianceAlertAutomationService.getHealth().enabled).toBe(false);
    } finally {
      await varianceAlertAutomationService.stop();
      vi.unstubAllEnvs();
    }
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

  it('keeps the inner calc-run pipeline sequential across attribution, baseline creation, and per-rule evaluation', async () => {
    let releaseAttributedMetrics: (() => void) | null = null;
    const attributedMetricsPending = new Promise<void>((resolve) => {
      releaseAttributedMetrics = resolve;
    });
    let releaseBaselineCreation: (() => void) | null = null;
    const baselineCreationPending = new Promise<void>((resolve) => {
      releaseBaselineCreation = resolve;
    });
    let releaseFirstRule: (() => void) | null = null;
    const firstRulePending = new Promise<void>((resolve) => {
      releaseFirstRule = resolve;
    });

    const baseline = {
      id: 'baseline-1',
      snapshotDate: new Date('2026-04-02T12:00:00Z'),
      name: 'Calc Run Baseline',
      periodStart: new Date('2026-01-01T00:00:00Z'),
      periodEnd: new Date('2026-03-31T23:59:59Z'),
    };

    mockEnsureAttributedFundMetricsForCalcRun.mockImplementation(async () => {
      await attributedMetricsPending;
    });
    mockCreateBaselineFromCalcRun.mockImplementation(async () => {
      await baselineCreationPending;
      return baseline;
    });
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
      {
        id: 'rule-2',
        fundId: 7,
        name: 'Realtime TVPI Alert',
        ruleType: 'threshold',
        metricName: 'irrVariance',
        operator: 'lt',
        thresholdValue: '-0.05',
        secondaryThreshold: null,
        severity: 'critical',
        category: 'performance',
        isEnabled: true,
        checkFrequency: 'realtime',
        suppressionPeriod: 60,
        version: '1.0.0',
        triggerCount: 0,
      },
    ]);

    const executionKeys: string[] = [];
    mockUpsertTriggeredAlertIncident.mockImplementation(async (params) => {
      executionKeys.push(String(params.executionKey));
      if (String(params.executionKey).endsWith('rule-1')) {
        await firstRulePending;
      }

      return {
        alert: {
          id: `alert-${executionKeys.length}`,
          alertType: 'variance_threshold',
          severity: 'warning',
          category: 'performance',
        },
        suppressed: false,
      };
    });

    const { varianceAlertAutomationService } =
      await import('../../../server/services/variance-alert-automation');

    const completion = varianceAlertAutomationService.runCalcRunCompletion(42, 7);

    await flushAsyncTurns();
    expect(mockCreateBaselineFromCalcRun).not.toHaveBeenCalled();
    expect(mockUpsertTriggeredAlertIncident).not.toHaveBeenCalled();

    releaseAttributedMetrics?.();
    await flushAsyncTurns();
    expect(mockCreateBaselineFromCalcRun).toHaveBeenCalledTimes(1);
    expect(mockUpsertTriggeredAlertIncident).not.toHaveBeenCalled();

    releaseBaselineCreation?.();
    await flushAsyncTurns();
    expect(executionKeys).toEqual(['calc:42:baseline-1:rule-1']);

    releaseFirstRule?.();
    await completion;

    expect(executionKeys).toEqual([
      'calc:42:baseline-1:rule-1',
      'calc:42:baseline-1:rule-2',
    ]);
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

  it('retries failed scheduled jobs until max attempts, then marks them failed', async () => {
    const { varianceAlertAutomationService } =
      await import('../../../server/services/variance-alert-automation');

    await (varianceAlertAutomationService as any).handleJobFailure(
      {
        id: 'job-retry',
        payload: {
          kind: 'variance_alert_evaluation',
          fundId: 7,
          frequency: 'daily',
        },
        attemptCount: 1,
        maxAttempts: 3,
        nextRunAt: new Date('2026-04-02T12:30:00.000Z'),
      },
      'retryable failure'
    );

    const retrySetArg = mockDb.update.mock.results[0]?.value.set.mock.calls[0]?.[0];
    expect(retrySetArg.status).toBe('pending');
    expect(retrySetArg.processingAt).toBeNull();
    expect(retrySetArg.nextRunAt).toBeInstanceOf(Date);

    mockDb.update.mockClear();

    const terminalNextRunAt = new Date('2026-04-02T13:00:00.000Z');
    await (varianceAlertAutomationService as any).handleJobFailure(
      {
        id: 'job-terminal',
        payload: {
          kind: 'variance_alert_evaluation',
          fundId: 7,
          frequency: 'daily',
        },
        attemptCount: 3,
        maxAttempts: 3,
        nextRunAt: terminalNextRunAt,
      },
      'terminal failure'
    );

    const terminalSetArg = mockDb.update.mock.results[0]?.value.set.mock.calls[0]?.[0];
    expect(terminalSetArg.status).toBe('failed');
    expect(terminalSetArg.processingAt).toBeNull();
    expect(terminalSetArg.nextRunAt).toBe(terminalNextRunAt);
  });

  it('recovers stale processing leases and updates processor health counters', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ id: 'failed-row' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'pending-row' }] });

    const { varianceAlertAutomationService } =
      await import('../../../server/services/variance-alert-automation');

    const recovered = await varianceAlertAutomationService.recoverStaleProcessingJobs(
      new Date('2026-04-02T12:34:56.000Z')
    );

    expect(recovered).toBe(2);
    expect(mockDb.execute).toHaveBeenCalledTimes(2);
    expect(varianceAlertAutomationService.getHealth().processor.staleRecovered).toBe(2);
  });
});
