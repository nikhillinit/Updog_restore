/**
 * Prometheus metrics for production observability
 */
import * as client from 'prom-client';
import type { Request, Response, NextFunction } from 'express';
import { FEATURES } from '../config/features';
import type { RedisConn } from '../lib/redis/cluster';
import { pingRedis } from '../lib/redis/cluster';

// Initialize default metrics
client.collectDefaultMetrics();

// Custom metrics
export const httpDuration = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [1, 5, 15, 50, 100, 200, 500, 1000, 2000, 5000]
});

export const cacheHits = new client.Counter({
  name: 'cache_hits_total',
  help: 'Cache hits',
});

export const cacheMisses = new client.Counter({
  name: 'cache_misses_total',
  help: 'Cache misses',
});

export const redisUp = new client.Gauge({
  name: 'redis_up',
  help: 'Redis up (1) / down (0)',
});

export const redisLatency = new client.Gauge({
  name: 'redis_latency_ms',
  help: 'Redis ping latency in ms',
});

export function withRequestMetrics() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!FEATURES.metrics) return next();
    const stop = httpDuration.startTimer({ method: req.method, path: req.route?.path ?? req.path });
    res['on']('finish', () => stop({ status: String(res.statusCode) }));
    next();
  };
}

export function installMetricsRoute(app: import('express').Express) {
  if (!FEATURES.metrics) return;
  
  // Import auth middleware
  const { authenticateMetrics } = require('../middleware/auth-metrics');
  
  app['get']('/metrics', authenticateMetrics, async (_req: Request, res: Response) => {
    res['setHeader']('Content-Type', client.register.contentType);
    res["send"](await client.register.metrics());
  });
}

export function startRedisHealthProbe(conn?: RedisConn) {
  if (!FEATURES.metrics || !conn) return;
   
  const t = setInterval(async () => {
    const res = await pingRedis(conn.conn);
    if (res.ok) {
      redisUp['set'](1);
      if (typeof res.latencyMs === 'number') redisLatency['set'](res.latencyMs);
    } else {
      redisUp['set'](0);
    }
  }, 5000);
  t.unref?.();
}