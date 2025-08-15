# Optimized Production Roadmap

## Executive Summary
Transform a functional application into a production-grade system with observable metrics, predictable performance, and operational excellence. Focus on high-leverage improvements that compound value.

## Current State ✅
- **Idempotent API**: Client-side deduplication, server-ready for persistence
- **Graceful Shutdown**: Socket draining, health state management
- **Rate Limiting**: IPv6-safe with dynamic retry-after
- **Error Standardization**: Consistent codes and response shapes
- **CORS Hardening**: Origin validation, proper header exposure
- **Test Coverage**: Critical middleware paths validated

## Phase 1: Observability Foundation (24-48 hours)

### A. Structured Logging with Pino
```typescript
// server/lib/logger.ts
import pino from 'pino';
import { randomBytes } from 'crypto';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { pid: process.pid, hostname: os.hostname() },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-health-key"]', '*.password'],
    censor: '[REDACTED]'
  },
  serializers: {
    req: (req) => ({
      id: req.requestId,
      method: req.method,
      url: req.url,
      query: req.query,
      ip: req.ip
    }),
    res: (res) => ({
      statusCode: res.statusCode,
      duration: res.responseTime
    }),
    err: pino.stdSerializers.err
  }
});

// Middleware
export function loggingMiddleware() {
  return (req, res, next) => {
    req.log = logger.child({ requestId: req.requestId });
    const start = Date.now();
    
    res.on('finish', () => {
      req.log.info({
        req,
        res,
        responseTime: Date.now() - start
      }, 'request completed');
    });
    
    next();
  };
}
```

### B. Prometheus Metrics (Business-Critical)
```typescript
// server/metrics/index.ts
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

const register = new Registry();

// HTTP metrics
const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

// Business metrics
const fundCreations = new Counter({
  name: 'fund_creations_total',
  help: 'Total fund creation attempts',
  labelNames: ['status', 'idempotency_status', 'model_version']
});

const idempotencyHits = new Counter({
  name: 'idempotency_cache_hits_total',
  help: 'Idempotency cache hit/miss ratio',
  labelNames: ['result'] // 'hit' or 'miss'
});

const capacityRejections = new Counter({
  name: 'capacity_rejections_total',
  help: 'Requests rejected due to capacity',
  labelNames: ['endpoint']
});

register.registerMetric(httpDuration);
register.registerMetric(fundCreations);
register.registerMetric(idempotencyHits);
register.registerMetric(capacityRejections);

// Export endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});
```

## Phase 2: Server-Side Idempotency (Day 2-3)

### PostgreSQL-Based Implementation
```typescript
// server/lib/idempotency.ts
interface IdempotencyRecord {
  key: string;
  requestHash: string;
  statusCode: number;
  responseBody: string;
  createdAt: Date;
  expiresAt: Date;
}

export class IdempotencyStore {
  async getOrCreate(
    key: string,
    requestHash: string,
    handler: () => Promise<{ status: number; body: any }>
  ) {
    // Check existing
    const existing = await db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key))
      .limit(1);
    
    if (existing.length > 0) {
      const record = existing[0];
      
      // Expired - delete and proceed
      if (record.expiresAt < new Date()) {
        await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
      }
      // Hash mismatch - conflict
      else if (record.requestHash !== requestHash) {
        throw new ConflictError('Idempotency key exists with different request');
      }
      // Valid replay
      else {
        return {
          status: record.statusCode,
          body: JSON.parse(record.responseBody),
          replayed: true
        };
      }
    }
    
    // Execute handler
    const result = await handler();
    
    // Store result
    await db.insert(idempotencyKeys).values({
      key,
      requestHash,
      statusCode: result.status,
      responseBody: JSON.stringify(result.body),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h TTL
    });
    
    return { ...result, replayed: false };
  }
}

// Middleware
export function idempotent() {
  return async (req, res, next) => {
    const key = req.get('Idempotency-Key');
    if (!key) return next();
    
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    try {
      const result = await idempotencyStore.getOrCreate(key, hash, async () => {
        // Capture response
        const chunks = [];
        const originalWrite = res.write;
        const originalEnd = res.end;
        
        res.write = function(chunk) {
          chunks.push(chunk);
          return originalWrite.apply(res, arguments);
        };
        
        res.end = function(chunk) {
          if (chunk) chunks.push(chunk);
          const body = Buffer.concat(chunks).toString();
          
          // Store for idempotency
          res.locals.responseBody = body;
          res.locals.statusCode = res.statusCode;
          
          return originalEnd.apply(res, arguments);
        };
        
        await next();
        
        return {
          status: res.locals.statusCode,
          body: res.locals.responseBody
        };
      });
      
      res.set('Idempotency-Status', result.replayed ? 'replayed' : 'created');
      res.status(result.status).json(result.body);
    } catch (error) {
      if (error instanceof ConflictError) {
        return sendApiError(res, 409, {
          error: error.message,
          code: 'IDEMPOTENCY_CONFLICT'
        });
      }
      next(error);
    }
  };
}
```

