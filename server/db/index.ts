/**
 * Unified database utilities with circuit breaker protection
 * Exports PostgreSQL and Redis clients with resilience patterns
 */

// Drizzle ORM exports
import { db as dbInstance } from './pool';
// @ts-expect-error TS2459: NodePgDatabase is declared in pool.ts but not explicitly exported.
// This is a known type resolution issue - the runtime behavior is correct, but TypeScript
// cannot resolve the type through the module boundary. Fixing this by re-exporting from
// pool.ts causes cascade failures in scenario-comparison.ts where CaseType resolves to never.
// Workaround: Accept this type error as documented technical debt until Drizzle ORM upgrade.
import type { NodePgDatabase } from './pool';
import type * as schema from '@shared/schema';

export const db: NodePgDatabase<typeof schema> = dbInstance;
export type { NodePgDatabase };

// PostgreSQL exports
export {
  pool as pgPool,
  query,
  q,
  queryOne,
  queryScalar,
  transaction,
  transactionWithBreaker,
  healthCheck as pgHealthCheck,
  getPoolStats,
  closePool,
  withBackoff as pgWithBackoff,
  queryWithRetry,
  getQueryMetrics,
  type QueryResult,
  type PoolClient,
} from './pg-circuit';

// Redis exports
export {
  get as redisGet,
  set as redisSet,
  del as redisDel,
  getJSON as redisGetJSON,
  setJSON as redisSetJSON,
  incr as redisIncr,
  expire as redisExpire,
  healthCheck as redisHealthCheck,
  clearMemoryCache,
  closeRedis,
  getCacheMetrics,
  withBackoff as redisWithBackoff,
  redis as redisClient,
} from './redis-circuit';

// Default cache operations (for backward compatibility)
import cache from './redis-circuit';
export { cache };

/**
 * Combined health check for all database connections
 */
export async function checkDatabaseHealth() {
  const [pgHealth, redisHealth] = await Promise.all([
    import('./pg-circuit').then((m) => m.healthCheck()),
    import('./redis-circuit').then((m) => m.healthCheck()),
  ]);

  return {
    postgres: pgHealth,
    redis: redisHealth,
    healthy: pgHealth.healthy && redisHealth.healthy,
  };
}

/**
 * Gracefully shutdown all database connections
 */
export async function shutdownDatabases() {
  console.log('[DB] Shutting down database connections...');

  await Promise.all([
    import('./pg-circuit').then((m) => m.closePool()),
    import('./redis-circuit').then((m) => m.closeRedis()),
  ]);

  console.log('[DB] All database connections closed');
}
