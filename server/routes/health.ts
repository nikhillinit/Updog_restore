/**
 * Health and Readiness Routes
 * Provides comprehensive health checks for Kubernetes and monitoring
 */
import { Router, Request, Response } from 'express';
import { breakerRegistry } from '../infra/circuit-breaker/breaker-registry';

interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  error?: string;
  details?: any;
}

interface ReadinessResponse {
  ok: boolean;
  status: 'ready' | 'not_ready' | 'shutting_down';
  timestamp: string;
  build: string;
  mode: string;
  checks: HealthCheckResult[];
  degraded?: string[];
  errors?: string[];
}

interface LivenessResponse {
  ok: boolean;
  timestamp: string;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  pid: number;
}

// Track shutdown state
let isShuttingDown = false;
let shutdownInitiatedAt: Date | null = null;

/**
 * Mark server as shutting down
 */
export function markShuttingDown(): void {
  isShuttingDown = true;
  shutdownInitiatedAt = new Date();
  console.log('[Health] Server marked as shutting down');
}

/**
 * Check if server is shutting down
 */
export function isServerShuttingDown(): boolean {
  return isShuttingDown;
}

/**
 * Perform health check on PostgreSQL
 */
async function checkPostgres(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    // Import dynamically to avoid circular dependencies
    const { pgPool } = await import('../db/pg-circuit').catch(() => ({
      pgPool: null
    }));
    
    if (!pgPool) {
      // If pg-circuit doesn't exist, try basic check
      const { Pool } = await import('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 5000,
      });
      
      await pool.query('SELECT 1');
      await pool.end();
      
      return {
        name: 'postgres',
        status: 'healthy',
        latency: Date.now() - start,
      };
    }
    
    const result = await pgPool.query('SELECT 1 as check, NOW() as time');
    const poolStats = {
      total: pgPool.totalCount,
      idle: pgPool.idleCount,
      waiting: pgPool.waitingCount,
    };
    
    return {
      name: 'postgres',
      status: 'healthy',
      latency: Date.now() - start,
      details: {
        pool: poolStats,
        time: result.rows[0]?.time,
      },
    };
  } catch (error) {
    return {
      name: 'postgres',
      status: 'unhealthy',
      latency: Date.now() - start,
      error: (error as Error).message,
    };
  }
}

/**
 * Perform health check on Redis
 */
async function checkRedis(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    // Import dynamically to avoid circular dependencies
    const { redis } = await import('../db/redis-circuit').catch(() => ({
      redis: null
    }));
    
    if (!redis) {
      // If redis-circuit doesn't exist, try basic check
      const { Redis } = await import('ioredis');
      const client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        connectTimeout: 5000,
        commandTimeout: 2000,
      });
      
      await client.ping();
      await client.quit();
      
      return {
        name: 'redis',
        status: 'healthy',
        latency: Date.now() - start,
      };
    }
    
    const pong = await redis.ping();
    const info = await redis.info('memory');
    
    // Parse memory usage from INFO command
    const usedMemory = info.match(/used_memory:(\d+)/)?.[1];
    const maxMemory = info.match(/maxmemory:(\d+)/)?.[1];
    
    return {
      name: 'redis',
      status: 'healthy',
      latency: Date.now() - start,
      details: {
        response: pong,
        memoryUsed: usedMemory ? parseInt(usedMemory) : undefined,
        memoryMax: maxMemory ? parseInt(maxMemory) : undefined,
      },
    };
  } catch (error) {
    // Check if we can fall back to memory cache
    const memoryMode = process.env.MEMORY_MODE === 'true';
    
    if (memoryMode) {
      return {
        name: 'redis',
        status: 'degraded',
        latency: Date.now() - start,
        error: (error as Error).message,
        details: {
          fallback: 'memory',
        },
      };
    }
    
    return {
      name: 'redis',
      status: 'unhealthy',
      latency: Date.now() - start,
      error: (error as Error).message,
    };
  }
}

/**
 * Check circuit breaker status
 */
function checkCircuitBreakers(): HealthCheckResult {
  try {
    const breakers = breakerRegistry.getAll();
    const degraded = breakerRegistry.getDegraded();
    const healthy = breakerRegistry.isHealthy();
    
    const details: any = {};
    for (const [name, info] of Object.entries(breakers)) {
      if (info && typeof info === 'object') {
        details[name] = {
          state: info.state,
          stats: info.stats,
        };
      }
    }
    
    return {
      name: 'circuit-breakers',
      status: healthy ? 'healthy' : degraded.length > 0 ? 'degraded' : 'unhealthy',
      details: {
        breakers: details,
        degraded,
        healthy,
      },
    };
  } catch (error) {
    return {
      name: 'circuit-breakers',
      status: 'degraded',
      error: (error as Error).message,
    };
  }
}

/**
 * Check external dependencies (optional)
 */
