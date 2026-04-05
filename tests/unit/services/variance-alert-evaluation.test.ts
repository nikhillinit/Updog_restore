import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Decimal } from '@shared/lib/decimal-utils';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    query: {
      alertRules: {
        findMany: vi.fn(),
      },
    },
  },
}));

vi.mock('../../../server/db', () => ({
  db: mockDb,
}));

import { VarianceAlertEvaluationService } from '../../../server/services/variance-alert-evaluation';

describe('VarianceAlertEvaluationService', () => {
  const baseline = {
    id: 'baseline-1',
    name: 'Default Baseline',
    periodStart: new Date('2026-01-01T00:00:00Z'),
    periodEnd: new Date('2026-03-31T23:59:59Z'),
  } as any;
  const rule = {
    id: 'rule-1',
    fundId: 7,
    name: 'IRR Alert',
    ruleType: 'threshold',
    metricName: 'irrVariance',
    operator: 'lt',
    thresholdValue: '-0.05',
    secondaryThreshold: null,
    severity: 'warning',
    category: 'performance',
    isEnabled: true,
    checkFrequency: 'daily',
  } as any;
  const snapshot = {
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
  } as any;

  const baselines = {
    resolveBaselineForFund: vi.fn(),
  };
  const calculations = {
    computeVarianceSnapshot: vi.fn(),
  };
  const alerts = {
    upsertTriggeredAlertIncident: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    baselines.resolveBaselineForFund.mockResolvedValue(baseline);
    calculations.computeVarianceSnapshot.mockResolvedValue(snapshot);
    mockDb.query.alertRules.findMany.mockResolvedValue([rule]);
  });

  it('keeps manual evaluation distinct when persistAlerts is false', async () => {
    const service = new VarianceAlertEvaluationService(
      baselines as any,
      calculations as any,
      alerts as any
    );

    const result = await service.evaluateVarianceAlerts({
      fundId: 7,
      source: 'manual',
      persistAlerts: false,
      rules: [rule],
    });

    expect(result.alertsGenerated).toEqual([]);
    expect(result.evaluations[0]).toMatchObject({
      status: 'triggered',
      ruleId: 'rule-1',
    });
    expect(alerts.upsertTriggeredAlertIncident).not.toHaveBeenCalled();
  });

  it('passes execution metadata only for automated scheduler evaluation', async () => {
    alerts.upsertTriggeredAlertIncident.mockResolvedValue({
      alert: { id: 'alert-1' },
      suppressed: false,
      deduped: false,
    });
    const service = new VarianceAlertEvaluationService(
      baselines as any,
      calculations as any,
      alerts as any
    );

    await service.evaluateVarianceAlerts({
      fundId: 7,
      source: 'scheduler',
      persistAlerts: true,
      rules: [rule],
      checkFrequency: 'daily',
      executionKey: 'sched:7:baseline-1:daily:2026-04-02T00:00:00.000Z',
      windowStart: new Date('2026-04-02T00:00:00.000Z'),
    });

    expect(alerts.upsertTriggeredAlertIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'scheduler',
        executionKey: 'sched:7:baseline-1:daily:2026-04-02T00:00:00.000Z',
        frequency: 'daily',
        windowStart: new Date('2026-04-02T00:00:00.000Z'),
      })
    );
  });
});
