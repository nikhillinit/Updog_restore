/**
 * PostgreSQL connection pool with circuit breaker protection
 * Provides resilient database access with automatic failure handling
 */
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { Pool } from 'pg';
import { TypedCircuitBreaker } from '../infra/circuit-breaker/typed-breaker';
import { breakerRegistry } from '../infra/circuit-breaker/breaker-registry';
import { spreadIfDefined } from '@shared/lib/ts/spreadIfDefined';

// PostgreSQL connection pool configuration
const poolConfig = {
  connectionString: process.env['DATABASE_URL'],
  max: parseInt(process.env['PG_POOL_MAX'] || '20', 10),
  idleTimeoutMillis: parseInt(process.env['PG_IDLE_TIMEOUT'] || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env['PG_CONNECT_TIMEOUT'] || '2000', 10),
  statement_timeout: parseInt(process.env['PG_STATEMENT_TIMEOUT'] || '10000', 10),
  query_timeout: parseInt(process.env['PG_QUERY_TIMEOUT'] || '10000', 10),
  // Connection health check
  keepAlive: true,
  keepAliveInitialDelayMillis: 0,
};

// Create the connection pool
export const pool = new Pool(poolConfig);

// Pool event handlers for monitoring
pool['on']('error', (err: any) => {
  console.error('[PG Pool] Unexpected error on idle client:', err);
});

pool['on']('connect', (client: any) => {
  console.log('[PG Pool] New client connected');
});

pool['on']('acquire', (client: any) => {
  console.debug('[PG Pool] Client acquired from pool');
});

pool['on']('remove', (client: any) => {
  console.debug('[PG Pool] Client removed from pool');
});

// Circuit breaker configuration for database operations
const dbBreakerConfig = {
  failureThreshold: parseInt(process.env['CB_DB_FAILURE_THRESHOLD'] || '5', 10),
  resetTimeout: parseInt(process.env['CB_DB_RESET_TIMEOUT_MS'] || '30000', 10),
  operationTimeout: parseInt(process.env['CB_DB_OP_TIMEOUT_MS'] || '10000', 10),
  successesToClose: parseInt(process.env['CB_DB_SUCCESS_TO_CLOSE'] || '3', 10),
  halfOpenMaxConcurrent: parseInt(process.env['CB_DB_HALF_OPEN_MAX_CONC'] || '2', 10),
};

// Create circuit breaker for database operations
const dbBreaker = new TypedCircuitBreaker(dbBreakerConfig);

// Register with the breaker registry for monitoring
breakerRegistry.register('postgres', dbBreaker);

/**
 * Query execution metrics
 */
interface QueryMetrics {
  query: string;
  duration: number;
  rowCount: number;
  error?: Error;
}

const queryMetrics: QueryMetrics[] = [];
const MAX_METRICS = 100;

function recordMetrics(metrics: QueryMetrics) {
  queryMetrics.push(metrics);
  if (queryMetrics.length > MAX_METRICS) {
    queryMetrics.shift();
  }
  
  // Log slow queries
  if (metrics.duration > 1000) {
    console.warn(`[PG] Slow query (${metrics.duration}ms): ${metrics.query.slice(0, 100)}`);
  }
  
  // Log errors
  if (metrics.error) {
    console.error(`[PG] Query error: ${metrics.error.message}`);
  }
}

/**
 * Get query performance metrics
 */
export function getQueryMetrics() {
  const totalQueries = queryMetrics.length;
  const errorQueries = queryMetrics.filter(m => m.error).length;
  const slowQueries = queryMetrics.filter(m => m.duration > 1000).length;
  const avgDuration = queryMetrics.reduce((sum: any, m: any) => sum + m.duration, 0) / totalQueries || 0;
  
  return {
    totalQueries,
    errorQueries,
    slowQueries,
    avgDuration: Math.round(avgDuration),
    recentQueries: queryMetrics.slice(-10),
  };
}

/**
 * Internal query function without circuit breaker
 */
async function _query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  let error: Error | undefined;
  let result: QueryResult<T> | undefined;
  
  try {
    result = await pool.query<T>(text, params);
    return result;
  } catch (err) {
    error = err as Error;
    throw err;
  } finally {
    const duration = Date.now() - start;
    recordMetrics({
      query: text,
      duration,
      rowCount: result?.rowCount || 0,
      ...spreadIfDefined('error', error),
    });
  }
}

/**
 * Execute a query with circuit breaker protection
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  // Skip circuit breaker if disabled
  if (process.env['CB_DB_ENABLED'] === 'false') {
    return _query<T>(text, params);
  }
  
  return dbBreaker.run(
    () => _query<T>(text, params),
    async () => ({ rows: [] as T[], command: '', rowCount: 0, oid: 0, fields: [] })
  );
}

/**
 * Shorthand query function (returns rows only)
 */
export async function q<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

/**
 * Execute a query and return the first row
 */
export async function queryOne<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] || null;
}

/**
 * Execute a query and return a single value
 */
export async function queryScalar<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const row = await queryOne<Record<string, T>>(text, params);
  if (!row) return null;
  
  const keys = Object.keys(row);
  return keys.length > 0 ? row[keys[0]] : null;
}

/**
 * Execute multiple queries in a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute a transaction with circuit breaker protection
 */
export async function transactionWithBreaker<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  // Skip circuit breaker if disabled
  if (process.env['CB_DB_ENABLED'] === 'false') {
    return transaction(callback);
  }
  
  return dbBreaker.run(() => transaction(callback), async () => { throw new Error('Database circuit open during transaction'); });
}

/**
 * Health check for database connection
 */
export async function healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  const start = Date.now();
  
  try {
    await pool.query('SELECT 1');
    return {
      healthy: true,
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      healthy: false,
      error: (error as Error).message,
      latency: Date.now() - start,
    };
  }
}

/**
 * Get pool statistics
 */
export function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

/**
 * Gracefully close the pool
 */
export async function closePool(): Promise<void> {
  await pool.end();
  console.log('[PG Pool] Connection pool closed');
}

/**
 * Exponential backoff utility for retries
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 100,
    maxDelay = 10000,
    factor = 2,
  } = options;
  
  let lastError: Error | undefined;
  let delay = initialDelay;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (i === maxRetries) {
        throw error;
      }
      
      console.log(`[Backoff] Retry ${i + 1}/${maxRetries} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      delay = Math.min(delay * factor, maxDelay);
    }
  }
  
  throw lastError;
}

/**
 * Query with automatic retry on transient failures
 */
export async function queryWithRetry<T extends QueryResultRow = any>(
  text: string,
  params?: any[],
  options?: Parameters<typeof withBackoff>[1]
): Promise<QueryResult<T>> {
  return withBackoff(async () => query<T>(text, params), options);
}

// Export types for external use
export type { QueryResult, PoolClient } from 'pg';



/**
 * Get circuit breaker stats
 */
export function getStats() {
  return dbBreaker.getMetrics();
}

