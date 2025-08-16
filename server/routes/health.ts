/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { Router } from 'express';
import { healthCheck, readinessCheck, livenessCheck } from '../health';
import { storage } from '../storage';
import { rateLimitDetailed } from '../middleware/rateLimitDetailed';
import { setReady, registerInvalidator } from '../health/state';
import { register as metricsRegister } from '../metrics';
import type { Request, Response } from '../types/request-response';

const router = Router();

// Simple cache for health checks to avoid DB storms
let readyzCache: { ts: number; data: any } = { ts: 0, data: null };
let healthzCache: { ts: number; data: any } = { ts: 0, data: null };
const HEALTH_CACHE_MS = 1500; // 1.5 second cache

// Register cache invalidator for state changes
registerInvalidator(() => {
  readyzCache = { ts: 0, data: null };
  healthzCache = { ts: 0, data: null };
});

// Basic health check with mode and version
router.get('/health', (req: Request, res: Response) => {
  const providers = req.app.locals.providers as any;
  const mode = providers?.mode || (process.env.REDIS_URL === 'memory://' ? 'memory' : 'redis');
  res.json({
    status: 'ok',
    version: process.env.npm_package_version || '1.3.2',
    mode,
    ts: new Date().toISOString()
  });
});
router.get('/api/health', (req: Request, res: Response) => {
  const providers = req.app.locals.providers as any;
  const mode = providers?.mode || (process.env.REDIS_URL === 'memory://' ? 'memory' : 'redis');
  res.json({
    status: 'ok',
    version: process.env.npm_package_version || '1.3.2',
    mode,
    ts: new Date().toISOString()
  });
});
router.get('/api/health/ready', readinessCheck);
router.get('/api/health/live', livenessCheck);

// Richer JSON health endpoint for Guardian and canary checks
router.get('/healthz', async (req: Request, res: Response) => {
  // Prevent intermediary caching
  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('Pragma', 'no-cache');
  
  // Return cached response if fresh
  if (Date.now() - healthzCache.ts < HEALTH_CACHE_MS && healthzCache.data) {
    res.set('X-Health-From-Cache', '1');
    return res.json(healthzCache.data);
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
      version: process.env.npm_package_version || 'unknown',
      last_deploy: fs.existsSync('.last-deploy')
        ? fs.readFileSync('.last-deploy', 'utf8').trim()
        : 'unknown',
      status: errorRate < 0.01 ? 'healthy' : 'degraded'
    };
    
    // Cache the response
    healthzCache = { ts: Date.now(), data: healthData };
    
    res.json(healthData);
  } catch (error) {
    res.status(500).json({
      error: 'Health check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Readiness probe - checks if service can handle traffic
// Returns 200 only when all critical dependencies are ready
router.get('/readyz', async (req: Request, res: Response) => {
  // Prevent intermediary caching
  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('Pragma', 'no-cache');
  
  // Return cached response if fresh
  if (Date.now() - readyzCache.ts < HEALTH_CACHE_MS && readyzCache.data) {
    const cached = readyzCache.data;
    res.set('X-Health-From-Cache', '1');
    return res.status(cached.ready ? 200 : 503).json(cached);
  }
  
  const checks = {
    api: "ok",
    database: "unknown", 
    redis: "degraded" // Redis is optional per PR #39
  };
  
  // Check database connectivity (critical) - using lightweight ping
  try {
    const dbHealthy = await storage.ping();
    checks.database = dbHealthy ? "ok" : "fail";
  } catch (error) {
    checks.database = "fail";
  }
  
  // Redis is optional - check but don't fail on it
  const redisHealthy = await storage.isRedisHealthy?.() ?? false;
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
  
  // Cache the response
  readyzCache = { ts: Date.now(), data: response };
  
  res.status(isReady ? 200 : 503).json(response);
});

// Detailed health endpoint for diagnostics (protected + rate limited)
router.get('/health/detailed', rateLimitDetailed(), async (req: Request, res: Response) => {
  // Protect sensitive health details
  const healthKey = process.env.HEALTH_KEY;
  if (healthKey && req.get('X-Health-Key') !== healthKey) {
    // Also allow internal/localhost requests
    const isInternal = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    if (!isInternal) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  
  const detailed = {
    api: "ok",
    database: "unknown",
    redis: "unknown",
    workers: "unknown",
    metrics: {} as Record<string, any>
  };
  
  // Database check
  try {
    const start = Date.now();
    await storage.getAllFunds();
    detailed.database = "ok";
    detailed.metrics.dbLatencyMs = Date.now() - start;
  } catch (error) {
    detailed.database = "fail";
  }
  
  // Redis check (optional dependency)
  const redisHealthy = await storage.isRedisHealthy?.() ?? false;
  detailed.redis = redisHealthy ? "ok" : "degraded";
  
  // Worker status (depends on Redis)
  detailed.workers = redisHealthy ? "ok" : "idle";
  
  // Memory and uptime
  detailed.metrics.uptimeSeconds = Math.floor(process.uptime());
  detailed.metrics.memoryMB = Math.round(process.memoryUsage().heapUsed / 1048576);
  detailed.metrics.version = process.env.npm_package_version || "1.3.2";
  
  res.json(detailed);
});

// Simple inflight/uptime snapshot; extend as needed.
router.get('/health/inflight', (_req: any, res: any) => {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Metrics endpoint
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', metricsRegister.contentType);
    const metrics = await metricsRegister.metrics();
    res.send(metrics);
  } catch (error) {
    res.status(500).send('Error generating metrics');
  }
});

export default router;
