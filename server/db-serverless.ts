/**
 * Serverless-optimized database configuration
 * Uses HTTP driver for Vercel Functions to avoid connection exhaustion
 */

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from '@schema';

// Determine which database URL to use
const DATABASE_URL = process.env['DATABASE_URL'] || process.env['NEON_DATABASE_URL'];

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL or NEON_DATABASE_URL environment variable is required');
}

// Create HTTP client (no persistent connections)
export const sql = neon(DATABASE_URL);

// Create Drizzle instance with HTTP driver
export const db = drizzle(sql, { schema });

// Optional: Connection check for health endpoints
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  }
}

// Export for compatibility with existing code
export default db;