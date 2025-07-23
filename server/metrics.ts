import promClient from 'prom-client';
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

// Export registry for metrics endpoint
export const register = promClient.register;