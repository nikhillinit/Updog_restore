/**
 * Variance Tracking Metrics
 *
 * Prometheus metrics for monitoring variance tracking system performance,
 * alert frequency, and baseline management operations.
 */

import { register, Counter, Histogram, Gauge } from 'prom-client';

// === VARIANCE CALCULATION METRICS ===

/**
 * Counter for variance report generation operations
 */
export const varianceReportsGenerated = new Counter({
  name: 'variance_reports_generated_total',
  help: 'Total number of variance reports generated',
  labelNames: ['fund_id', 'report_type', 'status'] as const,
  registers: [register]
});

/**
 * Histogram for variance calculation duration
 */
export const varianceCalculationDuration = new Histogram({
  name: 'variance_calculation_duration_seconds',
  help: 'Time taken to calculate variance metrics',
  labelNames: ['fund_id', 'calculation_type'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register]
});

/**
 * Gauge for active variance tracking operations
 */
export const activeVarianceCalculations = new Gauge({
  name: 'variance_calculations_active',
  help: 'Number of variance calculations currently in progress',
  labelNames: ['calculation_type'] as const,
  registers: [register]
});

// === BASELINE MANAGEMENT METRICS ===

/**
 * Counter for baseline operations
 */
export const baselineOperations = new Counter({
  name: 'baseline_operations_total',
  help: 'Total number of baseline operations performed',
  labelNames: ['fund_id', 'operation_type', 'baseline_type'] as const,
  registers: [register]
});

/**
 * Gauge for total active baselines
 */
export const totalActiveBaselines = new Gauge({
  name: 'baselines_active_total',
  help: 'Total number of active baselines across all funds',
  labelNames: ['baseline_type'] as const,
  registers: [register]
});

/**
 * Histogram for baseline creation duration
 */
export const baselineCreationDuration = new Histogram({
  name: 'baseline_creation_duration_seconds',
  help: 'Time taken to create a new baseline',
  labelNames: ['fund_id', 'baseline_type'] as const,
  buckets: [0.5, 1, 2, 5, 10, 30],
  registers: [register]
});

// === ALERT METRICS ===

/**
 * Counter for alerts generated
 */
export const alertsGenerated = new Counter({
  name: 'performance_alerts_generated_total',
  help: 'Total number of performance alerts generated',
  labelNames: ['fund_id', 'alert_type', 'severity', 'category'] as const,
  registers: [register]
});

/**
 * Counter for alert actions
 */
export const alertActions = new Counter({
  name: 'alert_actions_total',
  help: 'Total number of alert actions performed',
  labelNames: ['action_type', 'severity'] as const,
  registers: [register]
});

/**
 * Gauge for active alerts by severity
 */
export const activeAlertsBySeverity = new Gauge({
  name: 'alerts_active_by_severity',
  help: 'Number of active alerts grouped by severity',
  labelNames: ['severity', 'category'] as const,
  registers: [register]
});

/**
 * Histogram for alert resolution time
 */
export const alertResolutionTime = new Histogram({
  name: 'alert_resolution_time_seconds',
  help: 'Time taken to resolve alerts from trigger to resolution',
  labelNames: ['severity', 'alert_type'] as const,
  buckets: [300, 1800, 3600, 21600, 86400, 259200], // 5min to 3 days
  registers: [register]
});

// === VARIANCE THRESHOLD METRICS ===

/**
 * Gauge for variance scores by fund
 */
export const fundVarianceScores = new Gauge({
  name: 'fund_variance_score',
  help: 'Current variance score for each fund',
  labelNames: ['fund_id', 'baseline_id'] as const,
  registers: [register]
});

/**
 * Counter for threshold breaches
 */
export const thresholdBreaches = new Counter({
  name: 'variance_threshold_breaches_total',
  help: 'Total number of variance threshold breaches',
  labelNames: ['fund_id', 'metric_name', 'threshold_type'] as const,
  registers: [register]
});

/**
 * Histogram for variance analysis depth
 */
export const varianceAnalysisComplexity = new Histogram({
  name: 'variance_analysis_complexity',
  help: 'Complexity score of variance analysis operations',
  labelNames: ['fund_id', 'analysis_type'] as const,
  buckets: [1, 5, 10, 25, 50, 100],
  registers: [register]
});

// === API PERFORMANCE METRICS ===

/**
 * Counter for variance API requests
 */
export const varianceApiRequests = new Counter({
  name: 'variance_api_requests_total',
  help: 'Total number of variance tracking API requests',
  labelNames: ['endpoint', 'method', 'status_code'] as const,
  registers: [register]
});

/**
 * Histogram for variance API response times
 */