## Phase 3: Performance Optimization (Day 4-5)

### A. Query Optimization
```sql
-- Strategic indexes
CREATE INDEX CONCURRENTLY idx_funds_user_created 
  ON funds(user_id, created_at DESC) 
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY idx_funds_search 
  ON funds USING gin(to_tsvector('english', name || ' ' || description));

-- Materialized view for dashboards
CREATE MATERIALIZED VIEW fund_summaries AS
SELECT 
  user_id,
  COUNT(*) as total_funds,
  SUM(size) as total_aum,
  AVG(irr) as avg_irr,
  MAX(updated_at) as last_activity
FROM funds
WHERE deleted_at IS NULL
GROUP BY user_id;

CREATE UNIQUE INDEX ON fund_summaries(user_id);

-- Refresh strategy
CREATE OR REPLACE FUNCTION refresh_fund_summaries()
RETURNS trigger AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY fund_summaries;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER refresh_summaries
AFTER INSERT OR UPDATE OR DELETE ON funds
FOR EACH STATEMENT EXECUTE FUNCTION refresh_fund_summaries();
```

### B. Redis Cache Layer
```typescript
// server/cache/index.ts
import Redis from 'ioredis';
import { logger } from '../lib/logger';

class CacheManager {
  private redis: Redis;
  private enabled: boolean;
  
  constructor() {
    if (process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        lazyConnect: true
      });
      
      this.redis.on('error', (err) => {
        logger.error({ err }, 'Redis error - disabling cache');
        this.enabled = false;
      });
      
      this.redis.on('ready', () => {
        logger.info('Redis cache ready');
        this.enabled = true;
      });
    }
  }
  
  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled) return null;
    
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (err) {
      logger.warn({ err, key }, 'Cache get failed');
      return null;
    }
  }
  
  async set(key: string, value: any, ttl = 300): Promise<void> {
    if (!this.enabled) return;
    
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
    } catch (err) {
      logger.warn({ err, key }, 'Cache set failed');
    }
  }
  
  async invalidate(pattern: string): Promise<void> {
    if (!this.enabled) return;
    
    const stream = this.redis.scanStream({ match: pattern });
    stream.on('data', (keys) => {
      if (keys.length) {
        this.redis.unlink(keys);
      }
    });
  }
}

export const cache = new CacheManager();

// Cache-aside pattern
export function cacheable(keyFn: (req) => string, ttl = 300) {
  return async (req, res, next) => {
    const key = keyFn(req);
    const cached = await cache.get(key);
    
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }
    
    // Capture response for caching
    const originalJson = res.json;
    res.json = function(data) {
      cache.set(key, data, ttl);
      res.set('X-Cache', 'MISS');
      return originalJson.call(this, data);
    };
    
    next();
  };
}
```

## Phase 4: Production Excellence (Day 6-7)

