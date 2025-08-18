/**
 * PostgreSQL Query Wrapper with Circuit Breaker
 * Combines monitoring with circuit breaker pattern
 */
import { query as pgQuery, transaction as pgTransaction, getPoolStats, healthCheck, closePool } from './pg';
import { createCircuitBreaker } from '../infra/circuit-breaker';

// Create circuit breaker for database operations
const dbBreaker = createCircuitBreaker('postgres', {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 10,
});

/**
 * Execute query with circuit breaker protection
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<any> {
  // Skip circuit breaker if disabled
  if (process.env.CB_DB_ENABLED === 'false') {
    return pgQuery<T>(text, params);
  }
  
  return dbBreaker.execute(() => pgQuery<T>(text, params));
}

/**
 * Execute transaction with circuit breaker protection
 */
export async function transaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  // Skip circuit breaker if disabled
  if (process.env.CB_DB_ENABLED === 'false') {
    return pgTransaction(callback);
  }
  
  return dbBreaker.execute(() => pgTransaction(callback));
}

// Re-export other functions
export { getPoolStats, healthCheck, closePool };

// Export wrapped query as q for compatibility
export const q = query;

// Export circuit breaker for monitoring
export { dbBreaker };