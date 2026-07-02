#!/usr/bin/env node
// READ-ONLY prod audit for the s8.1 operator seam.
// Plan: ~/.claude/plans/EXECUTE-s81-operator-seam.md (slice 0b); ADR-023.
//
// Collects, in one pass against the Neon DIRECT endpoint:
//   1. Presence + validity of the 3 old GLOBAL idempotency unique indexes and
//      their 3 SCOPED replacements (pg_index.indisvalid / indisready).
//   2. Presence of the 2 fund_snapshots FKs under BOTH name styles
//      (drizzle `_fk` and PG-default `_fkey`) plus convalidated.
//   3. Presence of job_outbox_status_check (+ any `%status_check` variant).
//   4. Full public-schema FK-name inventory (63-byte truncation flagged).
//   5. D1 deciding evidence: orphan counts (NOT EXISTS, non-NULL only),
//      distinct job_outbox.status values vs the 0005 CHECK list, duplicate
//      scoped-idempotency-key groups (predicate mirrors the partial indexes).
//   6. Row counts for lock-strategy sizing.
//
// Safety: refuses pooler URLs; forces default_transaction_read_only=on;
// 30s statement_timeout; connection string from env only and never echoed;
// output is a single atomic JSON artifact with a `completed` marker so a
// partial run can never be mistaken for a complete one.
//
// Usage: DATABASE_URL=postgres://... node scripts/audit-prod-operator-seam.mjs [--out <path>]

import { rename, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import pg from 'pg';

import { assertDirectDatabaseUrl } from './reconcile-prod-schema.mjs';

const OLD_GLOBAL_INDEXES = [
  'forecast_snapshots_idempotency_unique_idx',
  'investment_lots_idempotency_unique_idx',
  'reserve_allocations_idempotency_unique_idx',
];

const SCOPED_INDEXES = [
  'forecast_snapshots_fund_idem_key_idx',
  'investment_lots_investment_idem_key_idx',
  'reserve_allocations_snapshot_idem_key_idx',
];

// Journal 0002 names these drizzle-style in raw SQL; a push-built origin would
// have produced no FK at all (shape omits .references()); audit both styles.
const FUND_SNAPSHOT_FK_CANDIDATES = [
  'fund_snapshots_run_id_calc_runs_id_fk',
  'fund_snapshots_run_id_fkey',
  'fund_snapshots_config_id_fundconfigs_id_fk',
  'fund_snapshots_config_id_fkey',
];

// migrations/0005_phase1c2_alert_automation.sql:21-22
const OUTBOX_CHECK_EXPECTED_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
];

// (table, scope column) pairs mirror the 0024 partial unique indexes exactly.
const SCOPED_KEY_TABLES = [
  { table: 'forecast_snapshots', scopeColumn: 'fund_id' },
  { table: 'investment_lots', scopeColumn: 'investment_id' },
  { table: 'reserve_allocations', scopeColumn: 'snapshot_id' },
];

const ROW_COUNT_TABLES = [
  'fund_snapshots',
  'calc_runs',
  'fundconfigs',
  'job_outbox',
  'forecast_snapshots',
  'investment_lots',
  'reserve_allocations',
];

const PG_IDENTIFIER_MAX_BYTES = 63;

function endpointHost(connectionString) {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return 'unparseable';
  }
}

async function indexPresence(client, indexNames) {
  const result = await client.query(
    `
      SELECT
        i.relname AS index_name,
        c.relname AS table_name,
        ix.indisunique AS is_unique,
        ix.indisvalid AS is_valid,
        ix.indisready AS is_ready,
        pg_get_indexdef(i.oid) AS definition
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class c ON c.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND i.relname = ANY($1::text[])
    `,
    [indexNames]
  );
  const found = new Map(result.rows.map((row) => [row.index_name, row]));
  return indexNames.map((name) => found.get(name) ?? { index_name: name, absent: true });
}

async function constraintPresence(client, constraintNames) {
  const result = await client.query(
    `
      SELECT
        con.conname AS constraint_name,
        c.relname AS table_name,
        con.contype AS constraint_type,
        con.convalidated AS is_validated,
        pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = con.connamespace
      WHERE n.nspname = 'public'
        AND con.conname = ANY($1::text[])
    `,
    [constraintNames]
  );
  const found = new Map(result.rows.map((row) => [row.constraint_name, row]));
  return constraintNames.map(
    (name) => found.get(name) ?? { constraint_name: name, absent: true }
  );
}

async function outboxCheckVariants(client) {
  const result = await client.query(`
    SELECT con.conname AS constraint_name, pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = con.connamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'job_outbox'
      AND con.contype = 'c'
      AND con.conname LIKE '%status_check'
  `);
  return result.rows;
}

async function foreignKeyInventory(client) {
  const result = await client.query(`
    SELECT
      c.relname AS table_name,
      con.conname AS constraint_name,
      con.convalidated AS is_validated,
      pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = con.connamespace
    WHERE n.nspname = 'public'
      AND con.contype = 'f'
    ORDER BY c.relname, con.conname
  `);
  return result.rows.map((row) => ({
    ...row,
    at_63_byte_limit: Buffer.byteLength(row.constraint_name, 'utf8') === PG_IDENTIFIER_MAX_BYTES,
  }));
}