### A. Health-Based Deployment
```typescript
// scripts/deploy.ts
interface DeploymentStrategy {
  canaryPercent: number;
  bakeTime: number;
  errorThreshold: number;
  rollbackOnFailure: boolean;
}

async function deploy(version: string, strategy: DeploymentStrategy) {
  const deployment = {
    id: crypto.randomUUID(),
    version,
    startTime: Date.now(),
    status: 'in_progress'
  };
  
  try {
    // 1. Pre-flight checks
    await runTests();
    await checkDependencies();
    
    // 2. Deploy canary
    await deployCanary(version, strategy.canaryPercent);
    await sleep(strategy.bakeTime);
    
    // 3. Check canary health
    const metrics = await getCanaryMetrics();
    if (metrics.errorRate > strategy.errorThreshold) {
      throw new Error(`Canary error rate ${metrics.errorRate} exceeds threshold`);
    }
    
    // 4. Progressive rollout
    for (const percent of [25, 50, 75, 100]) {
      await setTrafficSplit(version, percent);
      await sleep(30_000);
      
      const health = await checkHealth();
      if (!health.healthy) {
        throw new Error(`Unhealthy at ${percent}%: ${health.reason}`);
      }
    }
    
    deployment.status = 'success';
    deployment.endTime = Date.now();
    
  } catch (error) {
    deployment.status = 'failed';
    deployment.error = error.message;
    
    if (strategy.rollbackOnFailure) {
      await rollback();
    }
    
    throw error;
  } finally {
    await recordDeployment(deployment);
  }
  
  return deployment;
}
```

### B. Load Testing Suite
```typescript
// tests/load/scenarios.k6.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  scenarios: {
    baseline: {
      executor: 'constant-vus',
      vus: 10,
      duration: '5m',
    },
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '1m', target: 100 },
        { duration: '30s', target: 1000 },
        { duration: '2m', target: 1000 },
        { duration: '30s', target: 100 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    errors: ['rate<0.01'],
  },
};

export default function() {
  const payload = JSON.stringify({
    name: `Test Fund ${__VU}-${__ITER}`,
    size: Math.random() * 10000000,
    stages: [
      { name: 'Seed', months: 18, graduate: 0.7, exit: 0.1 },
      { name: 'Series A', months: 24, graduate: 0.6, exit: 0.15 }
    ]
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `test-${__VU}-${__ITER}`,
    },
  };
  
  const res = http.post('http://localhost:5000/api/funds', payload, params);
  
  const success = check(res, {
    'status is 201': (r) => r.status === 201,
    'has fund id': (r) => JSON.parse(r.body).id !== undefined,
    'response time OK': (r) => r.timings.duration < 500,
  });
  
  errorRate.add(!success);
  sleep(1);
}
```

## Implementation Priority Matrix

| Task | Impact | Effort | Priority | Timeline |
|------|--------|--------|----------|----------|
| Pino logging | High | Low | P0 | Day 1 |
| Prometheus metrics | High | Low | P0 | Day 1 |
| Server idempotency | High | Medium | P0 | Day 2-3 |
| Redis cache | Medium | Low | P1 | Day 4 |
| Query optimization | High | Medium | P1 | Day 4 |
| Load testing | Medium | Low | P1 | Day 5 |
| Health deployment | Medium | Medium | P2 | Day 6 |
| Materialized views | Low | Medium | P2 | Day 7 |

## Success Metrics

### Performance
- p50 latency: <50ms
- p99 latency: <200ms
- Throughput: 10K RPS
- Error rate: <0.1%

### Reliability
- Uptime: 99.95%
- MTTR: <15 minutes
- Deployment success: >95%
- Rollback time: <2 minutes

### Observability
- Log coverage: 100%
- Trace sampling: 10%
- Alert latency: <30 seconds
- Dashboard load: <2 seconds

## Risk Mitigation

1. **Database Overload**: Connection pooling, read replicas, query timeouts
2. **Memory Leaks**: Heap monitoring, automatic restarts, memory limits
3. **Dependency Failures**: Circuit breakers, fallbacks, graceful degradation
4. **Security Vulnerabilities**: Automated scanning, dependency updates, CSP hardening

## Next Immediate Actions

1. ✅ Install dependencies: `npm i pino pino-http prom-client`
2. ✅ Add logging middleware
3. ✅ Set up /metrics endpoint
4. ✅ Create idempotency table migration
5. ✅ Implement idempotency middleware
6. ✅ Add Redis connection with fallback
7. ✅ Write k6 load test scenarios
8. ✅ Document deployment procedures

This roadmap provides a clear, actionable path to production excellence with measurable outcomes and minimal technical debt.