#!/usr/bin/env node
/**
 * Scenario-family drift apply helper (M8 prod gap).
 *
 * Prod was built via db:push and never received the scenario tables; the
 * journaled drift migrations 0009/0010/0011 are fully IF NOT EXISTS-guarded
 * and safe to replay narrowly. Do NOT run db:migrate against prod (0000 is
 * unguarded) and never db:push against prod.
 *
 * Scope note: 0011 is applied IN FULL, so beyond the scenario family this
 * also creates the guarded share/sensitivity drift objects it contains
 * (shares, share_snapshots, share_analytics, scenario_matrices,
 * sensitivity_runs, optimization_sessions, snapshot_versions). All are
 * schema-truth per shared/schema and no-ops where present; the audit below
 * checks every table this script can create. Applied to prod 2026-06-11.
 *
 * Default mode is audit-only:
 *   DATABASE_URL=<prod> node scripts/apply-scenario-drift-migrations.mjs
 *
 * Apply mode requires explicit confirmation:
 *   DATABASE_URL=<prod> node scripts/apply-scenario-drift-migrations.mjs --apply --yes
 */

import { config } from 'dotenv';
config({ quiet: true });

import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MIGRATION_FILES = [
  'migrations/0009_fund_snapshots_scenario_set_id.sql',
  'migrations/0010_fund_scenario_sets.sql',
  'migrations/0011_scenario_share_sensitivity_drift.sql',
];

// Every table a full run of 0009/0010/0011 can create (scenario family
// first, then the share/sensitivity drift objects bundled in 0011).
const EXPECTED_TABLES = [
  'fund_scenario_sets',
  'fund_scenario_variants',
  'fund_scenario_set_events',
  'fund_scenario_calculation_runs',
  'shares',
  'share_snapshots',
  'share_analytics',
  'scenario_matrices',
  'sensitivity_runs',
  'optimization_sessions',
  'snapshot_versions',
];

const args = new Set(process.argv.slice(2));
const applyMode = args.has('--apply');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || databaseUrl === 'memory://') {
  console.error('DATABASE_URL is missing or memory:// — set it to the target database.');
  process.exit(1);
}
if (applyMode && !args.has('--yes')) {
  console.error('--apply requires --yes to confirm a schema mutation.');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function audit(client) {
  const rows = [];
  for (const table of EXPECTED_TABLES) {
    const res = await client.query('SELECT to_regclass($1) AS reg', [`public.${table}`]);
    rows.push({ object: table, present: res.rows[0].reg !== null });
  }
  const col = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'fund_snapshots' AND column_name = 'scenario_set_id'`
  );
  rows.push({ object: 'fund_snapshots.scenario_set_id', present: col.rowCount > 0 });
  return rows;
}

function printAudit(label, rows) {
  console.log(`\n${label}`);
  for (const row of rows) {
    console.log(`  ${row.present ? 'PRESENT' : 'MISSING'}  ${row.object}`);
  }
}

async function applyMigrations(client) {
  for (const relPath of MIGRATION_FILES) {
    const sql = await readFile(resolve(repoRoot, relPath), 'utf8');
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    console.log(`\nApplying ${relPath} (${statements.length} statements)`);
    for (const statement of statements) {
      await client.query(statement);
    }
  }
}

const client = await pool.connect();
try {
  const before = await audit(client);
  printAudit('Audit (before):', before);

  if (!applyMode) {
    console.log('\nAudit-only mode. Re-run with --apply --yes to apply the migrations.');
  } else {
    await client.query('BEGIN');
    try {
      await applyMigrations(client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
    const after = await audit(client);
    printAudit('Audit (after):', after);
    const missing = after.filter((row) => !row.present);
    if (missing.length > 0) {
      console.error(`\nFAIL: ${missing.length} expected object(s) still missing.`);
      process.exit(1);
    }
    console.log('\nPASS: all scenario-family objects present.');
  }
} finally {
  client.release();
  await pool.end();
}
