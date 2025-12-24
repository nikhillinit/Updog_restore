/**
 * Performance Dashboard API Metrics
 *
 * Prometheus metrics for monitoring the performance API endpoints:
 * - Request duration histograms
 * - Cache hit/miss counters
 * - Calculation time histograms
 * - Error counters
 *
 * @module server/observability/performance-metrics
 */

import * as client from 'prom-client';

// ============================================================================
// REQUEST METRICS
// ============================================================================

/**
 * Performance API request duration histogram
 * Tracks latency for each endpoint
 */
export const performanceRequestDuration = new client.Histogram({
  name: 'performance_api_request_duration_ms',
  help: 'Performance API request duration in milliseconds',
  labelNames: ['endpoint', 'method', 'status', 'fund_id'],
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
});

/**
 * Performance API request counter
 * Counts total requests by endpoint
 */
export const performanceRequestCount = new client.Counter({
  name: 'performance_api_requests_total',
  help: 'Total Performance API requests',
  labelNames: ['endpoint', 'method', 'status'],
});

// ============================================================================
// CACHE METRICS
// ============================================================================

/**
 * Performance cache hit counter
 */
export const performanceCacheHits = new client.Counter({
  name: 'performance_cache_hits_total',
  help: 'Total Performance API cache hits',
  labelNames: ['endpoint'],
});

/**
 * Performance cache miss counter
 */
export const performanceCacheMisses = new client.Counter({
  name: 'performance_cache_misses_total',
  help: 'Total Performance API cache misses',
  labelNames: ['endpoint'],
});

// ============================================================================
// CALCULATION METRICS
// ============================================================================

/**
 * Performance calculation duration histogram
 * Tracks time spent in calculation logic
 */
export const performanceCalculationDuration = new client.Histogram({
  name: 'performance_calculation_duration_ms',
  help: 'Performance calculation duration in milliseconds',
  labelNames: ['calculation_type', 'granularity'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000],
});

/**
 * Data points returned gauge
 * Tracks how much data is being returned
 */
export const performanceDataPoints = new client.Histogram({
  name: 'performance_data_points_returned',
  help: 'Number of data points returned in performance responses',
  labelNames: ['endpoint'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
});

// ============================================================================
// ERROR METRICS
// ============================================================================

/**
 * Performance API error counter
 */
export const performanceErrors = new client.Counter({
  name: 'performance_api_errors_total',
  help: 'Total Performance API errors',
  labelNames: ['endpoint', 'error_type'],
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Record a performance API request
 */
export function recordPerformanceRequest(
  endpoint: string,
  method: string,
  status: number,
  durationMs: number,
  fundId?: number
): void {
  performanceRequestDuration.observe(
    {
      endpoint,
      method,
      status: String(status),
      fund_id: fundId ? String(fundId) : 'unknown',
    },
    durationMs
  );
  performanceRequestCount.inc({ endpoint, method, status: String(status) });
}

/**
 * Record a cache hit
 */
export function recordCacheHit(endpoint: string): void {
  performanceCacheHits.inc({ endpoint });
}

/**
 * Record a cache miss
 */
export function recordCacheMiss(endpoint: string): void {
  performanceCacheMisses.inc({ endpoint });
}

/**
 * Record calculation duration
 */
export function recordCalculation(
  calculationType: 'timeseries' | 'breakdown' | 'comparison',
  granularity: string,
  durationMs: number
): void {
  performanceCalculationDuration.observe({ calculation_type: calculationType, granularity }, durationMs);
}

/**
 * Record data points returned
 */
export function recordDataPoints(endpoint: string, count: number): void {
  performanceDataPoints.observe({ endpoint }, count);
}

/**
 * Record an error
 */
export function recordError(endpoint: string, errorType: string): void {
  performanceErrors.inc({ endpoint, error_type: errorType });
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
