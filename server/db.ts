/**
 * Database configuration with automatic serverless optimization.
 * Uses HTTP driver on Vercel, node-postgres for local Postgres, and
 * Neon WebSocket pool for remote Neon-style connection strings.
 */

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { neon as createNeonHttpClient } from '@neondatabase/serverless';
import { drizzle as drizzleNeonHttp } from 'drizzle-orm/neon-http';
import { createRequire } from 'node:module';
import { getStorageConfigurationError, resolveStorageBootMode } from './storage-runtime-policy';
import { combinedSchema, type CombinedSchema } from './db-schema';
import { shouldUseNodePostgresDriver } from './db-driver-selection';

// ESM-safe require for conditional imports
const require = createRequire(import.meta.url);

// Detect if running on Vercel
const isVercel = process.env['VERCEL'] === '1' || process.env['VERCEL_ENV'];
const storageBootMode = resolveStorageBootMode(process.env);

// Dynamic imports based on environment
let db: NodePgDatabase<CombinedSchema>;
let pool: unknown;

async function loadDatabaseMock(): Promise<NodePgDatabase<CombinedSchema>> {
  // Import the database mock for testing
  const vitestMockPath = '../tests/helpers/database-mock';
  const mockModule = (
    process.env['VITEST'] === 'true'
      ? await import(vitestMockPath)
      : require('../tests/helpers/database-mock.cjs')
  ) as {
    databaseMock: NodePgDatabase<CombinedSchema>;
  };
  return mockModule.databaseMock;
}

// Use mock database in test environment and explicit dev memory mode
if (storageBootMode === 'test-mock-db' || storageBootMode === 'explicit-memory') {
  db = await loadDatabaseMock();
  pool = null;
} else if (isVercel) {
  // Use HTTP driver for Vercel (no persistent connections)
  const DATABASE_URL = process.env['DATABASE_URL'] || process.env['NEON_DATABASE_URL'];

  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL or NEON_DATABASE_URL environment variable is required');
  }

  const sql = createNeonHttpClient(DATABASE_URL);
  db = drizzleNeonHttp(sql, {
    schema: combinedSchema,
  }) as unknown as NodePgDatabase<CombinedSchema>;

  // No pool in HTTP mode
  pool = null;
} else {
  const connectionString = process.env['DATABASE_URL'] || process.env['NEON_DATABASE_URL'];
  if (!connectionString) {
    throw new Error(getStorageConfigurationError(process.env));
  }

  if (shouldUseNodePostgresDriver(connectionString)) {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');

    const pgPool = new Pool({
      connectionString,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 30000,
      allowExitOnIdle: true,
    });
    pool = pgPool;
    db = drizzle(pgPool, { schema: combinedSchema });
  } else {
    const { Pool, neonConfig } = await import('@neondatabase/serverless');
    const { drizzle } = await import('drizzle-orm/neon-serverless');
    const ws = await import('ws');

    neonConfig.webSocketConstructor = ws;

    pool = new Pool({ connectionString });
    // @ts-expect-error - Neon Pool type doesn't perfectly align with drizzle neon-serverless signature
    db = drizzle(pool, { schema: combinedSchema });
  }
}

export { db, pool };
