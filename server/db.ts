/**
 * Database configuration with automatic serverless optimization
 * Uses HTTP driver on Vercel, WebSocket pool elsewhere
 */

import * as schema from '@shared/schema';
import * as lpSchema from '@shared/schema-lp-reporting';
import * as lpSprint3Schema from '@shared/schema-lp-sprint3';
import * as approvalSchema from '@shared/schemas/reserve-approvals';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createRequire } from 'node:module';

// Combined schema for LP reporting + reserve approval support + Sprint 3
const combinedSchema = { ...schema, ...lpSchema, ...lpSprint3Schema, ...approvalSchema };
type CombinedSchema = typeof schema &
  typeof lpSchema &
  typeof lpSprint3Schema &
  typeof approvalSchema;

// ESM-safe require for conditional imports
const require = createRequire(import.meta.url);

// Detect test environment
const isTest = process.env['NODE_ENV'] === 'test' || process.env['VITEST'] === 'true';

// Detect if running on Vercel
const isVercel = process.env['VERCEL'] === '1' || process.env['VERCEL_ENV'];

// Dynamic imports based on environment
let db: NodePgDatabase<CombinedSchema>;
let pool: unknown;

// Use mock database in test environment
if (isTest) {
  // Import the database mock for testing
  const { databaseMock } = require('../tests/helpers/database-mock') as {
    databaseMock: NodePgDatabase<CombinedSchema>;
  };
  db = databaseMock;
  pool = null;
} else if (isVercel) {
  // Use HTTP driver for Vercel (no persistent connections)
  const { drizzle } = require('drizzle-orm/neon-http') as {
    drizzle: (
      client: unknown,
      options: { schema: typeof combinedSchema }
    ) => NodePgDatabase<CombinedSchema>;
  };
  const { neon } = require('@neondatabase/serverless') as {
    neon: (url: string) => unknown;
  };

  const DATABASE_URL = process.env['DATABASE_URL'] || process.env['NEON_DATABASE_URL'];

  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL or NEON_DATABASE_URL environment variable is required');
  }

  const sql = neon(DATABASE_URL);
  db = drizzle(sql, { schema: combinedSchema });

  // No pool in HTTP mode
  pool = null;
} else {
  // Use WebSocket pool for development and traditional hosting
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');
  const ws = await import('ws');

  neonConfig.webSocketConstructor = ws;

  if (!process.env['DATABASE_URL']) {
    console.warn('DATABASE_URL not set - using mock mode for API testing');
    process.env['DATABASE_URL'] = 'postgresql://mock:mock@localhost:5432/mock';
  }

  pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  // @ts-expect-error - Neon Pool type doesn't perfectly align with drizzle neon-serverless signature
  db = drizzle(pool, { schema: combinedSchema });
}

export { db, pool };
