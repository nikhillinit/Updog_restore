/* eslint-disable @typescript-eslint/no-explicit-any */ // Metrics collection types
 
 
 
 
import promClient from 'prom-client';
import { Router } from 'express';

// Use a single registry to avoid duplicate metric registration during test/hot reload cycles.
export const register = promClient.register;

function getMetric<T>(name: string): T | undefined {
  return register.getSingleMetric(name) as T | undefined;
}

function getOrCreateCounter(
  name: string,
  help: string,
  labelNames?: string[]
): promClient.Counter<string> {
  const existing = getMetric<promClient.Counter<string>>(name);
  if (existing) return existing;
  const config: { name: string; help: string; labelNames?: string[] } = { name, help };
  if (labelNames) {
    config.labelNames = labelNames;
  }
  return new promClient.Counter(config);
}

function getOrCreateGauge(
  name: string,
  help: string,
  labelNames?: string[]
): promClient.Gauge<string> {
  const existing = getMetric<promClient.Gauge<string>>(name);
  if (existing) return existing;
  const config: { name: string; help: string; labelNames?: string[] } = { name, help };
  if (labelNames) {
    config.labelNames = labelNames;
  }
  return new promClient.Gauge(config);
}

function getOrCreateHistogram(
  name: string,
  help: string,
  labelNames?: string[],
  buckets?: number[]
): promClient.Histogram<string> {
  const existing = getMetric<promClient.Histogram<string>>(name);
  if (existing) return existing;
  const config: {
    name: string;
    help: string;
    labelNames?: string[];
    buckets?: number[];
  } = { name, help };
  if (labelNames) {
    config.labelNames = labelNames;
  }
  if (buckets) {
    config.buckets = buckets;
  }
  return new promClient.Histogram(config);
}

// Enable collection of default metrics once per process/registry.
const defaultMetricSentinel = 'povc_fund_process_cpu_user_seconds_total';
if (!register.getSingleMetric(defaultMetricSentinel)) {
  promClient.collectDefaultMetrics({
    prefix: 'povc_fund_',
  });
}

// Custom metrics for the application
export const httpRequestDuration = getOrCreateHistogram(
  'povc_fund_http_request_duration_seconds',
  'Duration of HTTP requests in seconds',
  ['method', 'route', 'status_code'],
  [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
);

export const httpRequestTotal = getOrCreateCounter(
  'povc_fund_http_requests_total',
  'Total number of HTTP requests',
  ['method', 'route', 'status_code']
);

export const databaseConnections = getOrCreateGauge(
  'povc_fund_database_connections',
  'Number of active database connections'
);

export const activeUsers = getOrCreateGauge('povc_fund_active_users', 'Number of active users');

export const fundCalculations = getOrCreateCounter(
  'povc_fund_calculations_total',
  'Total number of fund calculations performed',
  ['type'] // 'reserve', 'pacing', 'cohort'
);

export const calculationDuration = getOrCreateHistogram(
  'povc_fund_calculation_duration_seconds',
  'Duration of fund calculations in seconds',
  ['type'],
  [0.1, 0.5, 1, 2, 5, 10, 30, 60]
);

export const redisConnections = getOrCreateGauge(
  'povc_fund_redis_connections',
  'Number of Redis connections'
);

export const queueJobs = getOrCreateGauge(
  'povc_fund_queue_jobs',
  'Number of jobs in queue',
  ['queue', 'status'] // queue: 'reserve', 'pacing', 'cohort'; status: 'waiting', 'active', 'completed', 'failed'
);

// Helper function to record HTTP metrics
export function recordHttpMetrics(
  method: string,
  route: string,
  statusCode: number,
  duration: number
) {
  const labels = { method, route, status_code: statusCode.toString() };
  httpRequestTotal.inc(labels);
  httpRequestDuration.observe(labels, duration);
}

// Health check metrics
export const healthStatus = getOrCreateGauge(
  'povc_fund_health_status',
  'Health status of the application (1 = healthy, 0 = unhealthy)',
  ['component'] // 'database', 'redis', 'overall'
);

// Business logic metrics recording
export function recordBusinessMetric(
  operation: string,
  status: 'success' | 'failure' | 'cache_hit' | 'queued',
  duration?: number
) {
  // Record generic business operation metrics
  if (!businessOperations.has(operation)) {
    businessOperations['set'](operation, {
      counter: getOrCreateCounter(
        `povc_fund_${operation}_total`,
        `Total number of ${operation} operations`,
        ['status']
      ),
      histogram:
        duration !== undefined
          ? getOrCreateHistogram(
              `povc_fund_${operation}_duration_milliseconds`,
              `Duration of ${operation} operations in milliseconds`,
              ['status'],
              [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
            )
          : null,
    });
  }
  
  const metric = businessOperations['get'](operation)!;
  metric.counter.inc({ status });
  
  if (duration !== undefined && metric.histogram) {
    metric.histogram.observe({ status }, duration);
  }
}

// Cache for dynamically created metrics
const businessOperations = new Map<string, {
  counter: promClient.Counter<string>;
  histogram: promClient.Histogram<string> | null;
}>();

// NATS bridge metrics
export const natsBridgeConnections = getOrCreateGauge(
  'povc_fund_nats_bridge_connections',
  'Number of active NATS WebSocket connections'
);

export const natsBridgeMessages = getOrCreateCounter(
  'povc_fund_nats_bridge_messages_total',
  'Total NATS bridge messages',
  ['direction', 'type'] // direction: in/out, type: event/subscribe/etc
);

// Async migration metrics
export const asyncRepl = getOrCreateCounter(
  'async_foreach_replacements_total',
  'Number of legacy forEach conversions to async patterns',
  ['file'] // track which file was migrated
);

// Fund calculation specific metrics
export const calcDurationMs = getOrCreateHistogram(
  'fund_calc_duration_ms',
  'Duration of fund calculations in ms',
  undefined,
  [50, 100, 200, 500, 1000, 2000, 5000, 10000]
);

export const httpRequests = getOrCreateCounter(
  'http_requests_total',
  'Total HTTP requests',
  ['route', 'method', 'code']
);

// Create metrics router
export const metricsRouter = Router();
metricsRouter['get']('/metrics', async (_req: any, res: any) => {
  res['set']('Content-Type', register.contentType);
  res["end"](await register.metrics());
});
