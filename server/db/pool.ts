/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
 

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { logger } from './logger';

// Parse connection string to get database name
const dbName = process.env['DATABASE_URL']?.split('/').pop()?.split('?')[0] || 'unknown';

// Optimized pool configuration
export const pool = new Pool({
  connectionString: process.env['DATABASE_URL'],
  
  // Pool sizing (adjust based on your server capacity)
  max: parseInt(process.env['DB_POOL_MAX'] || '20'),
  min: parseInt(process.env['DB_POOL_MIN'] || '2'),
  
  // Timeouts
  idleTimeoutMillis: 30000,              // Release idle connections after 30s
  connectionTimeoutMillis: 2000,          // Fail fast on connection attempts
  
  // Query timeouts (set in connection, not pool)
  application_name: 'fund-store-api',
  
  // Allow process to exit even with active connections
  allowExitOnIdle: true,
});

// Set up connection configuration
pool['on']('connect', (client: any) => {
  // Set statement timeout for all queries
  client.query('SET statement_timeout = 5000');        // 5 second timeout
  client.query('SET lock_timeout = 3000');             // 3 second lock timeout
  client.query('SET idle_in_transaction_session_timeout = 10000'); // 10s idle transaction timeout
  
  // Set work_mem for better query performance
  client.query('SET work_mem = "8MB"');
  
  // Enable query timing
  client.query('SET track_io_timing = ON');
});

// Monitor pool health
pool['on']('error', (err: any, _client: any) => {
  logger.error('Database pool error', { err, database: dbName });
});

// Export pool metrics
export function getPoolMetrics() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount, 
    waiting: pool.waitingCount,
    database: dbName
  };
}

// Graceful shutdown
export async function closePool() {
  try {
    await pool["end"]();
    logger.info('Database pool closed', { database: dbName });
  } catch (error) {
    logger.error('Error closing database pool', { error, database: dbName });
  }
}

export const db = drizzle(pool);

