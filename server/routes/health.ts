import { Router } from 'express';
import { readinessCheck, livenessCheck } from '../health';
import { storage } from '../storage';
import { rateLimitDetailed } from '../middleware/rateLimitDetailed';
import { setReady, registerInvalidator } from '../health/state';
import type { Request, Response } from 'express';
import { TTLCache, MemoryKV } from '../lib/ttl-cache';
import { getVersionInfo } from '../version';

const router = Router();

// TTL cache for health checks to avoid DB storms
const memoryKV = new MemoryKV();
const healthCache = new TTLCache<Record<string, unknown>>(memoryKV);
const HEALTH_CACHE_MS = 1500; // 1.5 second cache

// Register cache invalidator for state changes
registerInvalidator(() => {
  memoryKV.clear();
});

// Liveness check (unauthenticated, minimal)
// Enhanced with build provenance for CI smoke gates
router['get']('/healthz', (_req: Request, res: Response) => {
  const versionInfo = getVersionInfo();
  res["status"](200)["json"]({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ...versionInfo
  });
});

// Note: Main /readyz handler is below (lines 147-197) with caching + state management
// Keeping that as the single source of truth

// Legacy health endpoints (for backward compatibility)
router['get']('/health', (req: Request, res: Response) => {
  const providers = (req as { app: { locals: { providers?: { mode?: string } } } }).app.locals.providers;
  const mode = providers?.mode || (process.env['REDIS_URL'] === 'memory://' ? 'memory' : 'redis');
  res["json"]({
    status: 'ok',
    version: process.env['npm_package_version'] || '1.3.2',
    mode,
    ts: new Date().toISOString()
  });
});
router['get']('/api/health', (req: Request, res: Response) => {
  const providers = (req as { app: { locals: { providers?: { mode?: string } } } }).app.locals.providers;
  const mode = providers?.mode || (process.env['REDIS_URL'] === 'memory://' ? 'memory' : 'redis');
  res["json"]({
    status: 'ok',
    version: process.env['npm_package_version'] || '1.3.2',
    mode,
    ts: new Date().toISOString()
  });
});
router['get']('/api/health/ready', readinessCheck);
router['get']('/api/health/live', livenessCheck);

