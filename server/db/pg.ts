/**
 * PostgreSQL Pool with Performance Monitoring
 * Tracks slow queries, connection metrics, and statement timeouts
 */
import { Pool, PoolClient, QueryResult } from 'pg';
import { Histogram, Counter, Gauge } from 'prom-client';

// Metrics for monitoring
const queryDuration = new Histogram({
  name: 'pg_query_duration_seconds',
  help: 'PostgreSQL query duration in seconds',
  labelNames: ['query_type', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const slowQueryCounter = new Counter({
  name: 'pg_slow_queries_total',
  help: 'Total number of slow queries (>1s)',
  labelNames: ['query_type'],
});

const activeConnections = new Gauge({
  name: 'pg_pool_connections_active',
  help: 'Number of active database connections',
});

const idleConnections = new Gauge({
  name: 'pg_pool_connections_idle',
  help: 'Number of idle database connections',
});

const waitingClients = new Gauge({
  name: 'pg_pool_clients_waiting',
  help: 'Number of clients waiting for a connection',
});

const queryErrors = new Counter({
  name: 'pg_query_errors_total',
  help: 'Total number of query errors',
  labelNames: ['error_type'],
});

// Configuration
const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_MS || '1000');
const STATEMENT_TIMEOUT_MS = parseInt(process.env.STATEMENT_TIMEOUT_MS || '5000');
const LOCK_TIMEOUT_MS = parseInt(process.env.LOCK_TIMEOUT_MS || '3000');
const IDLE_TRANSACTION_TIMEOUT_MS = parseInt(process.env.IDLE_TRANSACTION_TIMEOUT_MS || '10000');

// Create optimized pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  
  // Pool sizing - tuned for production
  max: parseInt(process.env.DB_POOL_MAX || '20'),
  min: parseInt(process.env.DB_POOL_MIN || '2'),
  
  // Connection management
  idleTimeoutMillis: 30000,              // Release idle connections after 30s
  connectionTimeoutMillis: 2000,          // Fail fast on connection attempts
  
  // Query timeout (if supported by server)
  query_timeout: STATEMENT_TIMEOUT_MS,
  
  // Application identification
  application_name: 'updog-api',
  
  // Allow process to exit
  allowExitOnIdle: true,
});

// Configure connections on creation
pool.on('connect', async (client: PoolClient) => {
  try {
    // Set statement timeout
    await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    
    // Set lock timeout
    await client.query(`SET lock_timeout = ${LOCK_TIMEOUT_MS}`);
    
    // Set idle transaction timeout
    await client.query(`SET idle_in_transaction_session_timeout = ${IDLE_TRANSACTION_TIMEOUT_MS}`);
    
    // Optimize for OLTP workloads
    await client.query('SET work_mem = "8MB"');
    await client.query('SET effective_cache_size = "1GB"');
    
    // Enable query timing for better metrics
    await client.query('SET track_io_timing = ON');
    
    // Set timezone to UTC for consistency
    await client.query("SET timezone = 'UTC'");
    
    console.log('[PG] Connection configured with timeouts and optimizations');
  } catch (error) {
    console.error('[PG] Failed to configure connection:', error);
  }
});

// Monitor pool errors
pool.on('error', (err: Error, client: PoolClient) => {
  console.error('[PG] Unexpected error on idle client:', err);
  queryErrors.inc({ error_type: 'pool_error' });
});

// Update connection metrics periodically
setInterval(() => {
  activeConnections.set(pool.totalCount - pool.idleCount);
  idleConnections.set(pool.idleCount);
  waitingClients.set(pool.waitingCount);
}, 5000);

/**
 * Extract query type from SQL for metrics
 */
function getQueryType(sql: string): string {
  const query = sql.trim().toUpperCase();
  if (query.startsWith('SELECT')) return 'SELECT';
  if (query.startsWith('INSERT')) return 'INSERT';
  if (query.startsWith('UPDATE')) return 'UPDATE';
  if (query.startsWith('DELETE')) return 'DELETE';
  if (query.startsWith('BEGIN')) return 'TRANSACTION';
  if (query.startsWith('COMMIT')) return 'TRANSACTION';
  if (query.startsWith('ROLLBACK')) return 'TRANSACTION';
  return 'OTHER';
}

