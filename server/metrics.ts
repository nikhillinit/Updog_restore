/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import promClient from 'prom-client';
import { Router } from 'express';
import { getEnv } from './env';

// Enable collection of default metrics
promClient.collectDefaultMetrics({
  prefix: 'povc_fund_',
});

// Custom metrics for the application
export const httpRequestDuration = new promClient.Histogram({
  name: 'povc_fund_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const httpRequestTotal = new promClient.Counter({
  name: 'povc_fund_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const databaseConnections = new promClient.Gauge({
  name: 'povc_fund_database_connections',
  help: 'Number of active database connections',
});

export const activeUsers = new promClient.Gauge({
  name: 'povc_fund_active_users',
  help: 'Number of active users',
});

export const fundCalculations = new promClient.Counter({
  name: 'povc_fund_calculations_total',
  help: 'Total number of fund calculations performed',
  labelNames: ['type'], // 'reserve', 'pacing', 'cohort'
});

export const calculationDuration = new promClient.Histogram({
  name: 'povc_fund_calculation_duration_seconds',
  help: 'Duration of fund calculations in seconds',
  labelNames: ['type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
});

export const redisConnections = new promClient.Gauge({
  name: 'povc_fund_redis_connections',
  help: 'Number of Redis connections',
});

export const queueJobs = new promClient.Gauge({
  name: 'povc_fund_queue_jobs',
  help: 'Number of jobs in queue',
  labelNames: ['queue', 'status'], // queue: 'reserve', 'pacing', 'cohort'; status: 'waiting', 'active', 'completed', 'failed'
});

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
export const healthStatus = new promClient.Gauge({
  name: 'povc_fund_health_status',
  help: 'Health status of the application (1 = healthy, 0 = unhealthy)',
  labelNames: ['component'], // 'database', 'redis', 'overall'
});

// Business logic metrics recording
export function recordBusinessMetric(
  operation: string,
  status: 'success' | 'failure' | 'cache_hit' | 'queued',
  duration?: number
) {
  // Record generic business operation metrics
  if (!businessOperations.has(operation)) {
    businessOperations.set(operation, {
      counter: new promClient.Counter({
        name: `povc_fund_${operation}_total`,
        help: `Total number of ${operation} operations`,
        labelNames: ['status'],
      }),
      histogram: duration !== undefined ? new promClient.Histogram({
        name: `povc_fund_${operation}_duration_milliseconds`,
        help: `Duration of ${operation} operations in milliseconds`,
        labelNames: ['status'],
        buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
      }) : null,
    });
  }
  
  const metric = businessOperations.get(operation)!;
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
export const natsBridgeConnections = new promClient.Gauge({
  name: 'povc_fund_nats_bridge_connections',
  help: 'Number of active NATS WebSocket connections',
});

export const natsBridgeMessages = new promClient.Counter({
  name: 'povc_fund_nats_bridge_messages_total',
  help: 'Total NATS bridge messages',
  labelNames: ['direction', 'type'], // direction: in/out, type: event/subscribe/etc
});

// Async migration metrics
export const asyncRepl = new promClient.Counter({
  name: 'async_foreach_replacements_total',
  help: 'Number of legacy forEach conversions to async patterns',
  labelNames: ['file'], // track which file was migrated
});

// Fund calculation specific metrics
export const calcDurationMs = new promClient.Histogram({
  name: 'fund_calc_duration_ms',
  help: 'Duration of fund calculations in ms',
  buckets: [50, 100, 200, 500, 1000, 2000, 5000, 10000]
});

export const httpRequests = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['route', 'method', 'code'] as const
});

// Export registry for metrics endpoint
export const register = promClient.register;

// Create metrics router
export const metricsRouter = Router();
metricsRouter.get('/metrics', async (_req: any, res: any) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