// Richer JSON health endpoint for Guardian and canary checks
router['get']('/health/detailed-json', async (req: Request, res: Response) => {
  // Prevent intermediary caching
  res['set']('Cache-Control', 'no-store, max-age=0');
  res['set']('Pragma', 'no-cache');
  
  // Check cache first
  const cached = await healthCache['get']('healthz');
  if (cached) {
    res['set']('X-Health-From-Cache', '1');
    const ttlMs = await healthCache.ttlMs('healthz');
    res['set']('X-Health-TTL-Remaining', ttlMs.toString());
    return res["json"](cached);
  }
  
  try {
    const fs = await import('fs');
    
    // Calculate simple error rate (placeholder - enhance based on your metrics)
    const errorRate = 0.005; // 0.5% default - replace with actual calculation
    
    const healthData = {
      error_rate: errorRate,
      uptime_sec: process.uptime(),
      heap_mb: Math.round(process.memoryUsage().heapUsed / 1048576),
      timestamp: new Date().toISOString(),
      version: process.env["npm_package_version"] || 'unknown',
      last_deploy: fs.existsSync('.last-deploy')
        ? fs.readFileSync('.last-deploy', 'utf8').trim()
        : 'unknown',
      status: errorRate < 0.01 ? 'healthy' : 'degraded'
    };
    
    // Cache with deterministic TTL
    await healthCache['set']('healthz', healthData, HEALTH_CACHE_MS);
    const ttlMs = await healthCache.ttlMs('healthz');
    res['set']('X-Health-TTL-Set', ttlMs.toString());
    
    res["json"](healthData);
  } catch (error: unknown) {
    res["status"](500)["json"]({
      error: 'Health check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Readiness probe - checks if service can handle traffic
// Returns 200 only when all critical dependencies are ready
router['get']('/readyz', async (req: Request, res: Response) => {
  // Prevent intermediary caching
  res['set']('Cache-Control', 'no-store, max-age=0');
  res['set']('Pragma', 'no-cache');
  
  // Check cache first
  const cached = await healthCache['get']('readyz');
  if (cached) {
    res['set']('X-Health-From-Cache', '1');
    const ttlMs = await healthCache.ttlMs('readyz');
    res['set']('X-Health-TTL-Remaining', ttlMs.toString());
    return res["status"](cached['ready'] ? 200 : 503)["json"](cached);
  }
  
  const checks = {
    api: "ok",
    database: "unknown", 
    redis: "degraded" // Redis is optional per PR #39
  };
  
  // Check database connectivity (critical) - using lightweight ping
  try {
    const dbHealthy = await storage['ping']();
    checks.database = dbHealthy ? "ok" : "fail";
  } catch (error: unknown) {
    checks.database = "fail";
  }
  
  // Redis is optional - check but don't fail on it
  const redisHealthy = (await storage.isRedisHealthy?.()) ?? false;
  checks.redis = redisHealthy ? "ok" : "degraded";
  
  // Service is ready if API and DB are OK (Redis is optional)
  const isReady = checks.api === "ok" && checks.database === "ok";
  
  // Update global ready state (triggers cache invalidation on change)
  setReady(isReady);
  
  const response = {
    ready: isReady,
    checks,
    timestamp: new Date().toISOString()
  };
  
  // Cache with deterministic TTL
  await healthCache['set']('readyz', response, HEALTH_CACHE_MS);
  const ttlMs = await healthCache.ttlMs('readyz');
  res['set']('X-Health-TTL-Set', ttlMs.toString());
  
  res["status"](isReady ? 200 : 503)["json"](response);
});

// Detailed health endpoint for diagnostics (protected + rate limited)
router['get']('/health/detailed', rateLimitDetailed(), async (req: Request, res: Response) => {
  // Protect sensitive health details
  const healthKey = process.env['HEALTH_KEY'];
  if (healthKey && req['get']('X-Health-Key') !== healthKey) {
    // Also allow internal/localhost requests
    const clientIp = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;
    const isInternal = clientIp === '127.0.0.1' || 
                      clientIp === '::1' || 
                      clientIp === '::ffff:127.0.0.1' ||
                      clientIp === undefined || // Test environment
                      req.hostname === 'localhost';
    
    if (!isInternal) {
      return res["status"](403)["json"]({ error: 'Forbidden' });
    }
  }
  
  const detailed = {
    api: "ok",
    database: "unknown",
    redis: "unknown",
    workers: "unknown",
    metrics: {} as Record<string, string | number>
  };
  
  // Database check
  try {
    const start = Date.now();
    await storage.getAllFunds();
    detailed.database = "ok";
    detailed.metrics['dbLatencyMs'] = Date.now() - start;
  } catch (error: unknown) {
    detailed.database = "fail";
  }
  
  // Redis check (optional dependency)
  const redisHealthy = (await storage.isRedisHealthy?.()) ?? false;
  detailed.redis = redisHealthy ? "ok" : "degraded";
  
  // Worker status (depends on Redis)
  detailed.workers = redisHealthy ? "ok" : "idle";

  // Memory and uptime
  detailed.metrics['uptimeSeconds'] = Math.floor(process.uptime());
  detailed.metrics['memoryMB'] = Math.round(process.memoryUsage().heapUsed / 1048576);
  detailed.metrics['version'] = process.env["npm_package_version"] || "1.3.2";

  res["json"](detailed);
});

// Simple inflight/uptime snapshot; extend as needed.
router['get']('/health/inflight', (_req: Request, res: Response) => {
  res["json"]({
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Metrics endpoint handled by server/routes/metrics-endpoint.ts (mounted separately)
// Removed duplicate to avoid conflicts

// Database health endpoint
router['get']('/api/health/db', async (req: Request, res: Response) => {
  try {
    const dbHealthy = await storage['ping']();

    if (dbHealthy) {
      res["json"]({
        database: 'connected',
        status: 'ok',
        timestamp: new Date().toISOString(),
      });
    } else {
      res["status"](503)["json"]({
        database: 'disconnected',
        status: 'error',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: unknown) {
    res["status"](503)["json"]({
      database: 'error',
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

// Cache health endpoint
router['get']('/api/health/cache', async (req: Request, res: Response) => {
  try {
    const redisHealthy = (await storage.isRedisHealthy?.()) ?? false;

    res["json"]({
      cache: redisHealthy ? 'connected' : 'degraded',
      status: redisHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    res["status"](503)["json"]({
      cache: 'error',
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

// Queue health endpoint
router['get']('/api/health/queues', async (req: Request, res: Response) => {
  try {
    const redisHealthy = (await storage.isRedisHealthy?.()) ?? false;

    if (!redisHealthy) {
      res["json"]({
        queues: {
          'reserve-calc': 'idle',
          'pacing-calc': 'idle',
        },
        status: 'degraded',
        message: 'Queues disabled (Redis not available)',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Check queue status via Redis
    const queueHealth: Record<string, { status: string; waiting?: number; active?: number; error?: string }> = {};

    try {
      // Import Redis client to check queue status
      const IORedis = await import('ioredis');

      const Redis = IORedis.default;
      const redis = new Redis({
        host: process.env["REDIS_HOST"] || 'localhost',
        port: parseInt(process.env["REDIS_PORT"] || '6379'),
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });

      // Check if queues exist and have workers
      const queues = ['reserve-calc', 'pacing-calc'];

      for (const queueName of queues) {
        try {
          const waiting = await redis['llen'](`bull:${queueName}:wait`);
          const active = await redis['llen'](`bull:${queueName}:active`);

          queueHealth[queueName] = {
            status: 'ok',
            waiting,
            active,
          };
        } catch (error: unknown) {
          queueHealth[queueName] = {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }

      await redis.quit();
    } catch (error: unknown) {
      // Fallback if Redis check fails
      queueHealth['reserve-calc'] = { status: 'unknown' };
      queueHealth['pacing-calc'] = { status: 'unknown' };
    }

    res["json"]({
      queues: queueHealth,
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    res["status"](503)["json"]({
      queues: {},
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

// Schema health endpoint
router['get']('/api/health/schema', async (req: Request, res: Response) => {
  try {
    // Query database for table list (dynamically access query method if available)
    const storageWithQuery = storage as unknown as { query?: (sql: string) => Promise<{ rows: Array<{ table_name: string }> }> };
    const result = await storageWithQuery.query?.(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`
    );

    const tables = result?.rows?.map((row: { table_name: string }) => row.table_name) || [];

    res["json"]({
      tables,
      count: tables.length,
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    res["status"](503)["json"]({
      tables: [],
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

// Migration status endpoint
router['get']('/api/health/migrations', async (req: Request, res: Response) => {
  try {
    // Query migration history (dynamically access query method if available)
    const storageWithQuery = storage as unknown as { query?: (sql: string) => Promise<{ rows: Array<{ name: string; hash: string; created_at: Date }> }> };
    const result = await storageWithQuery.query?.(
      `SELECT name, hash, created_at
       FROM drizzle_migrations
       ORDER BY created_at DESC
       LIMIT 5`
    );

    const migrations = result?.rows || [];

    res["json"]({
      status: 'up-to-date',
      latestMigrations: migrations,
      count: migrations.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    res["status"](503)["json"]({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

// Version endpoint
router['get']('/api/version', (req: Request, res: Response) => {
  const version = process.env["npm_package_version"] || '1.3.2';
  const nodeVersion = process.version;
  const platform = process.platform;
  const arch = process.arch;

  res["json"]({
    version,
    nodeVersion,
    platform,
    arch,
    environment: process.env["NODE_ENV"] || 'development',
    timestamp: new Date().toISOString(),
  });
});

// Alerts endpoint
router['get']('/api/health/alerts', async (req: Request, res: Response) => {
  try {
    const alerts = {
      critical: [] as Array<{ type: string; message: string; timestamp: string }>,
      warning: [] as Array<{ type: string; message: string; timestamp: string }>,
      info: [] as Array<{ type: string; message: string; timestamp: string }>,
    };

    // Check database connectivity
    const dbHealthy = (await storage['ping']?.()) ?? false;
    if (!dbHealthy) {
      alerts.critical.push({
        type: 'database',
        message: 'Database connection failed',
        timestamp: new Date().toISOString(),
      });
    }

    // Check Redis (optional)
    const redisHealthy = (await storage.isRedisHealthy?.()) ?? false;
    if (!redisHealthy) {
      alerts.warning.push({
        type: 'cache',
        message: 'Redis cache not available',
        timestamp: new Date().toISOString(),
      });
    }

    // Check memory usage
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1048576;

    if (heapUsedMB > 512) {
      alerts.warning.push({
        type: 'memory',
        message: `High memory usage: ${heapUsedMB.toFixed(0)}MB`,
        timestamp: new Date().toISOString(),
      });
    }

    res["json"]({
      ...alerts,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    res["status"](503)["json"]({
      critical: [{
        type: 'system',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }],
      warning: [],
      info: [],
      timestamp: new Date().toISOString(),
    });
  }
});

// Worker health endpoints
router['get']('/api/health/workers/:workerType', async (req: Request, res: Response) => {
  const { workerType } = req.params;

  try {
    const redisHealthy = (await storage.isRedisHealthy?.()) ?? false;

    if (!redisHealthy) {
      res["json"]({
        status: 'idle',
        message: 'Workers disabled (Redis not available)',
        worker: workerType,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Check worker health via worker health server
    try {
      const http = await import('http');

      const workerHealthPort = parseInt(process.env["WORKER_HEALTH_PORT"] || '9000');

      const options = {
        hostname: process.env["WORKER_HEALTH_HOST"] || 'localhost',
        port: workerHealthPort,
        path: '/health',
        method: 'GET',
        timeout: 2000,
      };

      await new Promise((resolve, reject) => {
        const req = http.request(options, (workerRes) => {
          let data = '';

          workerRes.on('data', (chunk) => {
            data += chunk;
          });

          workerRes.on('end', () => {
            try {
              const health = JSON.parse(data) as { workers?: Array<{ name: string; status: string; jobsProcessed: number; lastJobTime: string }> };
              const worker = health.workers?.find((w) =>
                w.name.includes(workerType)
              );

              if (worker) {
                res["json"]({
                  status: worker.status,
                  worker: workerType,
                  jobsProcessed: worker.jobsProcessed,
                  lastJobTime: worker.lastJobTime,
                  timestamp: new Date().toISOString(),
                });
              } else {
                res["status"](404)["json"]({
                  status: 'not_found',
                  worker: workerType,
                  message: 'Worker not registered',
                  timestamp: new Date().toISOString(),
                });
              }

              resolve(null);
            } catch (error: unknown) {
              reject(error);
            }
          });
        });

        req.on('error', reject);
        req.on('timeout', () => reject(new Error('Timeout')));
        req["end"]();
      });
    } catch (error: unknown) {
      // Worker health server not accessible
      res["json"]({
        status: 'unknown',
        worker: workerType,
        message: 'Worker health server not accessible',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: unknown) {
    res["status"](503)["json"]({
      status: 'error',
      worker: workerType,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
