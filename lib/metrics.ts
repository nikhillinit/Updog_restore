import { register, Counter, Histogram, Gauge } from 'prom-client';

function getMetric<T>(name: string): T | undefined {
  return register.getSingleMetric(name) as T | undefined;
}

function getOrCreateHistogram(
  name: string,
  help: string,
  labelNames: string[],
  buckets: number[]
): Histogram<string> {
  const existing = getMetric<Histogram<string>>(name);
  if (existing) return existing;
  return new Histogram({ name, help, labelNames, buckets });
}

function getOrCreateCounter(name: string, help: string, labelNames: string[]): Counter<string> {
  const existing = getMetric<Counter<string>>(name);
  if (existing) return existing;
  return new Counter({ name, help, labelNames });
}

function getOrCreateGauge(name: string, help: string, labelNames: string[]): Gauge<string> {
  const existing = getMetric<Gauge<string>>(name);
  if (existing) return existing;
  return new Gauge({ name, help, labelNames });
}

const engineLatency = getOrCreateHistogram(
  'engine_calculation_duration_seconds',
  'Duration of engine calculations in seconds',
  ['engine', 'status'],
  [0.1, 0.5, 1, 2, 5, 10, 30, 60]
);

const engineErrors = getOrCreateCounter(
  'engine_calculation_errors_total',
  'Total number of engine calculation errors',
  ['engine', 'error_type']
);

const queueDepth = getOrCreateGauge('queue_depth', 'Current depth of job queues', [
  'queue_name',
  'job_type',
]);

const snapshotWrites = getOrCreateCounter(
  'snapshot_writes_total',
  'Total number of snapshot writes',
  ['type', 'status']
);

// Metrics wrapper function
export async function withMetrics<T>(engineName: string, fn: () => Promise<T>): Promise<T> {
  const timer = engineLatency.startTimer({ engine: engineName });

  try {
    const result = await fn();
    timer({ status: 'success' });
    return result;
  } catch (error) {
    timer({ status: 'error' });
    engineErrors.inc({
      engine: engineName,
      error_type: error instanceof Error ? error.constructor.name : 'unknown',
    });
    throw error;
  }
}

// Export metrics for Prometheus endpoint
export function getMetrics(): Promise<string> {
  return register.metrics();
}

// Export metric instances for direct use
export const metrics = {
  engineLatency,
  engineErrors,
  queueDepth,
  snapshotWrites,

  // Helper methods
  recordQueueDepth: (queueName: string, jobType: string, depth: number) => {
    queueDepth.set({ queue_name: queueName, job_type: jobType }, depth);
  },

  recordSnapshotWrite: (type: string, success: boolean) => {
    snapshotWrites.inc({ type, status: success ? 'success' : 'failure' });
  },
};
