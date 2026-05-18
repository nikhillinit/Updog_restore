import { describe, expect, it } from 'vitest';
import type { PerformanceAlert, VarianceReport as DbVarianceReport } from '@shared/schema';
import {
  ClientAlertResponseSchema,
  VarianceReportClientResponseSchema,
} from '@shared/variance-validation';
import {
  buildAlertCounts,
  toClientAlert,
  toDashboardRecentReport,
  toVarianceReportClientResponse,
} from '../../../server/routes/variance/response-adapters';

describe('variance response adapters', () => {
  it('maps a persisted variance report to the full client report shape', () => {
    const report = {
      id: '00000000-0000-0000-0000-000000000214',
      fundId: 1,
      baselineId: '00000000-0000-0000-0000-000000000123',
      reportName: 'December 2024 Variance Analysis',
      reportType: 'periodic',
      reportPeriod: 'monthly',
      asOfDate: new Date('2024-12-31T23:59:59Z'),
      generatedBy: 42,
      createdAt: new Date('2024-12-31T12:00:00Z'),
      totalValueVariance: '150000.00',
      totalValueVariancePct: '0.06',
      irrVariance: '-0.013',
      multipleVariance: null,
      dpiVariance: null,
      tvpiVariance: null,
      significantVariances: [
        { metric: 'irr', severity: 'medium' },
        { metric: 'tvpi', severity: 'critical' },
      ],
      portfolioVariances: {
        companyVariances: [],
        portfolioCountVariance: 0,
      },
    } as DbVarianceReport;

    const clientReport = toVarianceReportClientResponse(report);

    expect(VarianceReportClientResponseSchema.parse(clientReport)).toMatchObject({
      id: report.id,
      reportName: report.reportName,
      reportType: 'periodic',
      reportPeriod: 'monthly',
      generatedBy: 42,
      generatedAt: '2024-12-31T12:00:00.000Z',
      summary: {
        totalVariances: 2,
        significantVariances: 2,
        criticalVariances: 1,
      },
    });
    expect(clientReport.variances).toEqual([
      { metric: 'totalValue', value: '150000.00', pct: '0.06' },
      { metric: 'irr', value: '-0.013', pct: null },
    ]);
    expect(clientReport.portfolioVariances).toEqual({
      companyVariances: [],
      portfolioCountVariance: 0,
    });
  });

  it('maps a persisted variance report to the dashboard recent-report shape separately', () => {
    const report = {
      id: '00000000-0000-0000-0000-000000000501',
      reportName: 'Latest Variance Report',
      createdAt: new Date('2026-03-31T18:00:00Z'),
      riskLevel: 'high',
      overallVarianceScore: '0.35',
    };

    expect(toDashboardRecentReport(report)).toEqual({
      id: '00000000-0000-0000-0000-000000000501',
      name: 'Latest Variance Report',
      riskLevel: 'high',
      createdAt: '2026-03-31T18:00:00.000Z',
      overallVarianceScore: '0.35',
    });
  });

  it('preserves dashboard recent-report fallbacks', () => {
    expect(
      toDashboardRecentReport({
        id: '00000000-0000-0000-0000-000000000502',
        reportName: 'Fallback Report',
        createdAt: null,
        riskLevel: null,
        overallVarianceScore: null,
      })
    ).toEqual({
      id: '00000000-0000-0000-0000-000000000502',
      name: 'Fallback Report',
      riskLevel: 'low',
      createdAt: '1970-01-01T00:00:00.000Z',
      overallVarianceScore: null,
    });
  });

  it('normalizes raw alerts before counting dashboard severity buckets', () => {
    const rawAlerts = [
      {
        id: '00000000-0000-0000-0000-000000000601',
        fundId: null,
        baselineId: '00000000-0000-0000-0000-000000000123',
        ruleId: '00000000-0000-0000-0000-000000000701',
        title: 'IRR Decline Detected',
        severity: 'unexpected',
        category: 'unknown',
        description: 'Fund IRR has declined from baseline.',
        status: 'mystery',
        triggeredAt: new Date('2026-03-31T18:05:00Z'),
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        resolvedBy: null,
        resolutionNotes: null,
        contextData: {
          ruleName: 'IRR Decline Rule',
          baselineName: 'Q1 Baseline',
        },
      },
      {
        id: '00000000-0000-0000-0000-000000000602',
        fundId: 1,
        baselineId: null,
        ruleId: null,
        title: 'TVPI Threshold',
        severity: 'critical',
        category: 'risk',
        description: 'TVPI crossed the configured threshold.',
        status: 'active',
        triggeredAt: new Date('2026-03-31T18:10:00Z'),
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        resolvedBy: null,
        resolutionNotes: null,
        contextData: null,
      },
    ] as PerformanceAlert[];

    const clientAlerts = rawAlerts.map((alert) => toClientAlert(alert, 1));

    expect(ClientAlertResponseSchema.parse(clientAlerts[0])).toMatchObject({
      fundId: 1,
      baselineName: 'Q1 Baseline',
      ruleName: 'IRR Decline Rule',
      severity: 'warning',
      category: 'performance',
      status: 'active',
      triggeredAt: '2026-03-31T18:05:00.000Z',
    });
    expect(buildAlertCounts(clientAlerts)).toEqual({
      critical: 1,
      warning: 1,
      info: 0,
      urgent: 0,
    });
  });
});
