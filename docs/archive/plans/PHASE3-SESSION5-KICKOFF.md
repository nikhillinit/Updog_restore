---
status: HISTORICAL
last_updated: 2026-01-19
---

# Phase 3 Session 5: Cache Statistics & Monitoring

**Date**: 2026-01-06 **Branch**: `claude/phase3-session5-cache-monitoring`
**Previous**: Session 4 (PR #364) - Worker cache integration, PR #365 -
TypeScript fixes **Status**: Planning

---

## Session Overview

**Objective**: Add comprehensive monitoring and statistics infrastructure for
ScenarioMatrixCache to enable observability, performance tracking, and
operational insights.

**Scope**: Cache statistics API, monitoring endpoints, performance metrics,
cache invalidation

**Duration**: 90 minutes **Complexity**: Medium (API endpoints, metrics
aggregation, monitoring integration)

---

## Session 4 Recap

**What was completed**:

- ScenarioMatrixCache integrated into BullMQ worker pipeline
- Worker supports dual-tier caching (PostgreSQL + Redis)
- Cache hit/miss logging in worker completion handlers
- Standalone worker entry point with cache support
- Post-merge TypeScript fixes (PR #365)

**What's in production**:

- Worker integration:
  [server/workers/scenarioGeneratorWorker.ts](server/workers/scenarioGeneratorWorker.ts)
- Cache implementation:
  [shared/core/optimization/ScenarioMatrixCache.ts](shared/core/optimization/ScenarioMatrixCache.ts)
- Integration tests:
  [tests/integration/ScenarioMatrixCache.integration.test.ts](tests/integration/ScenarioMatrixCache.integration.test.ts)

---

## Session 5 Goals

### 1. Cache Statistics API (30 min)

**Endpoint**: `GET /api/cache/stats`

**Response Schema**:

```typescript
{
  "overview": {
    "totalRequests": number,
    "cacheHits": number,
    "cacheMisses": number,
    "hitRate": number,           // 0.0 - 1.0
    "avgLatencyMs": {
      "redis": number,
      "postgres": number,
      "generation": number
    }
  },
  "storage": {
    "redis": {
      "entriesCount": number,
      "totalSizeBytes": number,
      "avgEntrySizeBytes": number
    },
    "postgres": {
      "entriesCount": number,
      "totalSizeBytes": number,
      "avgEntrySizeBytes": number
    }
  },
  "performance": {
    "p50LatencyMs": number,
    "p95LatencyMs": number,
    "p99LatencyMs": number,
    "slowestQueries": Array<{
      "matrixKey": string,
      "latencyMs": number,
      "timestamp": string
    }>
  },
  "recentActivity": {
    "last24Hours": {
      "requests": number,
      "hits": number,
      "misses": number
    },
    "last7Days": {
      "requests": number,
      "hits": number,
      "misses": number
    }
  }
}
```

**Implementation**:

- Query `scenario_matrices` table for storage stats
- Track cache hits/misses in worker completion handlers
- Store metrics in Redis with TTL (24 hours)
- Aggregate metrics on demand

### 2. Cache Invalidation API (20 min)

**Endpoint**: `POST /api/cache/invalidate`

**Request Body**:

```typescript
{
  "scope": "all" | "fund" | "matrix",
  "fundId"?: string,          // required if scope="fund"
  "matrixKey"?: string,       // required if scope="matrix"
  "reason"?: string           // optional audit reason
}
```

**Response**:

```typescript
{
  "invalidated": {
    "redis": number,          // entries removed from Redis
    "postgres": number        // entries marked as stale in PostgreSQL
  },
  "duration": number,         // milliseconds
  "auditLog": {
    "timestamp": string,
    "user": string,
    "reason": string
  }
}
```

**Implementation**:

- Delete matching keys from Redis
- Mark PostgreSQL entries as `status='invalidated'`
- Log invalidation event for audit
- Return count of invalidated entries

### 3. Cache Warming API (20 min)

**Endpoint**: `POST /api/cache/warm`

**Request Body**:

```typescript
{
  "fundIds": string[],
  "taxonomyVersion": string,
  "priority": "high" | "low",  // high = immediate, low = background queue
  "configs": Array<{            // pre-defined cache configurations
    "numScenarios": number,
    "buckets": BucketConfig[],
    "correlationWeights": CorrelationWeights,
    "recycling": RecyclingConfig
  }>
}
```

**Response**:

```typescript
{
  "scheduled": number,         // number of cache warm jobs scheduled
  "estimated": {
    "totalDurationMs": number,
    "completionTime": string
  },
  "jobs": Array<{
    "jobId": string,
    "configHash": string,
    "status": "pending" | "processing" | "complete"
  }>
}
```

**Implementation**:

- Queue cache warm jobs in BullMQ
- Pre-generate matrices for common configurations
- Priority jobs bypass queue limits
- Background jobs use low priority

### 4. Cache Metrics Integration (15 min)

**Worker Metrics Collection**:

Update
[server/workers/scenarioGeneratorWorker.ts](server/workers/scenarioGeneratorWorker.ts)
to emit metrics:

```typescript
// On cache hit
metrics.increment('cache.hits', {
  tier: 'redis',
  fundId: config.fundId,
});

// On cache miss
metrics.increment('cache.misses', {
  fundId: config.fundId,
});

// Cache latency
metrics.timing('cache.latency.redis', redisLatency);
metrics.timing('cache.latency.postgres', pgLatency);
metrics.timing('cache.latency.generation', generationLatency);

// Storage size
metrics.gauge('cache.size.redis', redisSizeBytes);
metrics.gauge('cache.size.postgres', pgSizeBytes);
```

**Prometheus Integration** (if metrics library available):

- Expose `/metrics` endpoint with Prometheus format
- Cache hit/miss counters
- Latency histograms
- Storage size gauges

### 5. Testing & Validation (15 min)

**Unit Tests**:

- Cache stats calculation accuracy
- Invalidation scope filtering
- Warm job scheduling logic

**Integration Tests**:

- Cache stats API with real metrics
- Invalidation API with PostgreSQL + Redis
- Warm API with BullMQ queue

**Manual Smoke Test**:

```bash
# Generate some cache activity
curl -X POST http://localhost:5000/api/monte-carlo/simulate \
  -H "Content-Type: application/json" \
  -d '{"fundId":"fund-1","runs":1000}'

# Check cache stats
curl http://localhost:5000/api/cache/stats

# Invalidate cache for fund
curl -X POST http://localhost:5000/api/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"scope":"fund","fundId":"fund-1","reason":"Configuration change"}'

# Warm cache
curl -X POST http://localhost:5000/api/cache/warm \
  -H "Content-Type: application/json" \
  -d '{"fundIds":["fund-1"],"taxonomyVersion":"v1.2","priority":"high","configs":[...]}'
```

---

## Implementation Plan

### Step 1: Create Cache Routes File (10 min)

**File**: `server/routes/cache.ts`

```typescript
import express from 'express';
import { z } from 'zod';
import { CacheStatsService } from '../services/CacheStatsService';
import { CacheInvalidationService } from '../services/CacheInvalidationService';
import { CacheWarmingService } from '../services/CacheWarmingService';

const router = express.Router();

// GET /api/cache/stats - Cache statistics
router.get('/stats', async (req, res) => {
  const stats = await CacheStatsService.getStatistics();
  res.json(stats);
});

// POST /api/cache/invalidate - Invalidate cache entries
router.post('/invalidate', async (req, res) => {
  const schema = z.object({
    scope: z.enum(['all', 'fund', 'matrix']),
    fundId: z.string().optional(),
    matrixKey: z.string().optional(),
    reason: z.string().optional(),
  });

  const body = schema.parse(req.body);
  const result = await CacheInvalidationService.invalidate(body);
  res.json(result);
});

// POST /api/cache/warm - Warm cache
router.post('/warm', async (req, res) => {
  const schema = z.object({
    fundIds: z.array(z.string()),
    taxonomyVersion: z.string(),
    priority: z.enum(['high', 'low']),
    configs: z.array(z.any()), // ScenarioConfigWithMeta[]
  });

  const body = schema.parse(req.body);
  const result = await CacheWarmingService.warm(body);
  res.json(result);
});

export default router;
```

### Step 2: Implement CacheStatsService (15 min)

**File**: `server/services/CacheStatsService.ts`

```typescript
import { db } from '../db';
import { redis } from '../redis';
import { scenarioMatrices } from '@shared/schema';
import { count, sum, avg, sql } from 'drizzle-orm';

export class CacheStatsService {
  /**
   * Get comprehensive cache statistics
   */
  static async getStatistics() {
    // PostgreSQL storage stats
    const pgStats = await db
      .select({
        count: count(),
        totalSize: sum(sql`octet_length(moic_matrix)`),
        avgSize: avg(sql`octet_length(moic_matrix)`),
      })
      .from(scenarioMatrices)
      .where(sql`status = 'complete'`);

    // Redis storage stats (approximation)
    const redisKeys = await redis.keys('scenario-matrix:*');
    const redisSizes = await Promise.all(
      redisKeys.slice(0, 100).map(async (key) => {
        const value = await redis.get(key);
        return value ? value.length : 0;
      })
    );

    const redisStats = {
      entriesCount: redisKeys.length,
      totalSizeBytes:
        redisSizes.reduce((a, b) => a + b, 0) *
        (redisKeys.length / Math.min(100, redisKeys.length)),
      avgEntrySizeBytes:
        redisSizes.reduce((a, b) => a + b, 0) / redisSizes.length,
    };

    // Retrieve metrics from Redis (stored by worker)
    const metrics = await redis.get('cache:metrics:24h');
    const metricsData = metrics
      ? JSON.parse(metrics)
      : {
          totalRequests: 0,
          cacheHits: 0,
          cacheMisses: 0,
        };

    const hitRate =
      metricsData.totalRequests > 0
        ? metricsData.cacheHits / metricsData.totalRequests
        : 0;

    return {
      overview: {
        totalRequests: metricsData.totalRequests,
        cacheHits: metricsData.cacheHits,
        cacheMisses: metricsData.cacheMisses,
        hitRate,
        avgLatencyMs: metricsData.avgLatencyMs || {
          redis: 0,
          postgres: 0,
          generation: 0,
        },
      },
      storage: {
        redis: redisStats,
        postgres: {
          entriesCount: pgStats[0]?.count || 0,
          totalSizeBytes: pgStats[0]?.totalSize || 0,
          avgEntrySizeBytes: pgStats[0]?.avgSize || 0,
        },
      },
      performance: metricsData.performance || {
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        slowestQueries: [],
      },
      recentActivity: {
        last24Hours: metricsData,
        last7Days: {
          requests: 0,
          hits: 0,
          misses: 0,
        },
      },
    };
  }
}
```

### Step 3: Implement CacheInvalidationService (10 min)

**File**: `server/services/CacheInvalidationService.ts`

```typescript
import { db } from '../db';
import { redis } from '../redis';
import { scenarioMatrices } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export class CacheInvalidationService {
  /**
   * Invalidate cache entries based on scope
   */
  static async invalidate(params: {
    scope: 'all' | 'fund' | 'matrix';
    fundId?: string;
    matrixKey?: string;
    reason?: string;
  }) {
    const startTime = Date.now();
    let redisCount = 0;
    let postgresCount = 0;

    // Invalidate Redis
    if (params.scope === 'all') {
      const keys = await redis.keys('scenario-matrix:*');
      if (keys.length > 0) {
        await redis.del(...keys);
        redisCount = keys.length;
      }
    } else if (params.scope === 'fund' && params.fundId) {
      // We don't store fundId in Redis keys, so need to query PostgreSQL first
      const matrices = await db
        .select({ matrixKey: scenarioMatrices.matrixKey })
        .from(scenarioMatrices)
        .where(eq(scenarioMatrices.fundId, params.fundId));

      const keys = matrices.map((m) => `scenario-matrix:${m.matrixKey}`);
      if (keys.length > 0) {
        await redis.del(...keys);
        redisCount = keys.length;
      }
    } else if (params.scope === 'matrix' && params.matrixKey) {
      await redis.del(`scenario-matrix:${params.matrixKey}`);
      redisCount = 1;
    }

    // Invalidate PostgreSQL (mark as invalidated)
    if (params.scope === 'all') {
      const result = await db
        .update(scenarioMatrices)
        .set({ status: 'invalidated' })
        .where(eq(scenarioMatrices.status, 'complete'));
      postgresCount = result.rowCount || 0;
    } else if (params.scope === 'fund' && params.fundId) {
      const result = await db
        .update(scenarioMatrices)
        .set({ status: 'invalidated' })
        .where(
          and(
            eq(scenarioMatrices.fundId, params.fundId),
            eq(scenarioMatrices.status, 'complete')
          )
        );
      postgresCount = result.rowCount || 0;
    } else if (params.scope === 'matrix' && params.matrixKey) {
      const result = await db
        .update(scenarioMatrices)
        .set({ status: 'invalidated' })
        .where(
          and(
            eq(scenarioMatrices.matrixKey, params.matrixKey),
            eq(scenarioMatrices.status, 'complete')
          )
        );
      postgresCount = result.rowCount || 0;
    }

    const duration = Date.now() - startTime;

    // Audit log
    console.log(
      `[CacheInvalidation] ${params.scope} invalidation - Redis: ${redisCount}, PostgreSQL: ${postgresCount}, Reason: ${params.reason || 'N/A'}`
    );

    return {
      invalidated: {
        redis: redisCount,
        postgres: postgresCount,
      },
      duration,
      auditLog: {
        timestamp: new Date().toISOString(),
        user: 'system',
        reason: params.reason || 'Manual invalidation',
      },
    };
  }
}
```

### Step 4: Implement CacheWarmingService (15 min)

**File**: `server/services/CacheWarmingService.ts`

```typescript
import { Queue } from 'bullmq';
import type { ScenarioConfigWithMeta } from '@shared/core/optimization/ScenarioMatrixCache';

export class CacheWarmingService {
  /**
   * Warm cache by pre-generating matrices
   */
  static async warm(params: {
    fundIds: string[];
    taxonomyVersion: string;
    priority: 'high' | 'low';
    configs: Omit<ScenarioConfigWithMeta, 'fundId' | 'taxonomyVersion'>[];
  }) {
    const queue = new Queue('scenario-generation', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    });

    const jobs: Array<{ jobId: string; configHash: string; status: string }> =
      [];

    for (const fundId of params.fundIds) {
      for (const config of params.configs) {
        const fullConfig: ScenarioConfigWithMeta = {
          ...config,
          fundId,
          taxonomyVersion: params.taxonomyVersion,
        };

        const job = await queue.add('warm-cache', fullConfig, {
          priority: params.priority === 'high' ? 1 : 10,
        });

        jobs.push({
          jobId: job.id!,
          configHash: `fund-${fundId}-config-${jobs.length}`,
          status: 'pending',
        });
      }
    }

    const estimatedDurationMs = jobs.length * 250; // 250ms average per job
    const completionTime = new Date(
      Date.now() + estimatedDurationMs
    ).toISOString();

    return {
      scheduled: jobs.length,
      estimated: {
        totalDurationMs: estimatedDurationMs,
        completionTime,
      },
      jobs,
    };
  }
}
```

### Step 5: Update Worker Metrics Collection (10 min)

**Update**:
[server/workers/scenarioGeneratorWorker.ts](server/workers/scenarioGeneratorWorker.ts)

Add metrics tracking in `processScenarioJob`:

```typescript
// After cache lookup
const cacheHit = result.metadata.durationMs === 0;

// Update metrics in Redis
const metricsKey = 'cache:metrics:24h';
const metrics = await redis.get(metricsKey);
const metricsData = metrics
  ? JSON.parse(metrics)
  : {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      latencies: [],
    };

metricsData.totalRequests++;
if (cacheHit) {
  metricsData.cacheHits++;
} else {
  metricsData.cacheMisses++;
}

metricsData.latencies.push({
  tier: cacheHit ? 'redis' : 'postgres',
  latency: Date.now() - startTime,
  timestamp: new Date().toISOString(),
});

// Keep last 1000 latencies
metricsData.latencies = metricsData.latencies.slice(-1000);

await redis.setEx(metricsKey, 86400, JSON.stringify(metricsData));
```

### Step 6: Mount Cache Routes (5 min)

**Update**: [server/index.ts](server/index.ts)

```typescript
import cacheRoutes from './routes/cache';

// ...

app.use('/api/cache', cacheRoutes);
```

### Step 7: Testing & Validation (15 min)

**Integration Tests**: `tests/integration/cache-monitoring.test.ts`

```typescript
describe('Cache Monitoring API', () => {
  it('should return cache statistics', async () => {
    const response = await request(app).get('/api/cache/stats');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('overview');
    expect(response.body).toHaveProperty('storage');
    expect(response.body).toHaveProperty('performance');
  });

  it('should invalidate cache by scope', async () => {
    const response = await request(app)
      .post('/api/cache/invalidate')
      .send({ scope: 'all', reason: 'Test invalidation' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('invalidated');
    expect(response.body.invalidated).toHaveProperty('redis');
    expect(response.body.invalidated).toHaveProperty('postgres');
  });

  it('should warm cache', async () => {
    const response = await request(app)
      .post('/api/cache/warm')
      .send({
        fundIds: ['fund-1'],
        taxonomyVersion: 'v1.2',
        priority: 'high',
        configs: [
          {
            numScenarios: 1000,
            buckets: [],
            correlationWeights: {
              macro: 0.3,
              systematic: 0.5,
              idiosyncratic: 0.2,
            },
            recycling: { enabled: false, mode: 'same-bucket' },
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('scheduled');
    expect(response.body.scheduled).toBeGreaterThan(0);
  });
});
```

---

## Expected Outcomes

**Cache Observability**: Full visibility into cache hit rates, storage usage,
and performance

**Operational Control**: Ability to invalidate stale cache entries and warm
cache proactively

**Performance Metrics**: P50/P95/P99 latencies tracked for Redis, PostgreSQL,
and generation

**Monitoring Integration**: Ready for Prometheus/Grafana dashboards

**Quality Gates**:

- TypeScript: 0 new errors
- Lint: 0 errors
- Integration tests passing
- Manual smoke test successful

---

## Next Steps (Future Sessions)

- Prometheus metrics exporter with histograms
- Grafana dashboard for cache visualization
- Cache eviction policies (LRU, size-based)
- Cache size limits and automatic cleanup
- Multi-region cache replication
- Cache pre-warming on server startup

---

## Session Start

Ready to begin Phase 3 Session 5: Cache Statistics & Monitoring.

**Starting with Step 1: Create Cache Routes File**