async function orphanCounts(client) {
  const runOrphans = await client.query(`
    SELECT count(*)::bigint AS orphans
    FROM fund_snapshots fs
    WHERE fs.run_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM calc_runs cr WHERE cr.id = fs.run_id)
  `);
  const configOrphans = await client.query(`
    SELECT count(*)::bigint AS orphans
    FROM fund_snapshots fs
    WHERE fs.config_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM fundconfigs fc WHERE fc.id = fs.config_id)
  `);
  return {
    fund_snapshots_run_id_orphans: Number(runOrphans.rows[0]?.orphans ?? -1),
    fund_snapshots_config_id_orphans: Number(configOrphans.rows[0]?.orphans ?? -1),
  };
}

async function outboxStatusValues(client) {
  const result = await client.query(`
    SELECT status, count(*)::bigint AS row_count
    FROM job_outbox
    GROUP BY status
    ORDER BY status
  `);
  const observed = result.rows.map((row) => ({
    status: row.status,
    row_count: Number(row.row_count),
  }));
  const outsideCheckList = observed
    .map((row) => row.status)
    .filter((status) => !OUTBOX_CHECK_EXPECTED_STATUSES.includes(status));
  return { observed, expected: OUTBOX_CHECK_EXPECTED_STATUSES, outsideCheckList };
}

async function duplicateScopedKeyGroups(client, table, scopeColumn) {
  const result = await client.query(`
    SELECT ${scopeColumn} AS scope_value, idempotency_key, count(*)::bigint AS row_count
    FROM ${table}
    WHERE idempotency_key IS NOT NULL
    GROUP BY ${scopeColumn}, idempotency_key
    HAVING count(*) > 1
    ORDER BY count(*) DESC
    LIMIT 20
  `);
  return {
    table,
    scope_column: scopeColumn,
    duplicate_groups: result.rows.length,
    sample: result.rows.map((row) => ({
      scope_value: row.scope_value,
      idempotency_key: row.idempotency_key,
      row_count: Number(row.row_count),
    })),
  };
}

async function rowCounts(client) {
  const counts = {};
  for (const table of ROW_COUNT_TABLES) {
    const result = await client.query(`SELECT count(*)::bigint AS n FROM ${table}`);
    counts[table] = Number(result.rows[0]?.n ?? -1);
  }
  return counts;
}

async function writeArtifactAtomically(outPath, artifact) {
  const tempPath = `${outPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  await rename(tempPath, outPath);
}

async function main() {
  const { values } = parseArgs({
    options: { out: { type: 'string', default: 's81-prod-audit-output.json' } },
  });
  const outPath = values.out;

  const connectionString = process.env.DATABASE_URL;
  assertDirectDatabaseUrl(connectionString);

  const client = new pg.Client({ connectionString });
  const results = {};
  let queryCount = 0;
  const counted = async (promise) => {
    queryCount += 1;
    return promise;
  };

  try {
    await client.connect();
    await client.query('SET default_transaction_read_only = on');
    await client.query("SET statement_timeout = '30s'");

    const meta = await counted(
      client.query('SELECT version() AS pg_version, current_database() AS database_name')
    );
    results.server = {
      endpoint_host: endpointHost(connectionString),
      pg_version: meta.rows[0]?.pg_version,
      database_name: meta.rows[0]?.database_name,
    };

    results.old_global_indexes = await counted(indexPresence(client, OLD_GLOBAL_INDEXES));
    results.scoped_indexes = await counted(indexPresence(client, SCOPED_INDEXES));
    results.fund_snapshot_fks = await counted(
      constraintPresence(client, FUND_SNAPSHOT_FK_CANDIDATES)
    );
    results.outbox_status_checks = await counted(outboxCheckVariants(client));
    results.foreign_key_inventory = await counted(foreignKeyInventory(client));
    results.orphan_counts = await counted(orphanCounts(client));
    results.outbox_status_values = await counted(outboxStatusValues(client));
    results.duplicate_scoped_key_groups = [];
    for (const { table, scopeColumn } of SCOPED_KEY_TABLES) {
      results.duplicate_scoped_key_groups.push(
        await counted(duplicateScopedKeyGroups(client, table, scopeColumn))
      );
    }
    results.row_counts = await counted(rowCounts(client));

    const artifact = {
      audit: 's8.1-operator-seam',
      completed: true,
      generated_at: new Date().toISOString(),
      query_count: queryCount,
      results,
    };
    await writeArtifactAtomically(outPath, artifact);
    console.log(JSON.stringify(artifact));
  } catch (error) {
    const artifact = {
      audit: 's8.1-operator-seam',
      completed: false,
      generated_at: new Date().toISOString(),
      query_count: queryCount,
      error: error instanceof Error ? error.message : String(error),
      partial_results: results,
    };
    await writeArtifactAtomically(outPath, artifact).catch(() => {});
    console.error(JSON.stringify(artifact));
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

await main();