async function checkExternalDependencies(): Promise<HealthCheckResult[]> {
  const checks: HealthCheckResult[] = [];
  
  // Example: Check external API
  if (process.env.EXTERNAL_API_URL) {
    const start = Date.now();
    try {
      const response = await fetch(`${process.env.EXTERNAL_API_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      
      checks.push({
        name: 'external-api',
        status: response.ok ? 'healthy' : 'degraded',
        latency: Date.now() - start,
        details: {
          statusCode: response.status,
        },
      });
    } catch (error) {
      checks.push({
        name: 'external-api',
        status: 'unhealthy',
        latency: Date.now() - start,
        error: (error as Error).message,
      });
    }
  }
  
  return checks;
}

/**
 * Create health routes
 */
export function createHealthRouter(): Router {
  const router = Router();
  
  /**
   * Liveness probe - Basic health check
   * Returns 200 if the application is running
   */
  router.get('/livez', (req: Request, res: Response) => {
    // During shutdown, return 503
    if (isShuttingDown) {
      return res.status(503).json({
        ok: false,
        timestamp: new Date().toISOString(),
        status: 'shutting_down',
        shutdownInitiatedAt,
      });
    }
    
    const response: LivenessResponse = {
      ok: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid,
    };
    
    res.json(response);
  });
  
  /**
   * Readiness probe - Comprehensive health check
   * Returns 200 only when all critical dependencies are healthy
   */
  router.get('/readyz', async (req: Request, res: Response) => {
    // During shutdown, immediately return 503
    if (isShuttingDown) {
      return res.status(503).json({
        ok: false,
        status: 'shutting_down',
        timestamp: new Date().toISOString(),
        shutdownInitiatedAt,
      });
    }
    
    // Perform all health checks in parallel
    const [postgres, redis, circuitBreakers, ...external] = await Promise.all([
      checkPostgres(),
      checkRedis(),
      checkCircuitBreakers(),
      ...await checkExternalDependencies(),
    ]);
    
    const checks = [postgres, redis, circuitBreakers, ...external];
    
    // Determine overall health
    const unhealthyChecks = checks.filter(c => c.status === 'unhealthy');
    const degradedChecks = checks.filter(c => c.status === 'degraded');
    
    const isHealthy = unhealthyChecks.length === 0;
    const isDegraded = degradedChecks.length > 0;
    
    const response: ReadinessResponse = {
      ok: isHealthy,
      status: isHealthy ? (isDegraded ? 'ready' : 'ready') : 'not_ready',
      timestamp: new Date().toISOString(),
      build: process.env.BUILD_SHA || process.env.npm_package_version || 'dev',
      mode: process.env.MEMORY_MODE === 'true' ? 'memory' : 'redis',
      checks,
    };
    
    if (degradedChecks.length > 0) {
      response.degraded = degradedChecks.map(c => c.name);
    }
    
    if (unhealthyChecks.length > 0) {
      response.errors = unhealthyChecks.map(c => `${c.name}: ${c.error}`);
    }
    
    // Return appropriate status code
    const statusCode = isHealthy ? 200 : 503;
    res.status(statusCode).json(response);
  });
  
  /**
   * Startup probe - Used during initialization
   * Returns 200 when application is ready to receive traffic
   */
  router.get('/startupz', async (req: Request, res: Response) => {
    try {
      // Check only critical dependencies for startup
      const postgres = await checkPostgres();
      
      const isReady = postgres.status !== 'unhealthy';
      
      res.status(isReady ? 200 : 503).json({
        ok: isReady,
        timestamp: new Date().toISOString(),
        checks: [postgres],
      });
    } catch (error) {
      res.status(503).json({
        ok: false,
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      });
    }
  });
  
  /**
   * Legacy health endpoint (backward compatibility)
   */
  router.get('/health', async (req: Request, res: Response) => {
    // Simple health check for backward compatibility
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });
  
  /**
   * Detailed health endpoint with auth
   */
  router.get('/health/detailed', async (req: Request, res: Response) => {
    // Check for health key if configured
    const healthKey = process.env.HEALTH_KEY;
    if (healthKey && req.get('X-Health-Key') !== healthKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Perform comprehensive checks
    const [postgres, redis, circuitBreakers] = await Promise.all([
      checkPostgres(),
      checkRedis(),
      checkCircuitBreakers(),
    ]);
    
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      node: process.version,
      pid: process.pid,
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
      },
      cpu: {
        user: Math.round(cpuUsage.user / 1000),
        system: Math.round(cpuUsage.system / 1000),
      },
      dependencies: {
        postgres,
        redis,
        circuitBreakers,
      },
    });
  });
  
  return router;
}

/**
 * Register health routes (Fastify compatibility wrapper)
 */
export async function registerHealthRoutes(app: any): Promise<void> {
  if (app.use) {
    // Express app
    app.use(createHealthRouter());
  } else if (app.register) {
    // Fastify app
    await app.register(async (fastify: any) => {
      const router = createHealthRouter();
      // Convert Express routes to Fastify
      // This would need proper implementation for production
      console.warn('[Health] Fastify registration not fully implemented');
    });
  }
}

export default createHealthRouter;