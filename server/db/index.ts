/**
 * Unified database utilities with circuit breaker protection
 * Exports PostgreSQL and Redis clients with resilience patterns
 */

// Drizzle ORM exports
export { db } from './pool';

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
