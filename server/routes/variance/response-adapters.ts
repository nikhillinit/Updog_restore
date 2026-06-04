import type { PerformanceAlert, VarianceReport as DbVarianceReport } from '@shared/schema';
import type {
  ClientAlertResponse,
  VarianceDashboardResponse,
  VarianceReportClientResponse,
} from '@shared/variance-validation';

const VARIANCE_COLS = [
  { metric: 'totalValue', value: 'totalValueVariance', pct: 'totalValueVariancePct' },
  { metric: 'irr', value: 'irrVariance', pct: null },
  { metric: 'multiple', value: 'multipleVariance', pct: null },
  { metric: 'dpi', value: 'dpiVariance', pct: null },
  { metric: 'tvpi', value: 'tvpiVariance', pct: null },
] as const;

export interface DashboardRecentVarianceReport {
  id: string;
  reportName: string;
  riskLevel?: string | null;
  createdAt?: Date | string | null;
  overallVarianceScore?: string | null;
}

export function toVarianceReportClientResponse(
  row: DbVarianceReport
): VarianceReportClientResponse {
  const variances: VarianceReportClientResponse['variances'] = [];
  let totalVariances = 0;

  for (const col of VARIANCE_COLS) {
    const val = row[col['value']] as string | null | undefined;
    if (val != null) {
      totalVariances++;
      variances.push({
        metric: col['metric'],
        value: val,
        pct: col['pct'] ? ((row[col['pct']] as string | null | undefined) ?? null) : null,
      });
    }
  }

  const sigArr = Array.isArray(row['significantVariances']) ? row['significantVariances'] : [];
  const criticalCount = sigArr.filter(
    (item: unknown) =>
      item != null &&
      typeof item === 'object' &&
      'severity' in (item as Record<string, unknown>) &&
      ((item as Record<string, unknown>)['severity'] === 'critical' ||
        (item as Record<string, unknown>)['severity'] === 'high')
  ).length;

  return {
    id: row['id'],
    fundId: row['fundId'],
    baselineId: row['baselineId'],
    reportName: row['reportName'],
    reportType: row['reportType'] as VarianceReportClientResponse['reportType'],
    ...(row['reportPeriod'] != null && {
      reportPeriod: row['reportPeriod'] as NonNullable<
        VarianceReportClientResponse['reportPeriod']
      >,
    }),
    asOfDate:
      row['asOfDate'] instanceof Date ? row['asOfDate'].toISOString() : String(row['asOfDate']),
    ...(row['generatedBy'] != null && { generatedBy: row['generatedBy'] }),
    generatedAt:
      row['createdAt'] instanceof Date
        ? row['createdAt'].toISOString()
        : String(row['createdAt'] ?? ''),
    summary: {
      totalVariances,
      significantVariances: sigArr.length,
      criticalVariances: criticalCount,
    },
    variances,
    ...(row['portfolioVariances'] != null && {
      portfolioVariances: row['portfolioVariances'] as NonNullable<
        VarianceReportClientResponse['portfolioVariances']
      >,
    }),
    ...(row['sectorVariances'] != null && {
      sectorVariances: row['sectorVariances'] as NonNullable<
        VarianceReportClientResponse['sectorVariances']
      >,
    }),
    ...(row['stageVariances'] != null && {
      stageVariances: row['stageVariances'] as NonNullable<
        VarianceReportClientResponse['stageVariances']
      >,
    }),
    ...(row['reserveVariances'] != null && {
      reserveVariances: row['reserveVariances'] as NonNullable<
        VarianceReportClientResponse['reserveVariances']
      >,
    }),
    ...(row['pacingVariances'] != null && {
      pacingVariances: row['pacingVariances'] as NonNullable<
        VarianceReportClientResponse['pacingVariances']
      >,
    }),
  };
}

export function toDashboardRecentReport(
  report: DashboardRecentVarianceReport
): VarianceDashboardResponse['recentReports'][number] {
  return {
    id: report.id,
    name: report.reportName,
    riskLevel: report.riskLevel ?? 'low',
    createdAt: toIsoTimestamp(report.createdAt) ?? new Date(0).toISOString(),
    overallVarianceScore: report.overallVarianceScore ?? null,
  };
}

function toIsoTimestamp(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : String(value);
}

export function buildAlertCounts(
  activeAlerts: ClientAlertResponse[]
): VarianceDashboardResponse['alertsBySeverity'] {
  return {
    critical: activeAlerts.filter((alert) => alert.severity === 'critical').length,
    warning: activeAlerts.filter((alert) => alert.severity === 'warning').length,
    info: activeAlerts.filter((alert) => alert.severity === 'info').length,
    urgent: activeAlerts.filter((alert) => alert.severity === 'urgent').length,
  };
}

export function normalizeAlertSeverity(value: string | null): ClientAlertResponse['severity'] {
  return value === 'info' || value === 'warning' || value === 'critical' || value === 'urgent'
    ? value
    : 'warning';
}

export function normalizeAlertCategory(value: string | null): ClientAlertResponse['category'] {
  return value === 'performance' ||
    value === 'risk' ||
    value === 'compliance' ||
    value === 'operational'
    ? value
    : 'performance';
}

export function normalizeAlertStatus(value: string | null): ClientAlertResponse['status'] {
  return value === 'active' ||
    value === 'acknowledged' ||
    value === 'investigating' ||
    value === 'resolved' ||
    value === 'dismissed'
    ? value
    : 'active';
}

export function toClientAlert(alert: PerformanceAlert, fundId: number): ClientAlertResponse {
  const contextData =
    alert.contextData && typeof alert.contextData === 'object'
      ? (alert.contextData as Record<string, unknown>)
      : {};
  const contextRuleName =
    typeof contextData['ruleName'] === 'string' ? contextData['ruleName'] : null;
  const contextBaselineName =
    typeof contextData['baselineName'] === 'string' ? contextData['baselineName'] : null;

  return {
    id: alert.id,
    fundId: alert.fundId ?? fundId,
    baselineId: alert.baselineId ?? null,
    baselineName: contextBaselineName,
    ruleId: alert.ruleId ?? null,
    ruleName: contextRuleName ?? alert.title,
    severity: normalizeAlertSeverity(alert.severity),
    category: normalizeAlertCategory(alert.category),
    message: alert.description,
    details: contextData,
    status: normalizeAlertStatus(alert.status),
    triggeredAt: toIsoTimestamp(alert.triggeredAt) ?? '',
    acknowledgedAt: toIsoTimestamp(alert.acknowledgedAt) ?? null,
    acknowledgedBy: alert.acknowledgedBy ?? null,
    resolvedAt: toIsoTimestamp(alert.resolvedAt) ?? null,
    resolvedBy: alert.resolvedBy ?? null,
    notes: alert.resolutionNotes ?? null,
  };
}
