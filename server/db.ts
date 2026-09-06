/**
 * Database configuration with automatic serverless optimization.
 * Uses Neon WebSocket pool on Vercel, node-postgres for local Postgres, and
 * Neon WebSocket pool for remote Neon-style connection strings.
 */

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool as NodePostgresPool, PoolClient as NodePostgresPoolClient } from 'pg';
import { createRequire } from 'node:module';
import {
  applyRLSContext,
  getRequestDatabaseScope,
  requestDatabaseStorage,
  type RequestDatabaseScope,
} from './db/request-context';
import type { UserContext } from './lib/secure-context';
import { logger } from './lib/logger';
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
let createClientDatabase: (client: NodePostgresPoolClient) => NodePgDatabase<CombinedSchema>;
let isClosingNodePostgresPool = false;

function isExpectedNodePostgresCloseError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  const message = error instanceof Error ? error.message : String(error);
  return code === '57P01' || /terminating connection due to administrator command/i.test(message);
}

function handleNodePostgresPoolError(error: unknown): void {
  if (isClosingNodePostgresPool && isExpectedNodePostgresCloseError(error)) {
    return;
  }
  throw error;
}

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
  createClientDatabase = () => {
    throw new Error('No database driver in memory mode');
  };
} else if (isVercel) {
  // Use Neon WebSocket pool for Vercel transaction support.
  const connectionString = process.env['DATABASE_URL'] || process.env['NEON_DATABASE_URL'];

  if (!connectionString) {
    throw new Error('DATABASE_URL or NEON_DATABASE_URL environment variable is required');
  }

  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');
  const ws = await import('ws');

  // The ws module namespace is not the constructor; passing it makes every
  // non-localhost WebSocket connection fail with "fetch failed".
  neonConfig.webSocketConstructor = ws.default;

  const neonPool = new Pool({ connectionString });
  // Idle WebSocket failures emit 'error' on the pool; unhandled, they crash
  // the process. Surface them without dying - the pool replaces connections.
  neonPool.on('error', (error: Error) => {
    logger.error({ err: error }, 'Neon pool error (Vercel)');
  });
  pool = neonPool;
  db = drizzle(neonPool, { schema: combinedSchema });
  createClientDatabase = (client) =>
    drizzle(client as unknown as import('@neondatabase/serverless').PoolClient, {
      schema: combinedSchema,
    });
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
    }) as NodePostgresPool;
    pgPool.on('connect', (client: NodePostgresPoolClient) => {
      client.on('error', handleNodePostgresPoolError);
    });
    pgPool.on('error', handleNodePostgresPoolError);
    pool = pgPool;
    db = drizzle(pgPool, { schema: combinedSchema });
    createClientDatabase = (client) => drizzle(client, { schema: combinedSchema });
  } else {
    const { Pool, neonConfig } = await import('@neondatabase/serverless');
    const { drizzle } = await import('drizzle-orm/neon-serverless');
    const ws = await import('ws');

    // See the Vercel branch above: the constructor lives on ws.default.
    neonConfig.webSocketConstructor = ws.default;

    const neonPool = new Pool({ connectionString });
    neonPool.on('error', (error: Error) => {
      logger.error({ err: error }, 'Neon pool error');
    });
    pool = neonPool;
    db = drizzle(neonPool, { schema: combinedSchema });
    createClientDatabase = (client) =>
      drizzle(client as unknown as import('@neondatabase/serverless').PoolClient, {
        schema: combinedSchema,
      });
  }
}

const baseDatabase = db;
db = new Proxy(baseDatabase, {
  get(target, property) {
    const database = getRequestDatabaseScope()?.db ?? target;
    const value: unknown = Reflect.get(database, property, database);
    return typeof value === 'function' ? (value.bind(database) as unknown) : value;
  },
});

export { createClientDatabase };

/** Own a durable transaction on the selected primary driver, including in background jobs. */
export async function runWithDatabaseContext<T>(
  context: UserContext,
  callback: (database: NodePgDatabase<CombinedSchema>, client: NodePostgresPoolClient) => Promise<T>
): Promise<T> {
  if (!pool) throw new Error('A PostgreSQL connection is required');
  const client = await (pool as NodePostgresPool).connect();
  let scope: RequestDatabaseScope | undefined;
  try {
    return await createClientDatabase(client).transaction(async (tx) => {
      await applyRLSContext(client, context);
      scope = {
        context: { ...context },
        db: tx,
        client,
        completed: false,
        runOwnedTransaction: (operation) =>
          runWithDatabaseContext(context, (_db, owned) => operation(owned)),
      };
      return requestDatabaseStorage.run(scope, () => callback(tx, client));
    });
  } finally {
    if (scope) scope.completed = true;
    client.release();
  }
}

export async function closeDatabasePool(): Promise<void> {
  if (!pool || typeof (pool as { end?: unknown }).end !== 'function') {
    return;
  }
  isClosingNodePostgresPool = true;
  await (pool as { end: () => Promise<void> }).end();
}

export { db, pool };
