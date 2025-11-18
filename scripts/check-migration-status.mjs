#!/usr/bin/env node
/**
 * Check if portfolio schema hardening migration is needed
 */

// Load environment variables BEFORE any database imports
import { config } from 'dotenv';
config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

async function checkMigrationStatus() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const client = await pool.connect();

  try {
    console.log('[CHECK] Verifying database schema status...\n');

    // Check 1: Version column types
    console.log('[CHECK 1] Version column data types');
    const versionColumns = await client.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_name IN ('forecast_snapshots', 'investment_lots', 'reserve_allocations')
        AND column_name = 'version'
      ORDER BY table_name;
    `);

    versionColumns.rows.forEach(row => {
      const status = row.data_type === 'bigint' ? 'PASS' : 'FAIL';
      console.log(`  [${status}] ${row.table_name}.version: ${row.data_type}`);
    });

    // Check 2: Cursor pagination indexes
    console.log('\n[CHECK 2] Cursor pagination indexes');
    const cursorIndexes = await client.query(`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE tablename IN ('forecast_snapshots', 'investment_lots', 'reserve_allocations')
        AND indexname LIKE '%cursor%'
      ORDER BY tablename;
    `);

    if (cursorIndexes.rows.length === 0) {
      console.log('  [FAIL] No cursor indexes found');
    } else {
      cursorIndexes.rows.forEach(row => {
        console.log(`  [PASS] ${row.indexname}`);
      });
    }

    // Check 3: Scoped idempotency indexes
    console.log('\n[CHECK 3] Scoped idempotency indexes');
    const idemIndexes = await client.query(`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE tablename IN ('forecast_snapshots', 'investment_lots', 'reserve_allocations')
        AND (indexname LIKE '%idem%' OR indexname LIKE '%idempotency%')
      ORDER BY tablename;
    `);

    if (idemIndexes.rows.length === 0) {
      console.log('  [WARN] No idempotency indexes found');
    } else {
      idemIndexes.rows.forEach(row => {
        const hasParentScope = row.indexdef.includes('fund_id') ||
                              row.indexdef.includes('investment_id') ||
                              row.indexdef.includes('snapshot_id');
        const status = hasParentScope ? 'PASS' : 'WARN';
        console.log(`  [${status}] ${row.indexname}`);
        if (!hasParentScope) {
          console.log(`    -> Missing parent entity scope`);
        }
      });
    }

    // Summary
    const allVersionsBigint = versionColumns.rows.every(row => row.data_type === 'bigint');
    const hasCursorIndexes = cursorIndexes.rows.length >= 3;
    const hasIdemIndexes = idemIndexes.rows.length >= 3;

    console.log('\n[SUMMARY]');
    console.log(`  Version columns bigint: ${allVersionsBigint ? 'PASS' : 'FAIL'}`);
    console.log(`  Cursor pagination indexes: ${hasCursorIndexes ? 'PASS' : 'FAIL'} (${cursorIndexes.rows.length}/3)`);
    console.log(`  Scoped idempotency indexes: ${hasIdemIndexes ? 'PASS' : 'WARN'} (${idemIndexes.rows.length}/3)`);

    const needsMigration = !allVersionsBigint || !hasCursorIndexes || !hasIdemIndexes;
    console.log(`\n[RESULT] Migration needed: ${needsMigration ? 'YES' : 'NO'}`);

    return needsMigration;
  } finally {
    client.release();
    await pool.end();
  }
}

checkMigrationStatus()
  .then((needsMigration) => {
    process.exit(needsMigration ? 1 : 0);
  })
  .catch((error) => {
    console.error('\n[ERROR]', error.message);
    process.exit(2);
  });
