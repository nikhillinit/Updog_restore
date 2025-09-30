import express from 'express';
import { logger } from '../lib/logger';
import { metrics } from '../lib/metrics';
import { Worker } from 'bullmq';

interface WorkerHealthStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'paused';
  isRunning: boolean;
  jobsProcessed: number;
  lastJobTime?: Date;
  error?: string;
}

interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  workers: WorkerHealthStatus[];
  metrics: {
    totalJobsProcessed: number;
    totalErrors: number;
  };
}

// Track worker instances
const registeredWorkers: Map<string, Worker> = new Map();
const workerStats: Map<string, { processed: number; errors: number; lastJob?: Date }> = new Map();

/**
 * Register a worker for health monitoring
 */
export function registerWorker(name: string, worker: Worker) {
  registeredWorkers.set(name, worker);
  workerStats.set(name, { processed: 0, errors: 0 });

  // Track job completion
  worker.on('completed', () => {
    const stats = workerStats.get(name);
    if (stats) {
      stats.processed++;
      stats.lastJob = new Date();
    }
  });

  // Track job failures
  worker.on('failed', () => {
    const stats = workerStats.get(name);
    if (stats) {
      stats.errors++;
    }
  });

  logger.info(`Worker registered for health monitoring: ${name}`);
}

/**
 * Check health of a single worker
 */
async function checkWorkerHealth(name: string, worker: Worker): Promise<WorkerHealthStatus> {
  const stats = workerStats.get(name) || { processed: 0, errors: 0 };

  try {
    const isRunning = worker.isRunning();
    const isPaused = worker.isPaused();

    return {
      name,
      status: isRunning && !isPaused ? 'healthy' : isPaused ? 'paused' : 'unhealthy',
      isRunning,
      jobsProcessed: stats.processed,
      lastJobTime: stats.lastJob,
    };
  } catch (error) {
    return {
      name,
      status: 'unhealthy',
      isRunning: false,
      jobsProcessed: stats.processed,
      error: (error as Error).message,
    };
  }
}

/**
 * Perform complete health check of all workers
 */
async function performHealthCheck(): Promise<HealthCheckResponse> {
  const workerHealthChecks = await Promise.all(
    Array.from(registeredWorkers.entries()).map(([name, worker]) =>
      checkWorkerHealth(name, worker)
    )
  );

  const totalJobsProcessed = Array.from(workerStats.values()).reduce(
    (sum, stats) => sum + stats.processed,
    0
  );
  const totalErrors = Array.from(workerStats.values()).reduce(
    (sum, stats) => sum + stats.errors,
    0
  );

  const isHealthy = workerHealthChecks.every((w) => w.status === 'healthy');

  return {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    workers: workerHealthChecks,
    metrics: {
      totalJobsProcessed,
      totalErrors,
    },
  };
}

/**
 * Create health check HTTP server
 */
export function createHealthServer(port: number = 9000): express.Application {
  const app = express();

  // Health check endpoint
  app.get('/health', async (req, res) => {
    try {
      const health = await performHealthCheck();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      logger.error('Health check failed', error as Error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      });
    }
  });

  // Liveness check (simple)
  app.get('/live', (req, res) => {
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Readiness check
  app.get('/ready', async (req, res) => {
    try {
      const health = await performHealthCheck();
      const isReady = health.workers.every((w) => w.status !== 'unhealthy');

      if (isReady) {
        res.status(200).json({
          status: 'ready',
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(503).json({
          status: 'not_ready',
          timestamp: new Date().toISOString(),
          workers: health.workers.filter((w) => w.status === 'unhealthy'),
        });
      }
    } catch (error) {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      });
    }
  });

  // Metrics endpoint (Prometheus format)
  app.get('/metrics', async (req, res) => {
    try {
      const metricsText = await metrics.register.metrics();
      res.set('Content-Type', metrics.register.contentType);
      res.send(metricsText);
    } catch (error) {
      logger.error('Failed to export metrics', error as Error);
      res.status(500).json({ error: 'Failed to export metrics' });
    }
  });

  // Worker stats endpoint
  app.get('/stats', async (req, res) => {
    const stats = Array.from(workerStats.entries()).map(([name, stat]) => ({
      name,
      processed: stat.processed,
      errors: stat.errors,
      lastJob: stat.lastJob,
    }));

    res.json({
      timestamp: new Date().toISOString(),
      workers: stats,
    });
  });

  // Start server
  app.listen(port, () => {
    logger.info(`Worker health server listening on port ${port}`);
    logger.info(`  Health: http://localhost:${port}/health`);
    logger.info(`  Liveness: http://localhost:${port}/live`);
    logger.info(`  Readiness: http://localhost:${port}/ready`);
    logger.info(`  Metrics: http://localhost:${port}/metrics`);
    logger.info(`  Stats: http://localhost:${port}/stats`);
  });

  return app;
}

/**
 * Get worker statistics
 */
export function getWorkerStats(workerName: string) {
  return workerStats.get(workerName);
}

/**
 * Reset worker statistics
 */
export function resetWorkerStats(workerName?: string) {
  if (workerName) {
    workerStats.set(workerName, { processed: 0, errors: 0 });
  } else {
    workerStats.clear();
  }
}