export const varianceApiDuration = new Histogram({
  name: 'variance_api_duration_seconds',
  help: 'Duration of variance tracking API requests',
  labelNames: ['endpoint', 'method'] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

// === DATA QUALITY METRICS ===

/**
 * Gauge for data quality scores
 */
export const dataQualityScores = new Gauge({
  name: 'variance_data_quality_score',
  help: 'Data quality score for variance calculations',
  labelNames: ['fund_id', 'data_source'] as const,
  registers: [register]
});

/**
 * Counter for data validation errors
 */
export const dataValidationErrors = new Counter({
  name: 'variance_data_validation_errors_total',
  help: 'Total number of data validation errors in variance calculations',
  labelNames: ['fund_id', 'error_type', 'data_source'] as const,
  registers: [register]
});

// === SYSTEM HEALTH METRICS ===

/**
 * Gauge for variance tracking system health
 */
export const systemHealthScore = new Gauge({
  name: 'variance_system_health_score',
  help: 'Overall health score of the variance tracking system',
  registers: [register]
});

/**
 * Counter for system errors
 */
export const systemErrors = new Counter({
  name: 'variance_system_errors_total',
  help: 'Total number of system errors in variance tracking',
  labelNames: ['component', 'error_type'] as const,
  registers: [register]
});

// === UTILITY FUNCTIONS ===

/**
 * Record variance report generation metrics
 */
export function recordVarianceReportGenerated(
  fundId: string,
  reportType: string,
  status: string,
  duration: number
): void {
  varianceReportsGenerated.labels(fundId, reportType, status).inc();
  varianceCalculationDuration.labels(fundId, 'report_generation').observe(duration);
}

/**
 * Record baseline operation metrics
 */
export function recordBaselineOperation(
  fundId: string,
  operation: string,
  baselineType: string,
  duration?: number
): void {
  baselineOperations.labels(fundId, operation, baselineType).inc();

  if (duration && operation === 'create') {
    baselineCreationDuration.labels(fundId, baselineType).observe(duration);
  }
}

/**
 * Record alert generation metrics
 */
export function recordAlertGenerated(
  fundId: string,
  alertType: string,
  severity: string,
  category: string
): void {
  alertsGenerated.labels(fundId, alertType, severity, category).inc();
  activeAlertsBySeverity.labels(severity, category).inc();
}

/**
 * Record alert action metrics
 */
export function recordAlertAction(
  action: string,
  severity: string,
  resolutionTime?: number
): void {
  alertActions.labels(action, severity).inc();

  if (action === 'resolve' && resolutionTime) {
    alertResolutionTime.labels(severity, 'performance').observe(resolutionTime);
  }

  if (action === 'resolve' || action === 'dismiss') {
    activeAlertsBySeverity.labels(severity, 'performance').dec();
  }
}

/**
 * Update fund variance score
 */
export function updateFundVarianceScore(
  fundId: string,
  baselineId: string,
  score: number
): void {
  fundVarianceScores.labels(fundId, baselineId).set(score);
}

/**
 * Record threshold breach
 */
export function recordThresholdBreach(
  fundId: string,
  metricName: string,
  thresholdType: string
): void {
  thresholdBreaches.labels(fundId, metricName, thresholdType).inc();
}

/**
 * Record API request metrics
 */
export function recordVarianceApiRequest(
  endpoint: string,
  method: string,
  statusCode: string,
  duration: number
): void {
  varianceApiRequests.labels(endpoint, method, statusCode).inc();
  varianceApiDuration.labels(endpoint, method).observe(duration);
}

/**
 * Update data quality score
 */
export function updateDataQualityScore(
  fundId: string,
  dataSource: string,
  score: number
): void {
  dataQualityScores.labels(fundId, dataSource).set(score);
}

/**
 * Record data validation error
 */
export function recordDataValidationError(
  fundId: string,
  errorType: string,
  dataSource: string
): void {
  dataValidationErrors.labels(fundId, errorType, dataSource).inc();
}

/**
 * Update system health score
 */
export function updateSystemHealthScore(score: number): void {
  systemHealthScore.set(score);
}

/**
 * Record system error
 */
export function recordSystemError(component: string, errorType: string): void {
  systemErrors.labels(component, errorType).inc();
}

/**
 * Start variance calculation tracking
 */
export function startVarianceCalculation(calculationType: string): () => void {
  activeVarianceCalculations.labels(calculationType).inc();
  const startTime = Date.now();

  return () => {
    activeVarianceCalculations.labels(calculationType).dec();
    const duration = (Date.now() - startTime) / 1000;
    varianceCalculationDuration.labels('all', calculationType).observe(duration);
  };
}

/**
 * Middleware factory for recording API metrics
 */
export function createVarianceMetricsMiddleware() {
  return (req: any, res: any, next: any) => {
    // Only track variance-related endpoints
    if (!req.path.includes('/variance') && !req.path.includes('/baseline') && !req.path.includes('/alert')) {
      return next();
    }

    const startTime = Date.now();
    const endpoint = req.route?.path || req.path;
    const method = req.method;

    res.on('finish', () => {
      const duration = (Date.now() - startTime) / 1000;
      const statusCode = res.statusCode.toString();

      recordVarianceApiRequest(endpoint, method, statusCode, duration);
    });

    next();
  };
}

/**
 * Initialize variance tracking metrics collection
 */
export function initializeVarianceMetrics(): void {
  // Set initial system health score
  updateSystemHealthScore(1.0);

  // Initialize gauges with zero values
  const severities = ['info', 'warning', 'critical', 'urgent'];
  const categories = ['performance', 'risk', 'operational', 'compliance'];

  severities.forEach(severity => {
    categories.forEach(category => {
      activeAlertsBySeverity.labels(severity, category).set(0);
    });
  });

  console.log('[Metrics] Variance tracking metrics initialized');
}

/**
 * Get current variance tracking metrics summary
 */
export function getVarianceMetricsSummary(): any {
  return {
    reportsGenerated: varianceReportsGenerated.get(),
    activeCalculations: activeVarianceCalculations.get(),
    activeBaselines: totalActiveBaselines.get(),
    alertsGenerated: alertsGenerated.get(),
    systemHealth: systemHealthScore.get(),
    timestamp: new Date().toISOString()
  };
}