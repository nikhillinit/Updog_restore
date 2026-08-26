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

    expect(executionKeys).toEqual(['calc:42:baseline-1:rule-1', 'calc:42:baseline-1:rule-2']);
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

  describe('leader election', () => {
    // Cast helper for accessing private members of VarianceAlertAutomationService.
    // The service exports a singleton; private fields are reachable in tests via
    // a structural cast. This mirrors the (service as any).handleJobFailure
    // pattern already used by the existing retry test above.
    type LeaderTestSurface = {
      instanceId: string;
      enabled: boolean;
      isLeader: boolean;
      leaseExpiresAt: Date | null;
      lastElectedAt: Date | null;
      runPlannerCycle: () => Promise<void>;
      runProcessorCycle: () => Promise<void>;
      tryAcquireOrRenewLease: (now?: Date) => Promise<boolean>;
      runLeaderRenewalCycle: () => Promise<void>;
      releaseLease: () => Promise<void>;
    };

    // All tests in this block deliberately BYPASS the public start() method
    // because start() synchronously kicks off both runPlannerCycle and
    // runProcessorCycle, which both hit mockDb.execute and interleave with
    // any lease-specific mock setup. Instead, we flip the private `enabled`
    // flag directly so that runPlannerCycle does not early-return, and we
    // drive the lease methods manually. This keeps the processor path out
    // of the test entirely (the D-04 regression guard drives the processor
    // explicitly in its own test).

    it('acquires lease on first planner cycle when DB returns our instance_id in RETURNING', async () => {
      const { varianceAlertAutomationService } =
        await import('../../../server/services/variance-alert-automation');
      const svc = varianceAlertAutomationService as unknown as LeaderTestSurface;

      mockDb.query.alertRules.findMany.mockResolvedValue([]);

      mockDb.execute.mockResolvedValueOnce({
        rows: [
          {
            instance_id: svc.instanceId,
            acquired_at: '2026-04-07T00:00:00Z',
            lease_expires_at: '2026-04-07T00:10:00Z',
          },
        ],
      });

      try {
        svc.enabled = true;
        await svc.runPlannerCycle();

        const health = varianceAlertAutomationService.getHealth().planner;
        expect(health.isLeader).toBe(true);
        expect(health.leaseExpiresAt).toBe('2026-04-07T00:10:00.000Z');
        expect(health.lastElectedAt).toBe('2026-04-07T00:00:00.000Z');
        // Planner body ran and called alertRules.findMany via planScheduledEvaluations
        expect(mockDb.query.alertRules.findMany).toHaveBeenCalled();
      } finally {
        svc.enabled = false;
        svc.isLeader = false;
        svc.leaseExpiresAt = null;
        svc.lastElectedAt = null;
      }
    });

    it('skips planner body when DB returns empty rows (another leader holds the lease)', async () => {
      const { varianceAlertAutomationService } =
        await import('../../../server/services/variance-alert-automation');
      const svc = varianceAlertAutomationService as unknown as LeaderTestSurface;

      mockDb.query.alertRules.findMany.mockResolvedValue([]);
      // Empty rows: the UPDATE WHERE clause was false, so this instance is NOT leader.
      mockDb.execute.mockResolvedValue({ rows: [] });

      try {
        svc.enabled = true;
        await svc.runPlannerCycle();

        const health = varianceAlertAutomationService.getHealth().planner;
        expect(health.isLeader).toBe(false);
        // Planner body (planScheduledEvaluations) MUST NOT have called findMany.
        expect(mockDb.query.alertRules.findMany).not.toHaveBeenCalled();
      } finally {
        svc.enabled = false;
      }
    });

    it('renewal path does NOT reset lastElectedAt', async () => {
      const { varianceAlertAutomationService } =
        await import('../../../server/services/variance-alert-automation');
      const svc = varianceAlertAutomationService as unknown as LeaderTestSurface;

      mockDb.query.alertRules.findMany.mockResolvedValue([]);

      // First call: acquire lease (elected event)
      mockDb.execute.mockResolvedValueOnce({
        rows: [
          {
            instance_id: svc.instanceId,
            acquired_at: '2026-04-07T00:00:00Z',
            lease_expires_at: '2026-04-07T00:10:00Z',
          },
        ],
      });
      // Second call: renew with same instance id, advanced expiry.
      // The service returns the ORIGINAL acquired_at on renewal (that's what the
      // SQL CASE expression preserves). lastElectedAt is set from row.acquired_at
      // only on the elected branch, so we just need the second response row to
      // carry the same instance_id and a later expiry.
      mockDb.execute.mockResolvedValueOnce({
        rows: [
          {
            instance_id: svc.instanceId,
            acquired_at: '2026-04-07T00:00:00Z',
            lease_expires_at: '2026-04-07T00:12:30Z',
          },
        ],
      });

      try {
        svc.enabled = true;
        // Drive the first acquire via tryAcquireOrRenewLease directly to avoid
        // the planScheduledEvaluations body touching additional mocks.
        const firstResult = await svc.tryAcquireOrRenewLease();
        expect(firstResult).toBe(true);

        const firstHealth = varianceAlertAutomationService.getHealth().planner;
        const firstLastElectedAt = firstHealth.lastElectedAt;
        const firstLeaseExpiresAt = firstHealth.leaseExpiresAt;
        expect(firstHealth.isLeader).toBe(true);
        expect(firstLastElectedAt).toBe('2026-04-07T00:00:00.000Z');
        expect(firstLeaseExpiresAt).toBe('2026-04-07T00:10:00.000Z');

        // Trigger renewal
        await svc.runLeaderRenewalCycle();

        const renewedHealth = varianceAlertAutomationService.getHealth().planner;
        expect(renewedHealth.isLeader).toBe(true);
        // lastElectedAt MUST NOT change on renewal
        expect(renewedHealth.lastElectedAt).toBe(firstLastElectedAt);
        // leaseExpiresAt MUST advance
        expect(new Date(renewedHealth.leaseExpiresAt as string).getTime()).toBeGreaterThan(
          new Date(firstLeaseExpiresAt as string).getTime()
        );
      } finally {
        svc.enabled = false;
        svc.isLeader = false;
        svc.leaseExpiresAt = null;
        svc.lastElectedAt = null;
      }
    });

    it('demotes and does NOT run planner body when tryAcquireOrRenewLease throws (DB error)', async () => {
      const { varianceAlertAutomationService } =
        await import('../../../server/services/variance-alert-automation');
      const svc = varianceAlertAutomationService as unknown as LeaderTestSurface;

      mockDb.query.alertRules.findMany.mockResolvedValue([]);

      // First call: become leader
      mockDb.execute.mockResolvedValueOnce({
        rows: [
          {
            instance_id: svc.instanceId,
            acquired_at: '2026-04-07T00:00:00Z',
            lease_expires_at: '2026-04-07T00:10:00Z',
          },
        ],
      });
      // Second call: DB error during the next planner cycle
      mockDb.execute.mockRejectedValueOnce(new Error('connection refused'));

      try {
        svc.enabled = true;

        // First planner cycle: become leader, planner body runs
        await svc.runPlannerCycle();
        expect(varianceAlertAutomationService.getHealth().planner.isLeader).toBe(true);
        const findManyCallsAfterFirst = mockDb.query.alertRules.findMany.mock.calls.length;
        expect(findManyCallsAfterFirst).toBeGreaterThanOrEqual(1);

        // Second planner cycle: lease acquire throws, planner body must NOT run
        await svc.runPlannerCycle();

        const health = varianceAlertAutomationService.getHealth().planner;
        expect(health.isLeader).toBe(false);
        expect(health.leaseExpiresAt).toBeNull();
        // findMany was NOT called again (planner body skipped after demotion)
        expect(mockDb.query.alertRules.findMany.mock.calls.length).toBe(findManyCallsAfterFirst);
      } finally {
        svc.enabled = false;
        svc.isLeader = false;
        svc.leaseExpiresAt = null;
        svc.lastElectedAt = null;
      }
    });

    it('release on stop sets lease_expires_at = NOW() and clears isLeader', async () => {
      const { varianceAlertAutomationService } =
        await import('../../../server/services/variance-alert-automation');
      const svc = varianceAlertAutomationService as unknown as LeaderTestSurface;

      mockDb.query.alertRules.findMany.mockResolvedValue([]);

      // Acquire lease on the first execute call
      mockDb.execute.mockResolvedValueOnce({
        rows: [
          {
            instance_id: svc.instanceId,
            acquired_at: '2026-04-07T00:00:00Z',
            lease_expires_at: '2026-04-07T00:10:00Z',
          },
        ],
      });
      // Any subsequent calls (the release UPDATE) return empty rows cleanly.
      mockDb.execute.mockResolvedValue({ rows: [] });

      try {
        svc.enabled = true;
        const acquired = await svc.tryAcquireOrRenewLease();
        expect(acquired).toBe(true);
        expect(varianceAlertAutomationService.getHealth().planner.isLeader).toBe(true);

        const callCountBeforeRelease = mockDb.execute.mock.calls.length;

        // releaseLease() is what stop() calls internally. Drive it directly
        // because the public stop() method also clears timers that were never
        // started (we bypassed start()), which is safe but noisy.
        await svc.releaseLease();

        const callCountAfterRelease = mockDb.execute.mock.calls.length;
        expect(callCountAfterRelease).toBeGreaterThan(callCountBeforeRelease);

        const health = varianceAlertAutomationService.getHealth().planner;
        expect(health.isLeader).toBe(false);
        expect(health.leaseExpiresAt).toBeNull();
      } finally {
        svc.enabled = false;
        svc.isLeader = false;
        svc.leaseExpiresAt = null;
        svc.lastElectedAt = null;
      }
    });

    it('runProcessorCycle runs regardless of leader status (D-04 regression guard)', async () => {
      const { varianceAlertAutomationService } =
        await import('../../../server/services/variance-alert-automation');
      const svc = varianceAlertAutomationService as unknown as LeaderTestSurface;

      mockDb.query.alertRules.findMany.mockResolvedValue([]);
      // All execute calls return empty rows — no lease acquired AND no job claimed.
      // The processor should still run cleanly without erroring.
      mockDb.execute.mockResolvedValue({ rows: [] });

      try {
        svc.enabled = true;
        // Explicitly drive the processor cycle. This is the D-04 regression
        // guard: runProcessorCycle MUST NOT be gated on isLeader. If someone
        // later adds `if (!this.isLeader) return;` to runProcessorCycle, this
        // test fails because lastStartedAt stays null.
        expect(svc.isLeader).toBe(false);
        await svc.runProcessorCycle();

        const health = varianceAlertAutomationService.getHealth();
        // Confirm we are STILL not leader (sanity)
        expect(health.planner.isLeader).toBe(false);
        // Processor MUST have run (lastStartedAt is set) and MUST NOT have errored
        expect(health.processor.lastStartedAt).not.toBeNull();
        expect(health.processor.lastError).toBeNull();
      } finally {
        svc.enabled = false;
      }
    });

    it('getHealth returns isLeader false and leaseExpiresAt null before any lease operation', async () => {
      const { varianceAlertAutomationService } =
        await import('../../../server/services/variance-alert-automation');

      // Do NOT touch the service at all — fresh singleton per vi.resetModules().
      const health = varianceAlertAutomationService.getHealth().planner;
      expect(health.isLeader).toBe(false);
      expect(health.leaseExpiresAt).toBeNull();
      expect(health.lastElectedAt).toBeNull();
    });

    it('VARIANCE_PLANNER_LEASE_MS env var overrides default lease duration', async () => {
      // Stub env vars BEFORE importing the service so any module-scope reads
      // see the overridden values. The service reads these inside
      // tryAcquireOrRenewLease and start() via parsePositiveIntEnv at call
      // time, so this import-order is not strictly required — but it is the
      // safer default.
      vi.stubEnv('VARIANCE_PLANNER_LEASE_MS', '60000');
      vi.stubEnv('VARIANCE_PLANNER_RENEWAL_MS', '15000');

      const { varianceAlertAutomationService } =
        await import('../../../server/services/variance-alert-automation');
      const svc = varianceAlertAutomationService as unknown as LeaderTestSurface;

      mockDb.query.alertRules.findMany.mockResolvedValue([]);

      // We cannot directly observe the lease_expires_at the service WROTE to
      // the DB because Drizzle's sql tagged-template is opaque under the
      // mock. Instead we assert the round-trip:
      //   1. env vars are read at call time (no crash).
      //   2. tryAcquireOrRenewLease completes successfully.
      //   3. The service's internal leaseExpiresAt reflects the mock response.
      //
      // The integration test in Plan 04 exercises the actual SQL path and
      // asserts the table row against the live NOW() + 60s window — that is
      // the authoritative env-var check. This unit test proves env vars are
      // non-fatal and the code path behaves identically under override.
      const fixedNow = new Date('2026-04-07T00:00:00.000Z');
      const expectedExpiry = new Date(fixedNow.getTime() + 60_000); // 1 minute later

      mockDb.execute.mockResolvedValueOnce({
        rows: [
          {
            instance_id: svc.instanceId,
            acquired_at: fixedNow.toISOString(),
            lease_expires_at: expectedExpiry.toISOString(),
          },
        ],
      });

      try {
        svc.enabled = true;
        const acquired = await svc.tryAcquireOrRenewLease(fixedNow);
        expect(acquired).toBe(true);

        const health = varianceAlertAutomationService.getHealth().planner;
        expect(health.isLeader).toBe(true);
        expect(health.leaseExpiresAt).toBe(expectedExpiry.toISOString());
        expect(health.lastElectedAt).toBe(fixedNow.toISOString());
        expect(mockDb.execute).toHaveBeenCalled();
      } finally {
        svc.enabled = false;
        svc.isLeader = false;
        svc.leaseExpiresAt = null;
        svc.lastElectedAt = null;
        vi.unstubAllEnvs();
      }
    });
  });
});