/**
 * Format query for logging (truncate and sanitize)
 */
function formatQueryForLog(sql: string, maxLength = 100): string {
  // Remove excessive whitespace
  const cleaned = sql.replace(/\s+/g, ' ').trim();
  
  // Truncate if needed
  if (cleaned.length > maxLength) {
    return cleaned.substring(0, maxLength) + '...';
  }
  
  return cleaned;
}

/**
 * Execute query with monitoring and metrics
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const queryType = getQueryType(text);
  let client: PoolClient | undefined;
  
  try {
    // Get client from pool
    client = await pool.connect();
    
    // Execute query
    const result = await client.query<T>(text, params);
    
    // Calculate duration
    const duration = Date.now() - start;
    const durationSeconds = duration / 1000;
    
    // Record metrics
    queryDuration.observe({ query_type: queryType, status: 'success' }, durationSeconds);
    
    // Log slow queries
    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      slowQueryCounter.inc({ query_type: queryType });
      console.warn('[PG] Slow query detected:', {
        duration_ms: duration,
        query: formatQueryForLog(text),
        type: queryType,
        threshold_ms: SLOW_QUERY_THRESHOLD_MS,
      });
    }
    
    return result;
  } catch (error: any) {
    const duration = Date.now() - start;
    const durationSeconds = duration / 1000;
    
    // Record error metrics
    queryDuration.observe({ query_type: queryType, status: 'error' }, durationSeconds);
    
    // Categorize error
    let errorType = 'unknown';
    if (error.code === '57014') errorType = 'timeout';
    else if (error.code === '40001') errorType = 'serialization';
    else if (error.code === '23505') errorType = 'unique_violation';
    else if (error.code === '23503') errorType = 'foreign_key';
    else if (error.code === '53300') errorType = 'too_many_connections';
    
    queryErrors.inc({ error_type: errorType });
    
    // Enhanced error logging
    console.error('[PG] Query error:', {
      duration_ms: duration,
      query: formatQueryForLog(text),
      error: error.message,
      code: error.code,
      type: queryType,
    });
    
    throw error;
  } finally {
    // Always release client back to pool
    if (client) {
      client.release();
    }
  }
}

/**
 * Execute query within a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  const start = Date.now();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    
    const duration = Date.now() - start;
    queryDuration.observe({ query_type: 'TRANSACTION', status: 'success' }, duration / 1000);
    
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    
    const duration = Date.now() - start;
    queryDuration.observe({ query_type: 'TRANSACTION', status: 'error' }, duration / 1000);
    queryErrors.inc({ error_type: 'transaction_rollback' });
    
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get pool statistics
 */
export function getPoolStats() {
  return {
    total: pool.totalCount,
    active: pool.totalCount - pool.idleCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    max: pool.options.max,
    min: pool.options.min,
  };
}

/**
 * Health check for database connection
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await query('SELECT 1 as health');
    return result.rows[0]?.health === 1;
  } catch (error) {
    console.error('[PG] Health check failed:', error);
    return false;
  }
}

/**
 * Get slow query statistics
 */
export async function getSlowQueryStats() {
  try {
    // Query pg_stat_statements if available
    const result = await query(`
      SELECT 
        query,
        calls,
        mean_exec_time,
        max_exec_time,
        total_exec_time
      FROM pg_stat_statements
      WHERE mean_exec_time > $1
      ORDER BY mean_exec_time DESC
      LIMIT 10
    `, [SLOW_QUERY_THRESHOLD_MS]);
    
    return result.rows;
  } catch (error: any) {
    // pg_stat_statements might not be enabled
    if (error.code === '42P01') {
      return [];
    }
    throw error;
  }
}

/**
 * Graceful shutdown
 */
export async function closePool(): Promise<void> {
  try {
    await pool.end();
    console.log('[PG] Database pool closed gracefully');
  } catch (error) {
    console.error('[PG] Error closing database pool:', error);
    throw error;
  }
}

// Export wrapped query function for compatibility
export const q = query;

// Export pool for advanced usage
export { pool as pgPool };