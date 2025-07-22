import { register, Counter, Histogram, Gauge } from 'prom-client';
import { logger } from './logger';

// Initialize metrics
const engineLatency = new Histogram({
  name: 'engine_calculation_duration_seconds',
  help: 'Duration of engine calculations in seconds',
  labelNames: ['engine', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
});

const engineErrors = new Counter({
  name: 'engine_calculation_errors_total',
  help: 'Total number of engine calculation errors',
  labelNames: ['engine', 'error_type'],
});

const queueDepth = new Gauge({
  name: 'queue_depth',
  help: 'Current depth of job queues',
  labelNames: ['queue_name', 'job_type'],
});

const snapshotWrites = new Counter({
  name: 'snapshot_writes_total',
  help: 'Total number of snapshot writes',
  labelNames: ['type', 'status'],
});

// Register all metrics
register.registerMetric(engineLatency);
register.registerMetric(engineErrors);
register.registerMetric(queueDepth);
register.registerMetric(snapshotWrites);

// Metrics wrapper function
export async function withMetrics<T>(
  engineName: string,
  fn: () => Promise<T>
): Promise<T> {
  const timer = engineLatency.startTimer({ engine: engineName });
  
  try {
    const result = await fn();
    timer({ status: 'success' });
    return result;
  } catch (error) {
    timer({ status: 'error' });
    engineErrors.inc({ 
      engine: engineName, 
      error_type: error instanceof Error ? error.constructor.name : 'unknown' 
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