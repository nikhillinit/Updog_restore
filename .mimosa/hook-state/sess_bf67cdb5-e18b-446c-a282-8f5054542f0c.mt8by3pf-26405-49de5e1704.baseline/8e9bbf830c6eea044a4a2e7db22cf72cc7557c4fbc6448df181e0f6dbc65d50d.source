import express from 'express';
import type { Server } from 'node:http';
import { logger } from '../lib/logger';
import { getMetrics } from '../lib/metrics';
import { getReleaseIdentity } from '../server/version';
import type { Worker } from 'bullmq';
import { type WorkerDeploymentIdentity } from './worker-deployment-identity';

export interface WorkerHealthStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'paused';
  isRunning: boolean;
  jobsProcessed: number;
  lastJobTime?: Date;
  error?: string;
  exhaustedOutboxCount?: number;
}

interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  commit: string;
  environment: string;
  workerType?: string;
  deploymentId?: string;
  workers: WorkerHealthStatus[];
  metrics: {
    totalJobsProcessed: number;
    totalErrors: number;
  };
}

type HealthIdentity = WorkerDeploymentIdentity | null | undefined;

export interface WorkerHealthServerRuntime {
  app: express.Application;
  server: Server;
  close: () => Promise<void>;
}

// Track worker instances
const registeredWorkers: Map<string, Worker> = new Map();
const workerHealthDetails: Map<string, () => Promise<Record<string, number>>> = new Map();
const workerStats: Map<string, { processed: number; errors: number; lastJob?: Date }> = new Map();

/**
 * Register a worker for health monitoring
 */
export function registerWorker(
  name: string,
  worker: Worker,
  detailsProvider?: () => Promise<Record<string, number>>
) {
  registeredWorkers.set(name, worker);
  workerStats.set(name, { processed: 0, errors: 0 });
  if (detailsProvider) workerHealthDetails.set(name, detailsProvider);
  else workerHealthDetails.delete(name);

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
 * Remove a worker only when it is still the registered instance for this name.
 * This prevents delayed shutdown from deleting a newer replacement worker.
 */
export function unregisterWorker(name: string, worker: Worker): boolean {
  if (registeredWorkers.get(name) !== worker) {
    return false;
  }

  registeredWorkers.delete(name);
  workerHealthDetails.delete(name);
  workerStats.delete(name);
  return true;
}

/**
 * Check health of a single worker
 */
async function checkWorkerHealth(name: string, worker: Worker): Promise<WorkerHealthStatus> {
  const stats = workerStats.get(name) || { processed: 0, errors: 0 };

  try {
    const isRunning = worker.isRunning();
    const isPaused = worker.isPaused();
    const details = workerHealthDetails.get(name) ? await workerHealthDetails.get(name)!() : {};

    return {
      ...details,
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
function legacyHealthAllowed(): boolean {
  const environment = process.env['NODE_ENV']?.trim();
  return environment === 'development' || environment === 'test';
}

async function performHealthCheck(
  identity: HealthIdentity,
  legacyAllowed: boolean,
  releaseIdentity: ReturnType<typeof getReleaseIdentity>
): Promise<HealthCheckResponse> {
  const workerHealthChecks = await Promise.all(
    Array.from(registeredWorkers.entries()).map(([name, worker]) => checkWorkerHealth(name, worker))
  );

  const totalJobsProcessed = Array.from(workerStats.values()).reduce(
    (sum, stats) => sum + stats.processed,
    0
  );
  const totalErrors = Array.from(workerStats.values()).reduce(
    (sum, stats) => sum + stats.errors,
    0
  );

  const isHealthy = identity
    ? workerHealthChecks.length === 1 &&
      workerHealthChecks[0]?.name === identity.workerType &&
      workerHealthChecks[0]?.status === 'healthy'
    : identity === undefined &&
      legacyAllowed &&
      workerHealthChecks.length > 0 &&
      workerHealthChecks.every((worker) => worker.status === 'healthy');

  return {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    ...(identity ?? releaseIdentity),
    ...(identity ? { workerType: identity.workerType, deploymentId: identity.deploymentId } : {}),
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
export function createWorkerHealthApp(identity?: HealthIdentity): express.Application {
  const app = express();
  const legacyAllowed = identity === undefined && legacyHealthAllowed();
  const releaseIdentity = identity ?? getReleaseIdentity();

  // Health check endpoint
  app.get('/health', async (req, res) => {
    try {
      const health = await performHealthCheck(identity, legacyAllowed, releaseIdentity);
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
      const health = await performHealthCheck(identity, legacyAllowed, releaseIdentity);
      const isReady = health.status === 'healthy';

      if (isReady) {
        res.status(200).json({
          status: 'ready',
          timestamp: new Date().toISOString(),
          ...(identity
            ? {
                workerType: identity.workerType,
                commit: identity.commit,
                deploymentId: identity.deploymentId,
              }
            : {}),
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
      const metricsText = await getMetrics();
      res.type('text/plain');
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

  return app;
}

/**
 * Create and listen on the worker health port.
 *
 * The app factory above is intentionally separate so health response tests do
 * not open a listener or imply queue consumption.
 */
export async function createHealthServer(
  port: number = 9000,
  identity?: HealthIdentity
): Promise<WorkerHealthServerRuntime> {
  const app = createWorkerHealthApp(identity);
  const server = app.listen(port);

  await new Promise<void>((resolve, reject) => {
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    server.once('listening', onListening);
    server.once('error', onError);
  });

  logger.info(`Worker health server listening on port ${port}`);
  logger.info(`  Health: http://localhost:${port}/health`);
  logger.info(`  Liveness: http://localhost:${port}/live`);
  logger.info(`  Readiness: http://localhost:${port}/ready`);
  logger.info(`  Metrics: http://localhost:${port}/metrics`);
  logger.info(`  Stats: http://localhost:${port}/stats`);

  let closePromise: Promise<void> | undefined;
  return {
    app,
    server,
    close: () => {
      closePromise ??= new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      return closePromise;
    },
  };
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

export function resetWorkerHealthRegistrations(): void {
  registeredWorkers.clear();
  workerHealthDetails.clear();
  workerStats.clear();
}
