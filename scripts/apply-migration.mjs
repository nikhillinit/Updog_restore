#!/usr/bin/env node
/**
 * Apply SQL migration file directly to database
 * Usage: node scripts/apply-migration.mjs <migration-file>
 */

// Load environment variables BEFORE any database imports
import { config } from 'dotenv';
config();

import { readFile } from 'fs/promises';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

async function applyMigration(migrationFile) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  let client = await pool.connect();

  try {
    console.log('[MIGRATION] Connected to database');
    console.log('[SUCCESS] Client acquired from pool');

    console.log(`[MIGRATION] Reading file: ${migrationFile}`);
    const migrationPath = resolve(__dirname, '..', migrationFile);
    const sql = await readFile(migrationPath, 'utf8');

    console.log('[MIGRATION] Parsing SQL statements...');

    // Split SQL into statements, handling:
    // 1. Transaction blocks (BEGIN...COMMIT)
    // 2. CREATE INDEX CONCURRENTLY (must be outside transactions)
    // 3. DO blocks (PL/pgSQL)
    const statements = parseSqlStatements(sql);

    console.log('[INFO] Migration contains', statements.length, 'statement groups');

    // Execute each statement/block
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt.trim().length === 0) continue;

      console.log(`[MIGRATION] Executing statement ${i + 1}/${statements.length}...`);
      console.log(`[DEBUG] Statement preview: ${stmt.substring(0, 100)}...`);

      // For CONCURRENTLY operations, strip the keyword since Neon serverless doesn't support it
      // CONCURRENTLY is an optimization for production to avoid blocking, but adds complexity
      // For Neon serverless WebSocket connections, we can create indexes without it
      if (stmt.includes('CONCURRENTLY')) {
        console.log('[WARN] CONCURRENTLY detected - removing for Neon compatibility');
        console.log('[INFO] Creating index without CONCURRENTLY (acceptable for small tables)');
        const modifiedStmt = stmt.replace(/CONCURRENTLY\s+/g, '');
        await client.query(modifiedStmt);
        console.log(`[SUCCESS] Statement ${i + 1} completed (without CONCURRENTLY)`);
      } else {
        await client.query(stmt);
        console.log(`[SUCCESS] Statement ${i + 1} completed`);
      }
    }

    console.log('[SUCCESS] Migration applied successfully');
    return true;
  } catch (error) {
    console.error('[FAIL] Migration failed:', error.message);
    console.error('[FAIL] Full error:', error);
    if (error.code) {
      console.error('[ERROR CODE]', error.code);
    }
    if (error.detail) {
      console.error('[DETAIL]', error.detail);
    }
    if (error.stack) {
      console.error('[STACK]', error.stack);
    }
    throw error;
  } finally {
    if (client) {
      try {
        client.release();
      } catch (e) {
        // Client may already be released
        console.log('[INFO] Client already released');
      }
    }
    await pool.end();
    console.log('[INFO] Database connection closed');
  }
}

/**
 * Parse SQL into executable statement groups
 * Handles transaction blocks, CONCURRENTLY operations, and DO blocks
 */
function parseSqlStatements(sql) {
  const statements = [];
  const lines = sql.split('\n');
  let currentStmt = '';
  let inTransaction = false;
  let inDoBlock = false;
  let dollarQuoteTag = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines at top level
    if (!inTransaction && !inDoBlock && (trimmed.startsWith('--') || trimmed.length === 0)) {
      continue;
    }

    // Track DO blocks (PL/pgSQL)
    if (trimmed.startsWith('DO $$')) {
      inDoBlock = true;
      dollarQuoteTag = '$$';
    }

    // Track transaction boundaries
    if (trimmed === 'BEGIN;') {
      inTransaction = true;
    }

    currentStmt += line + '\n';

    // End of DO block
    if (inDoBlock && dollarQuoteTag && trimmed === 'END ' + dollarQuoteTag + ';') {
      statements.push(currentStmt.trim());
      currentStmt = '';
      inDoBlock = false;
      dollarQuoteTag = null;
      continue;
    }

    // End of transaction block
    if (inTransaction && trimmed === 'COMMIT;') {
      statements.push(currentStmt.trim());
      currentStmt = '';
      inTransaction = false;
      continue;
    }

    // Single statement (not in transaction or DO block)
    if (!inTransaction && !inDoBlock && trimmed.endsWith(';')) {
      // Special handling for SET, RESET, CREATE INDEX CONCURRENTLY, ALTER TABLE
      if (trimmed.startsWith('SET ') ||
          trimmed.startsWith('RESET ') ||
          trimmed.includes('CONCURRENTLY') ||
          trimmed.startsWith('ALTER TABLE') ||
          trimmed.startsWith('CREATE ') ||
          trimmed.startsWith('DROP ')) {
        statements.push(currentStmt.trim());
        currentStmt = '';
      }
    }
  }

  // Add any remaining statement
  if (currentStmt.trim().length > 0) {
    statements.push(currentStmt.trim());
  }

  return statements;
}

// Get migration file from command line
const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('[FAIL] Usage: node scripts/apply-migration.mjs <migration-file>');
  process.exit(1);
}

console.log('[START] Migration script starting...');
console.log('[INFO] Migration file:', migrationFile);
console.log('[INFO] DATABASE_URL set:', !!process.env.DATABASE_URL);

applyMigration(migrationFile)
  .then(() => {
    console.log('\n[COMPLETE] Migration process finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n[FAIL] Migration process failed');
    console.error('[ERROR]', error);
    process.exit(1);
  });
