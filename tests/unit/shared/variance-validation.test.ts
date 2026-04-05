import { describe, expect, it } from 'vitest';
import {
  CreateAlertRuleRequestSchema,
  GetAlertsQuerySchema,
  PortfolioVarianceSchema,
  VarianceAnalysisRequestSchema,
  VarianceAnalysisResponseSchema,
  VarianceCalculationSchema,
  VarianceDashboardResponseSchema,
  VarianceReportClientResponseSchema,
  VarianceReportResponseSchema,
  signedDecimalSchema,
} from '../../../shared/variance-validation';

describe('variance-validation', () => {
  it('accepts signed decimal strings for negative variance values', () => {
    expect(signedDecimalSchema.parse('-0.125')).toBe('-0.125');

    const parsed = VarianceCalculationSchema.parse({
      totalValueVariance: '-150000.00',
      totalValueVariancePct: '-0.06',
      irrVariance: '-0.0130',
      multipleVariance: '0.0200',
      dpiVariance: null,
      tvpiVariance: null,
    });

    expect(parsed.totalValueVariancePct).toBe('-0.06');
    expect(parsed.irrVariance).toBe('-0.0130');
  });

  it('accepts enriched company variance rows and count-share distribution rows', () => {
    const parsed = PortfolioVarianceSchema.parse({
      companyVariances: [
        {
          companyId: 1,
          companyName: 'AlphaCo',
          sector: 'Technology',
          stage: 'Series A',
          status: 'active',
          changeType: 'matched',
          baselineValuation: '500000.00',
          currentValuation: '650000.00',
          baselineInvestedCapital: '200000.00',
          currentInvestedCapital: null,
          valuationChange: '150000.00',
          valuationChangePct: '0.3000',
          valuationVariance: '150000.00',
          valuationVariancePct: '0.3000',
          riskLevel: 'high',
        },
        {
          companyId: 2,
          companyName: 'BetaCo',
          changeType: 'removed',
          baselineValuation: '400000.00',
          currentValuation: null,
          valuationChange: '-400000.00',
          valuationChangePct: '-1.0000',
          valuationVariance: '-400000.00',
          valuationVariancePct: '-1.0000',
          riskLevel: 'critical',
        },
      ],
      sectorVariances: {
        Technology: {
          current: 5,
          baseline: 4,
          delta: 1,
          deltaPct: 0.25,
          currentCountShare: 0.625,
          baselineCountShare: 0.6666666667,
          countShareDelta: -0.0416666667,
          countShareDeltaPct: -0.0625,
        },
      },
      stageVariances: {
        Seed: {
          current: 2,
          baseline: 3,
          delta: -1,
          deltaPct: -0.3333333333,
          currentCountShare: 0.2,
          baselineCountShare: 0.3,
          countShareDelta: -0.1,
          countShareDeltaPct: -0.3333333333,
        },
      },
      portfolioCountVariance: 1,
    });

    expect(parsed.companyVariances[0]?.changeType).toBe('matched');
    expect(parsed.companyVariances[1]?.valuationVariancePct).toBe('-1.0000');
    expect(parsed.sectorVariances['Technology']?.countShareDeltaPct).toBeCloseTo(-0.0625, 10);
  });

  it('rejects the current client-shaped variance report payload when parsed as the db-style response schema', () => {
    const clientReportShape = {
      id: 'report-id',
      fundId: 1,
      baselineId: 'baseline-id',
      reportName: 'December 2024 Variance Analysis',
      reportType: 'periodic',
      reportPeriod: 'monthly',
      asOfDate: '2024-12-31T23:59:59.000Z',
      generatedAt: '2024-12-31T12:00:00.000Z',
      summary: {
        totalVariances: 2,
        significantVariances: 1,
        criticalVariances: 0,
      },
      variances: [
        { metric: 'totalValue', value: '150000.00', pct: '0.06' },
        { metric: 'irr', value: '-0.0130', pct: null },
      ],
    };

    expect(VarianceReportResponseSchema.safeParse(clientReportShape).success).toBe(false);
  });

  it('accepts the canonical client-shaped variance report payload', () => {
    const clientReportShape = {
      id: '00000000-0000-0000-0000-000000000111',
      fundId: 1,
      baselineId: '00000000-0000-0000-0000-000000000222',
      reportName: 'December 2024 Variance Analysis',
      reportType: 'periodic',
      reportPeriod: 'monthly',
      asOfDate: '2024-12-31T23:59:59.000Z',
      generatedAt: '2024-12-31T12:00:00.000Z',
      summary: {
        totalVariances: 2,
        significantVariances: 1,
        criticalVariances: 0,
      },
      variances: [
        { metric: 'totalValue', value: '150000.00', pct: '0.06' },
        { metric: 'irr', value: '-0.0130', pct: null },
      ],
    };

    expect(VarianceReportClientResponseSchema.parse(clientReportShape).summary.totalVariances).toBe(
      2
    );
  });

  it('accepts the normalized dashboard route payload with legacy alias preserved', () => {
    const dashboardShape = {
      defaultBaseline: null,
      recentBaselines: [],
      activeAlerts: [],
      alertsBySeverity: {
        critical: 1,
        warning: 2,
        info: 0,
        urgent: 0,
      },
      alertsByseverity: {
        critical: 1,
        warning: 2,
        info: 0,
        urgent: 0,
      },
      summary: {
        totalBaselines: 3,
        totalActiveAlerts: 3,
        lastAnalysisDate: '2026-03-31T18:00:00.000Z',
        overallRiskLevel: 'medium',
        trendDirection: 'stable',
      },
      recentReports: [],
    };

    expect(VarianceDashboardResponseSchema.parse(dashboardShape).summary.overallRiskLevel).toBe(
      'medium'
    );
  });

  it('accepts supported Phase 1C.1 alert rule metrics and rejects unsupported extensions', () => {
    const validRule = CreateAlertRuleRequestSchema.parse({
      name: 'IRR Decline',
      ruleType: 'threshold',
      metricName: 'irr',
      operator: 'lt',
      thresholdValue: -0.05,
    });

    expect(validRule.metricName).toBe('irr');

    expect(
      CreateAlertRuleRequestSchema.safeParse({
        name: 'Conditional IRR Decline',
        ruleType: 'threshold',
        metricName: 'irr',
        operator: 'lt',
        thresholdValue: -0.05,
        conditions: {
          minimumVariance: 0.01,
        },
      }).success
    ).toBe(false);
  });

  it('keeps the alerts query contract truthful for explicit status filters', () => {
    const parsed = GetAlertsQuerySchema.parse({
      status: 'active,investigating',
      baselineScope: 'current',
      limit: '10',
    });

    expect(parsed.status).toEqual(['active', 'investigating']);
    expect(parsed.baselineScope).toBe('current');
    expect(parsed.limit).toBe(10);
  });

  it('matches the chosen client-shaped variance-analysis request and response contract', () => {
    const request = VarianceAnalysisRequestSchema.parse({
      baselineId: '00000000-0000-0000-0000-000000000222',
      reportName: 'Manual Analysis',
      includeAlertGeneration: false,
    });

    expect(request.includeAlertGeneration).toBe(false);
    expect(
      VarianceAnalysisResponseSchema.safeParse({
        report: {
          id: '00000000-0000-0000-0000-000000000111',
          fundId: 1,
          baselineId: '00000000-0000-0000-0000-000000000222',
          reportName: 'Manual Analysis',
          reportType: 'ad_hoc',
          asOfDate: '2024-12-31T23:59:59.000Z',
          generatedAt: '2024-12-31T12:00:00.000Z',
          summary: {
            totalVariances: 0,
            significantVariances: 0,
            criticalVariances: 0,
          },
          variances: [],
        },
        alertsGenerated: [],
        alertCount: 0,
      }).success
    ).toBe(true);
  });
});
