import { Router } from 'express';
import type { Request, Response } from 'express';
import client from 'prom-client';
import { logger } from '../lib/logger.js';

// Create metrics router
export const metricsRouter = Router();

interface CircuitBreakerStats {
  requestCount?: number;
  failureCount?: number;
}

interface BreakerSnapshot {
  state: string;
  stats?: CircuitBreakerStats;
}

function isCircuitBreakerStats(value: unknown): value is CircuitBreakerStats {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const stats = value as Record<string, unknown>;
  return (
    (stats['requestCount'] === undefined || typeof stats['requestCount'] === 'number') &&
    (stats['failureCount'] === undefined || typeof stats['failureCount'] === 'number')
  );
}

function isBreakerSnapshot(value: unknown): value is BreakerSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const snapshot = value as Record<string, unknown>;
  return (
    typeof snapshot['state'] === 'string' &&
    (snapshot['stats'] === undefined || isCircuitBreakerStats(snapshot['stats']))
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

// Collect default process metrics (only call this once per process)
let defaultMetricsCollected = false;

export function setupMetrics() {
  if (!defaultMetricsCollected) {
    client.collectDefaultMetrics({
      prefix: 'updog_',
      labels: {
        app: 'updog',
        version: process.env['npm_package_version'] || '1.0.0',
      },
    });
    defaultMetricsCollected = true;
  }
}

// Circuit breaker metrics
export const circuitBreakerMetrics = {
  state: new client.Gauge({
    name: 'updog_circuit_breaker_state',
    help: 'Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)',
    labelNames: ['breaker_name', 'state'],
  }),

  requests_total: new client.Counter({
    name: 'updog_circuit_breaker_requests_total',
    help: 'Total number of requests through circuit breaker',
    labelNames: ['breaker_name', 'result'],
  }),

  failures_total: new client.Counter({
    name: 'updog_circuit_breaker_failures_total',
    help: 'Total number of failures in circuit breaker',
    labelNames: ['breaker_name', 'error_type'],
  }),

  request_duration: new client.Histogram({
    name: 'updog_circuit_breaker_request_duration_seconds',
    help: 'Request duration through circuit breaker',
    labelNames: ['breaker_name', 'result'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  }),

  half_open_requests: new client.Gauge({
    name: 'updog_circuit_breaker_half_open_requests',
    help: 'Number of requests in half-open state',
    labelNames: ['breaker_name'],
  }),
};

// Update circuit breaker metrics
export function updateCircuitBreakerMetrics(
  breakerName: string,
  state: string,
  stats: CircuitBreakerStats
) {
  // Map state to numeric value
  const stateValue = state === 'CLOSED' ? 0 : state === 'HALF_OPEN' ? 1 : 2;

  circuitBreakerMetrics.state['set']({ breaker_name: breakerName, state }, stateValue);

  if (typeof stats.requestCount === 'number') {
    circuitBreakerMetrics.requests_total.inc(
      { breaker_name: breakerName, result: 'total' },
      stats.requestCount
    );
  }

  if (typeof stats.failureCount === 'number') {
    circuitBreakerMetrics.failures_total.inc(
      { breaker_name: breakerName, error_type: 'total' },
      stats.failureCount
    );
  }
}

// Metrics endpoint
metricsRouter['get']('/metrics', async (_req: Request, res: Response) => {
  try {
    // Update circuit breaker metrics from registry
    const { breakerRegistry } = await import('../infra/circuit-breaker/breaker-registry');
    const allBreakers = breakerRegistry.getAll();

    for (const [name, breakerInfo] of Object.entries(allBreakers)) {
      if (isBreakerSnapshot(breakerInfo)) {
        updateCircuitBreakerMetrics(name, breakerInfo.state, breakerInfo.stats ?? {});
      }
    }

    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (error: unknown) {
    logger.error({ error: getErrorMessage(error) }, 'Failed to generate metrics');
    res.status(500).send('Internal Server Error');
  }
});

// Health metrics endpoint (lightweight)
metricsRouter['get']('/metrics/health', async (_req: Request, res: Response) => {
  try {
    const { breakerRegistry } = await import('../infra/circuit-breaker/breaker-registry');

    res.json({
      healthy: breakerRegistry.isHealthy(),
      degraded: breakerRegistry.getDegraded(),
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(500).json({ error: 'Failed to get health metrics' });
  }
});

export default metricsRouter;
