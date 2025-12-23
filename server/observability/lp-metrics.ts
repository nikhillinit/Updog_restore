/**
 * LP Reporting Dashboard API Metrics
 *
 * Prometheus metrics for monitoring the LP reporting API endpoints:
 * - Request duration histograms
 * - Cache hit/miss counters
 * - Report generation metrics
 * - Business metrics (active LPs, capital activity)
 * - Error counters
 *
 * @module server/observability/lp-metrics
 */

import * as client from 'prom-client';

// ============================================================================
// REQUEST METRICS
// ============================================================================

/**
 * LP API request duration histogram
 * Tracks latency for each endpoint
 */
export const lpRequestDuration = new client.Histogram({
  name: 'lp_api_request_duration_ms',
  help: 'LP API request duration in milliseconds',
  labelNames: ['endpoint', 'method', 'status', 'lp_id'],
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000],
});

/**
 * LP API request counter
 * Counts total requests by endpoint
 */
export const lpRequestCount = new client.Counter({
  name: 'lp_api_requests_total',
  help: 'Total LP API requests',
  labelNames: ['endpoint', 'method', 'status'],
});

// ============================================================================
// CACHE METRICS
// ============================================================================

/**
 * LP API cache hit counter
 */
export const lpCacheHits = new client.Counter({
  name: 'lp_cache_hits_total',
  help: 'Total LP API cache hits',
  labelNames: ['endpoint'],
});

/**
 * LP API cache miss counter
 */
export const lpCacheMisses = new client.Counter({
  name: 'lp_cache_misses_total',
  help: 'Total LP API cache misses',
  labelNames: ['endpoint'],
});

// ============================================================================
// REPORT GENERATION METRICS
// ============================================================================

/**
 * Report generation duration histogram
 * Tracks time spent generating reports
 */
export const lpReportGenerationDuration = new client.Histogram({
  name: 'lp_report_generation_duration_ms',
  help: 'LP report generation duration in milliseconds',
  labelNames: ['report_type', 'format'],
  buckets: [100, 500, 1000, 2000, 5000, 10000, 20000, 30000, 60000, 120000],
});

/**
 * Reports generated counter
 */
export const lpReportsGenerated = new client.Counter({
  name: 'lp_reports_generated_total',
  help: 'Total LP reports successfully generated',
  labelNames: ['report_type', 'format'],
});

/**
 * Reports failed counter
 */
export const lpReportsFailed = new client.Counter({
  name: 'lp_reports_failed_total',
  help: 'Total LP report generation failures',
  labelNames: ['report_type', 'error_type'],
});

// ============================================================================
// BUSINESS METRICS
// ============================================================================

/**
 * Active LPs gauge
 * Current number of active LPs in the system
 */
export const lpActiveLPsGauge = new client.Gauge({
  name: 'lp_active_lps_gauge',
  help: 'Current number of active LPs',
});

/**
 * Capital activity events counter
 * Tracks capital calls, distributions, and other capital events
 */
export const lpCapitalActivityEvents = new client.Counter({
  name: 'lp_capital_activity_events_total',
  help: 'Total capital activity events processed',
  labelNames: ['activity_type', 'fund_id'],
});

/**
 * Data points returned histogram
 * Tracks volume of data returned in API responses
 */
export const lpDataPoints = new client.Histogram({
  name: 'lp_data_points_returned',
  help: 'Number of data points returned in LP API responses',
  labelNames: ['endpoint'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000],
});

// ============================================================================
// ERROR METRICS
// ============================================================================

/**
 * LP API error counter
 */
export const lpErrors = new client.Counter({
  name: 'lp_api_errors_total',
  help: 'Total LP API errors',
  labelNames: ['endpoint', 'error_type', 'status'],
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Record an LP API request
 */
export function recordLPRequest(
  endpoint: string,
  method: string,
  status: number,
  durationMs: number,
  lpId?: number
): void {
  lpRequestDuration.observe(
    {
      endpoint,
      method,
      status: String(status),
      lp_id: lpId ? String(lpId) : 'unknown',
    },
    durationMs
  );
  lpRequestCount.inc({ endpoint, method, status: String(status) });
}

/**
 * Record a cache hit
 */
export function recordCacheHit(endpoint: string): void {
  lpCacheHits.inc({ endpoint });
}

/**
 * Record a cache miss
 */
export function recordCacheMiss(endpoint: string): void {
  lpCacheMisses.inc({ endpoint });
}

/**
 * Record report generation
 */
export function recordReportGeneration(
  reportType: string,
  format: string,
  durationMs: number,
  success: boolean,
  errorType?: string
): void {
  if (success) {
    lpReportsGenerated.inc({ report_type: reportType, format });
    lpReportGenerationDuration.observe({ report_type: reportType, format }, durationMs);
  } else {
    lpReportsFailed.inc({
      report_type: reportType,
      error_type: errorType || 'unknown',
    });
  }
}

/**
 * Record data points returned
 */
export function recordDataPoints(endpoint: string, count: number): void {
  lpDataPoints.observe({ endpoint }, count);
}

/**
 * Record an error
 */
export function recordError(endpoint: string, errorType: string, status: number): void {
  lpErrors.inc({ endpoint, error_type: errorType, status: String(status) });
}

/**
 * Update active LPs gauge
 */
export function updateActiveLPs(count: number): void {
  lpActiveLPsGauge.set(count);
}

/**
 * Record capital activity event
 */
export function recordCapitalActivity(activityType: string, fundId: number): void {
  lpCapitalActivityEvents.inc({
    activity_type: activityType,
    fund_id: String(fundId),
  });
}

/**
 * Timer utility for measuring durations
 */
export function startTimer(): () => number {
  const start = process.hrtime.bigint();
  return () => {
    const end = process.hrtime.bigint();
    return Number(end - start) / 1_000_000; // Convert nanoseconds to milliseconds
  };
}
