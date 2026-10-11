import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import console from 'node:console';
import process from 'node:process';
import { Pool } from 'pg';

import { isPoolerUrl, readDatabaseIdentity } from '../reconcile-prod-schema.mjs';
import { computeTargetFingerprint } from '../run-journaled-0050-0061-migrations.mjs';

const PRODUCTION_ORIGIN_PREDICATE = '"data_origin" = \'production\'';
const CANARY_ORIGIN = 'release_canary';

// Raw-SQL mirror of CANARY_RESIDUE_GROUP_TABLES in
// server/services/canary-residue-service.ts. A parity unit test compares the
// group names and table tokens across service, assertion, and purge surfaces.
export const PURGE_RESIDUE_GROUP_TABLES = Object.freeze({
  portfolioCompany: [{ table: 'portfoliocompanies', scope: 'fund_id' }],
  fund: [{ table: 'funds', scope: 'id' }],
  fundConfig: [{ table: 'fundconfigs', scope: 'fund_id' }],
  fundEvent: [{ table: 'fund_events', scope: 'fund_id' }],
  notification: [
    {
      table: 'capital_call_notification_outbox',
      scope: { via: 'lp_capital_calls', on: 'capital_call_id' },
    },
  ],
  grant: [{ table: 'user_fund_grants', scope: 'fund_id' }],
  calculation: [
    { table: 'calc_runs', scope: 'fund_id' },
    { table: 'fund_snapshots', scope: 'fund_id' },
    { table: 'pacing_history', scope: 'fund_id' },
  ],
  mutationReceipt: [
    { table: 'fund_workflow_commands', scope: 'fund_id' },
    { table: 'portfolio_company_update_receipts', scope: 'fund_id' },
    { table: 'fund_scenario_calculation_commands', scope: 'fund_id' },
    { table: 'deal_pipeline_commands', scope: 'fund_id' },
  ],
  scenario: [
    { table: 'fund_scenario_sets', scope: 'fund_id' },
    {
      table: 'fund_scenario_variants',
      scope: { via: 'fund_scenario_sets', on: 'scenario_set_id' },
    },
    { table: 'fund_scenario_set_events', scope: 'fund_id' },
    { table: 'fund_scenario_calculation_runs', scope: 'fund_id' },
  ],
  reporting: [
    { table: 'planning_fmv_override_requests', scope: 'fund_id' },
    { table: 'valuation_marks', scope: 'fund_id' },
    { table: 'reconciliation_runs', scope: 'fund_id' },
    { table: 'lp_metric_runs', scope: 'fund_id' },
    { table: 'evidence_records', scope: 'fund_id' },
    { table: 'narrative_runs', scope: 'fund_id' },
    { table: 'lp_report_packages', scope: 'fund_id' },
    { table: 'lp_report_package_exports', scope: 'fund_id' },
  ],
});

export const PURGE_RESIDUE_GROUPS = Object.freeze(Object.keys(PURGE_RESIDUE_GROUP_TABLES));

const RESIDUE_COLUMN_BY_GROUP = Object.freeze({
  portfolioCompany: 'portfolio_company_residue_count',
  fund: 'fund_residue_count',
  fundConfig: 'fund_config_residue_count',
  fundEvent: 'fund_event_residue_count',
  notification: 'notification_residue_count',
  grant: 'grant_residue_count',
  calculation: 'calculation_residue_count',
  mutationReceipt: 'mutation_receipt_residue_count',
  scenario: 'scenario_residue_count',
  reporting: 'reporting_residue_count',
});

function tableCountSql(entry, fundIdSelect) {
  if (entry.scope === 'id') {
    return `(SELECT count(*)::int FROM ${entry.table} AS t WHERE t.id IN ${fundIdSelect})`;
  }
  if (entry.scope === 'fund_id') {
    return `(SELECT count(*)::int FROM ${entry.table} AS t WHERE t.fund_id IN ${fundIdSelect})`;
  }
  return (
    `(SELECT count(*)::int FROM ${entry.table} AS t ` +
    `JOIN ${entry.scope.via} AS p ON p.id = t.${entry.scope.on} ` +
    `WHERE p.fund_id IN ${fundIdSelect})`
  );
}

function groupCountSql(group, fundIdSelect) {
  return PURGE_RESIDUE_GROUP_TABLES[group]
    .map((entry) => tableCountSql(entry, fundIdSelect))
    .join(' + ');
}

const BINDING_FLAGS = Object.freeze({
  'run-id': 'runId',
  'fund-id': 'fundId',
  'expected-plan-digest': 'expectedPlanDigest',
});

export function parsePurgeArgs(args) {
  const options = { execute: false };
  for (const arg of args) {
    if (arg === '--execute') {
      options.execute = true;
      continue;
    }
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (match && BINDING_FLAGS[match[1]]) {
      options[BINDING_FLAGS[match[1]]] = match[2];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function buildPurgePlan(row) {
  const count = (key) => Number(row[key] ?? 0);
  const residue = Object.fromEntries(PURGE_RESIDUE_GROUPS.map((group) => [group, count(group)]));
  return {
    mode: 'dry-run',
    targetFunds: residue.fund,
    targetRuns: count('run'),
    residue,
    totalResidue: Object.values(residue).reduce((sum, value) => sum + value, 0),
  };
}

export function topologicallyOrderChildTables(tableNames, dependencies) {
  const nodes = [...new Set(tableNames)];
  const nodeSet = new Set(nodes);
  const childrenByParent = new Map(nodes.map((name) => [name, []]));
  const indegree = new Map(nodes.map((name) => [name, 0]));

  for (const { childTable, parentTable } of dependencies) {
    if (!nodeSet.has(childTable) || !nodeSet.has(parentTable) || childTable === parentTable) {
      continue;
    }
    childrenByParent.get(childTable).push(parentTable);
    indegree.set(parentTable, indegree.get(parentTable) + 1);
  }

  const ready = nodes.filter((name) => indegree.get(name) === 0).sort();
  const ordered = [];
  while (ready.length > 0) {
    const current = ready.shift();
    ordered.push(current);
    for (const parent of childrenByParent.get(current)) {
      const nextIndegree = indegree.get(parent) - 1;
      indegree.set(parent, nextIndegree);
      if (nextIndegree === 0) {
        ready.push(parent);
        ready.sort();
      }
    }
  }

  if (ordered.length !== nodes.length) {
    const cycleNodes = nodes.filter((name) => !ordered.includes(name));
    throw new Error(`Cycle in fund purge foreign-key graph: ${cycleNodes.join(', ')}`);
  }
  return ordered;
}

function isDirectEntrypoint(metaUrl) {
  return Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === metaUrl;
}

async function assertCanaryExclusionAvailable(client) {
  // Keep purge fail-closed if the shared funds origin contract is unavailable.
  // This SQL is the script form of server/lib/canary-exclusion.ts.
  await client.query(
    `SELECT count(*)::int AS count FROM funds WHERE ${PRODUCTION_ORIGIN_PREDICATE}`
  );
}

async function selectExpiredCanaryResidue(client) {
  const fundIdSelect = '(SELECT id FROM target_funds)';
  const groupSelections = PURGE_RESIDUE_GROUPS.map(
    (group) => `${groupCountSql(group, fundIdSelect)} AS "${group}"`
  ).join(',\n      ');
  const result = await client.query(`
    WITH target_funds AS (
      SELECT f.id, f.canary_run_id
      FROM funds AS f
      JOIN release_canary_runs AS r ON r.id = f.canary_run_id
      WHERE f.data_origin = '${CANARY_ORIGIN}'
        AND r.expires_at <= clock_timestamp()
    )
    SELECT
      (SELECT count(DISTINCT canary_run_id)::int FROM target_funds) AS run,
      ${groupSelections}
  `);
  return result.rows[0] ?? {};
}

async function reconcileExpiredCanaryRuns(client) {
  const perRunFundIdSelect = '(SELECT id FROM target_funds WHERE canary_run_id = r.id)';
  const countSelections = PURGE_RESIDUE_GROUPS.map(
    (group) => `${groupCountSql(group, perRunFundIdSelect)} AS "${RESIDUE_COLUMN_BY_GROUP[group]}"`
  ).join(',\n        ');
  const assignments = PURGE_RESIDUE_GROUPS.map(
    (group) => `${RESIDUE_COLUMN_BY_GROUP[group]} = counts."${RESIDUE_COLUMN_BY_GROUP[group]}"`
  ).join(',\n        ');
  const totalExpression = PURGE_RESIDUE_GROUPS.map(
    (group) => `counts."${RESIDUE_COLUMN_BY_GROUP[group]}"`
  ).join(' + ');
  await client.query(`
    WITH target_funds AS (
      SELECT f.id, f.canary_run_id
      FROM funds AS f
      JOIN release_canary_runs AS r ON r.id = f.canary_run_id
      WHERE f.data_origin = '${CANARY_ORIGIN}'
        AND r.expires_at <= clock_timestamp()
    ), counts AS (
      SELECT
        r.id,
        ${countSelections}
      FROM release_canary_runs AS r
      WHERE r.id IN (SELECT canary_run_id FROM target_funds)
    )
    UPDATE release_canary_runs AS r
    SET ${assignments},
        total_residue_count = ${totalExpression},
        updated_at = clock_timestamp()
    FROM counts
    WHERE r.id = counts.id
  `);
}

const BLOCKED_MESSAGE =
  'Production data mutation is mechanically blocked pending action-specific hardening';

export async function runPurge(client, options = {}) {
  if (options.runId !== undefined) return runSingleRunPurge(client, options);
  const { execute = false, output = console.log } = options;
  if (execute) {
    throw new Error(BLOCKED_MESSAGE);
  }
  await assertCanaryExclusionAvailable(client);
  await client.query('BEGIN');
  try {
    await reconcileExpiredCanaryRuns(client);
    const plan = buildPurgePlan(await selectExpiredCanaryResidue(client));
    await client.query('ROLLBACK');
    output(JSON.stringify(plan, null, 2));
    return plan;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

// ---- Single-run purge (ADR-108) --------------------------------------------
//
// The only execute shape: one named, terminal, expired canary run and its one
// fund, bound to a reviewed dry-run digest, the executing source SHA, the
// target fingerprint, and recovery evidence that a validator re-checks
// immediately before the first write. No such validator exists yet, so the CLI
// refuses execute (RECOVERY_BLOCK_MESSAGE) and only synthetic tests inject one.
// Every other execute shape stays blocked above.

export const RECOVERY_BLOCK_MESSAGE =
  'Single-run canary purge execute is mechanically blocked: no machine-checkable ' +
  'recovery evidence validator is bound (ADR-108)';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FUND_ID_PATTERN = /^[1-9][0-9]{0,9}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const TERMINAL_STATUSES = Object.freeze(['completed', 'failed', 'expired']);
const RECEIPT_ACTION = 'release_canary_purge';
const RECEIPT_ENTITY = 'release_canary_run';
const OUT_OF_SCOPE_EXTRA_TABLES = Object.freeze(['release_canary_runs', 'audit_log']);
// ponytail: whole-row snapshots go into one audit_log row; raise with review if a canary ever outgrows it.
const MAX_PURGE_ROWS = 10_000;

// Every table the single-run purge may delete from, with its fund scope: the
// residue groups plus lp_capital_calls, the outbox's parent. A row anywhere
// else that references these rows, or names the fund or run, refuses the purge.
export const PURGE_DELETE_SCOPES = Object.freeze([
  ...PURGE_RESIDUE_GROUPS.flatMap((group) => PURGE_RESIDUE_GROUP_TABLES[group]),
  { table: 'lp_capital_calls', scope: 'fund_id' },
]);

const GROUP_BY_TABLE = new Map(
  PURGE_RESIDUE_GROUPS.flatMap((group) =>
    PURGE_RESIDUE_GROUP_TABLES[group].map(({ table }) => [table, group])
  )
);

export class PurgeCommitUnknownError extends Error {
  name = 'PurgeCommitUnknownError';
}

function isBoundExecute(options) {
  return (
    SHA_PATTERN.test(options.headSha ?? '') &&
    DIGEST_PATTERN.test(options.expectedPlanDigest ?? '') &&
    typeof options.expectedTargetFingerprint === 'string' &&
    options.expectedTargetFingerprint.length > 0 &&
    typeof options.revalidateSource === 'function' &&
    typeof options.verifyRecoveryEvidence === 'function'
  );
}

function scopeSql(entry, alias, fundIdSql) {
  if (entry.scope === 'id') return `${alias}.id = ${fundIdSql}`;
  if (entry.scope === 'fund_id') return `${alias}.fund_id = ${fundIdSql}`;
  return (
    `${alias}.${entry.scope.on} IN ` +
    `(SELECT v.id FROM public.${entry.scope.via} AS v WHERE v.fund_id = ${fundIdSql})`
  );
}

// One round trip for many counts. Each part reads the fund and run IDs from k.
async function countParts(client, parts, fundId, runId) {
  if (parts.length === 0) return [];
  const result = await client.query(
    `WITH k AS (SELECT $1::int AS fund_id, $2::text AS run_id)
     SELECT ${parts.map((part, index) => `${part} AS c${index}`).join(',\n       ')}`,
    [fundId, runId]
  );
  return parts.map((_, index) => Number(result.rows[0][`c${index}`]));
}

const K_FUND = '(SELECT fund_id FROM k)';
const K_RUN = '(SELECT run_id FROM k)';

async function readDependencyCatalog(client, tables) {
  const edges = await client.query(
    `SELECT format('%I.%I', cn.nspname, c.relname) AS child,
            cn.nspname = 'public' AND c.relname = ANY($1::text[]) AS child_in_scope,
            c.relname AS child_name,
            p.relname AS parent,
            con.conname AS constraint_name,
            con.confdeltype AS on_delete,
            ARRAY(SELECT format('%I', a.attname)
                  FROM unnest(con.conkey) WITH ORDINALITY AS key(attnum, ord)
                  JOIN pg_attribute AS a ON a.attrelid = con.conrelid AND a.attnum = key.attnum
                  ORDER BY key.ord) AS child_columns,
            ARRAY(SELECT format('%I', a.attname)
                  FROM unnest(con.confkey) WITH ORDINALITY AS key(attnum, ord)
                  JOIN pg_attribute AS a ON a.attrelid = con.confrelid AND a.attnum = key.attnum
                  ORDER BY key.ord) AS parent_columns
     FROM pg_constraint AS con
     JOIN pg_class AS c ON c.oid = con.conrelid
     JOIN pg_namespace AS cn ON cn.oid = c.relnamespace
     JOIN pg_class AS p ON p.oid = con.confrelid
     JOIN pg_namespace AS pn ON pn.oid = p.relnamespace
     WHERE con.contype = 'f' AND pn.nspname = 'public' AND p.relname = ANY($1::text[])
     ORDER BY child, constraint_name`,
    [tables]
  );
  const ownerColumns = await client.query(
    `SELECT format('%I.%I', n.nspname, c.relname) AS table_name,
            format('%I', a.attname) AS column_name
     FROM pg_attribute AS a
     JOIN pg_class AS c ON c.oid = a.attrelid
     JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
       AND a.attname IN ('fund_id', 'canary_run_id')
       AND n.nspname NOT IN ('pg_catalog', 'information_schema')
       AND n.nspname NOT LIKE 'pg_toast%'
       AND NOT (n.nspname = 'public' AND c.relname = ANY($1::text[]))
     ORDER BY table_name, column_name`,
    [tables]
  );
  const hooks = await client.query(
    `SELECT format('%I.%I', n.nspname, c.relname) AS table_name, t.tgname AS name
     FROM pg_trigger AS t
     JOIN pg_class AS c ON c.oid = t.tgrelid
     JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE NOT t.tgisinternal AND n.nspname = 'public'
       AND ((c.relname = ANY($1::text[]) AND (t.tgtype & 8) <> 0) OR c.relname = ANY($2::text[]))
     UNION ALL
     SELECT format('%I.%I', schemaname, tablename), rulename
     FROM pg_rules
     WHERE schemaname = 'public' AND (tablename = ANY($1::text[]) OR tablename = ANY($2::text[]))
     ORDER BY 1, 2`,
    [tables, OUT_OF_SCOPE_EXTRA_TABLES]
  );
  return { edges: edges.rows, ownerColumns: ownerColumns.rows, hooks: hooks.rows };
}

function dependentCountSql(edge, scopeByTable) {
  const childColumns = edge.child_columns.map((column) => `c.${column}`).join(', ');
  const parentColumns = edge.parent_columns.map((column) => `p.${column}`).join(', ');
  const parentScope = scopeSql(scopeByTable.get(edge.parent), 'p', K_FUND);
  const outsideChildScope = edge.child_in_scope
    ? ` AND (${scopeSql(scopeByTable.get(edge.child_name), 'c', K_FUND)}) IS NOT TRUE`
    : '';
  return (
    `(SELECT count(*)::int FROM ${edge.child} AS c WHERE (${childColumns}) IN ` +
    `(SELECT ${parentColumns} FROM public.${edge.parent} AS p WHERE ${parentScope})` +
    `${outsideChildScope})`
  );
}

function ownerCountSql({ table_name: table, column_name: column }) {
  const value = column === 'canary_run_id' ? K_RUN : `${K_FUND}::text`;
  return `(SELECT count(*)::int FROM ${table} AS o WHERE o.${column}::text = ${value})`;
}

// Tables a concurrent writer could change without waiting on a row this purge
// holds: a fund_id with no foreign key to funds, a scope column with no foreign
// key to its parent, and every canary_run_id (the run row survives as the
// tombstone, so a foreign key to it fences nothing). funds is listed for its
// canary_run_id. Locked IN SHARE MODE until COMMIT; foreign-key-fenced writers
// instead wait on the locked parent rows and fail once those rows are gone.
function writeExcludedTables(catalog, scopes) {
  const fenced = new Set(
    catalog.edges
      .filter((edge) => edge.child_columns.length === 1)
      .map((edge) => `${edge.child}|${edge.child_columns[0]}|${edge.parent}`)
  );
  const tables = new Set(['public.funds']);
  for (const { table_name: table, column_name: column } of catalog.ownerColumns) {
    if (column === 'canary_run_id' || !fenced.has(`${table}|${column}|funds`)) tables.add(table);
  }
  for (const { table, scope } of scopes) {
    if (scope === 'id') continue;
    const column = scope === 'fund_id' ? 'fund_id' : scope.on;
    if (!fenced.has(`public.${table}|${column}|${scope.via ?? 'funds'}`))
      tables.add(`public.${table}`);
  }
  return [...tables].sort();
}

// Counts of rows that still name the fund or run: in-scope tables, owner
// columns outside the scope, and funds bound to the run.
function leftoverParts(scopes, catalog) {
  return [
    ...scopes.map((entry) => ({
      label: `public.${entry.table}`,
      sql: `(SELECT count(*)::int FROM public.${entry.table} AS t WHERE ${scopeSql(entry, 't', K_FUND)})`,
    })),
    ...catalog.ownerColumns.map((column) => ({
      label: `${column.table_name}.${column.column_name}`,
      sql: ownerCountSql(column),
    })),
    {
      label: 'public.funds.canary_run_id',
      sql: `(SELECT count(*)::int FROM public.funds AS f WHERE f.canary_run_id::text = ${K_RUN})`,
    },
  ];
}

async function nonZeroLabels(client, parts, fundId, runId) {
  const values = await countParts(
    client,
    parts.map(({ sql }) => sql),
    fundId,
    runId
  );
  return parts.filter((_, index) => values[index] > 0).map(({ label }) => label);
}

// Builds a JSON object from entries whose values are already JSON text, so
// database JSONB text (numbers beyond 2^53 included) is embedded unchanged.
function jsonObjectText(entries) {
  return `{${entries.map(([key, text]) => `${JSON.stringify(key)}:${text}`).join(',')}}`;
}

function residueFromRunRow(row) {
  return Object.fromEntries(
    PURGE_RESIDUE_GROUPS.map((group) => [group, Number(row[RESIDUE_COLUMN_BY_GROUP[group]] ?? 0)])
  );
}

function receiptSummary(receipt, tombstone) {
  return {
    runId: receipt.runId,
    fundId: receipt.fundId,
    digest: receipt.digest,
    executingSha: receipt.executingSha,
    deleted: receipt.deleted.map(({ table, count }) => ({ table, count })),
    version: Number(tombstone.version),
    purgedAt: tombstone.purged_at,
  };
}

/**
 * Reads, under the caller's transaction, everything the digest binds. With
 * `lock`, the run row, the fund row, and every row to delete stay locked until
 * COMMIT. Returns `{ purged }` for an already purged run.
 */
async function readRunPlan(client, { runId, fundId, lock }) {
  const forUpdate = lock ? 'FOR UPDATE' : '';
  const store = await client.query(`SELECT to_regclass('public.audit_log') IS NOT NULL AS present`);
  if (store.rows[0]?.present !== true) {
    throw new Error('Release canary purge receipt store public.audit_log is unavailable');
  }

  const runResult = await client.query(
    `SELECT to_jsonb(r)::text AS row_text, r.status, r.version, r.purged_at::text AS purged_at,
            r.expires_at <= clock_timestamp() AS expired
     FROM release_canary_runs AS r WHERE r.id = $1::uuid ${forUpdate}`,
    [runId]
  );
  if (runResult.rows.length !== 1) throw new Error('Release canary run was not found');
  const run = runResult.rows[0];
  run.row = JSON.parse(run.row_text);
  const receipts = await client.query(
    `SELECT changes FROM audit_log
     WHERE action = $1 AND entity_type = $2 AND entity_id = $3::uuid
     ORDER BY created_at, id`,
    [RECEIPT_ACTION, RECEIPT_ENTITY, runId]
  );

  const present = await client.query(
    `SELECT t AS name FROM unnest($1::text[]) AS t
     WHERE to_regclass(format('public.%I', t)) IS NOT NULL`,
    [[...new Set(PURGE_DELETE_SCOPES.flatMap(({ table, scope }) => [table, scope.via ?? table]))]]
  );
  const presentTables = new Set(present.rows.map(({ name }) => name));
  const scopes = PURGE_DELETE_SCOPES.filter(
    ({ table, scope }) => presentTables.has(table) && (!scope.via || presentTables.has(scope.via))
  );
  const scopeByTable = new Map(scopes.map((entry) => [entry.table, entry]));
  const tables = scopes.map(({ table }) => table);
  const catalog = await readDependencyCatalog(client, tables);

  if (run.status === 'purged') {
    if (receipts.rows.length !== 1) {
      throw new Error('Release canary run is purged without exactly one purge receipt');
    }
    const receipt = receipts.rows[0].changes;
    if (receipt.fundId !== fundId) {
      throw new Error('Release canary run was purged under a conflicting purge intent');
    }
    // A writer that waited out the purge can still name the deleted fund in a
    // table without a foreign key; the readback refuses rather than passing it.
    const leftovers = await nonZeroLabels(client, leftoverParts(scopes, catalog), fundId, runId);
    if (leftovers.length > 0) {
      throw new Error(
        `Release canary run is purged but rows still name its fund or run: ${leftovers.join(', ')}`
      );
    }
    return { purged: { receipt, tombstone: run } };
  }
  if (receipts.rows.length !== 0) {
    throw new Error('Release canary purge receipt exists for a run that is not purged');
  }
  if (!TERMINAL_STATUSES.includes(run.status)) {
    throw new Error(`Release canary run is not terminal (status ${run.status})`);
  }
  if (run.expired !== true) throw new Error('Release canary run has not expired');

  const funds = await client.query(
    `SELECT id, data_origin, canary_run_id::text AS canary_run_id
     FROM funds WHERE id = $2 OR canary_run_id = $1::uuid ORDER BY id ${forUpdate}`,
    [runId, fundId]
  );
  const fund = funds.rows[0];
  if (
    funds.rows.length !== 1 ||
    Number(fund.id) !== fundId ||
    fund.data_origin !== CANARY_ORIGIN ||
    fund.canary_run_id !== runId
  ) {
    throw new Error(`Fund ${fundId} is not the release-canary fund of run ${runId}`);
  }

  if (catalog.hooks.length > 0) {
    const names = catalog.hooks.map(({ table_name, name }) => `${table_name} ${name}`);
    throw new Error(`Release canary purge refuses triggers or rules: ${names.join(', ')}`);
  }
  const excluded = writeExcludedTables(catalog, scopes);
  if (lock) {
    // Bounded by lock_timeout; held until COMMIT, so the counts below stay true.
    await client.query(`LOCK TABLE ${excluded.join(', ')} IN SHARE MODE`);
  }
  const deleteOrder = topologicallyOrderChildTables(
    tables,
    catalog.edges
      .filter((edge) => edge.child_in_scope)
      .map((edge) => ({ childTable: edge.child_name, parentTable: edge.parent }))
  );
  const dependentCounts = await countParts(
    client,
    [
      ...catalog.edges.map((edge) => dependentCountSql(edge, scopeByTable)),
      ...catalog.ownerColumns.map(ownerCountSql),
    ],
    fundId,
    runId
  );
  const labels = [
    ...catalog.edges.map((edge) => `${edge.child} (${edge.constraint_name})`),
    ...catalog.ownerColumns.map(({ table_name, column_name }) => `${table_name}.${column_name}`),
  ];
  const outside = labels.filter((_, index) => dependentCounts[index] > 0);
  if (outside.length > 0) {
    throw new Error(
      `Release canary purge refuses rows outside the reviewed scope: ${outside.join(', ')}`
    );
  }

  const rowsByTable = [];
  for (const table of deleteOrder) {
    const result = await client.query(
      `SELECT to_jsonb(t)::text AS row FROM public.${table} AS t
       WHERE ${scopeSql(scopeByTable.get(table), 't', '$1::int')}
       ORDER BY 1 ${lock ? 'FOR UPDATE OF t' : ''}`,
      [fundId]
    );
    rowsByTable.push({ table, rows: result.rows.map(({ row }) => row) });
  }
  const totalRows = rowsByTable.reduce((sum, { rows }) => sum + rows.length, 0);
  if (totalRows > MAX_PURGE_ROWS) {
    throw new Error(`Release canary purge plan has ${totalRows} rows, above ${MAX_PURGE_ROWS}`);
  }

  const liveResidue = Object.fromEntries(PURGE_RESIDUE_GROUPS.map((group) => [group, 0]));
  for (const { table, rows } of rowsByTable) {
    const group = GROUP_BY_TABLE.get(table);
    if (group) liveResidue[group] += rows.length;
  }
  const storedResidue = residueFromRunRow(run.row);
  return {
    run,
    scopes,
    catalog,
    excluded,
    rowsByTable,
    totalRows,
    liveResidue,
    storedResidue,
  };
}

export function computePurgeDigest(input) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function describePlan({ runId, fundId, headSha, digest, plan }) {
  const runRow = plan.run.row;
  return {
    mode: 'single-run-dry-run',
    runId,
    fundId,
    executingSha: headSha,
    run: {
      releaseSha: runRow.release_sha,
      workflowRunId: runRow.workflow_run_id,
      workflowRunAttempt: runRow.workflow_run_attempt,
      status: runRow.status,
      version: runRow.version,
      expiresAt: runRow.expires_at,
    },
    storedResidue: plan.storedResidue,
    liveResidue: plan.liveResidue,
    residueMatchesStored: PURGE_RESIDUE_GROUPS.every(
      (group) => plan.storedResidue[group] === plan.liveResidue[group]
    ),
    deleteOrder: plan.rowsByTable.map(({ table, rows }) => ({
      table,
      count: rows.length,
      sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
    })),
    totalRows: plan.totalRows,
    dependenciesChecked: plan.catalog.edges.length + plan.catalog.ownerColumns.length,
    writeExcludedTables: plan.excluded,
    digest,
  };
}

async function runSingleRunPurge(client, options) {
  const { execute = false, output = console.log } = options;
  const runId = options.runId;
  if (typeof runId !== 'string' || !UUID_PATTERN.test(runId)) {
    throw new Error('--run-id must be a lowercase canary run UUID');
  }
  if (typeof options.fundId !== 'string' || !FUND_ID_PATTERN.test(options.fundId)) {
    throw new Error('--fund-id must be the positive integer fund id of the run');
  }
  const fundId = Number(options.fundId);
  if (execute && !isBoundExecute(options)) {
    throw new Error(
      `${BLOCKED_MESSAGE}: single-run execute requires the run, fund, reviewed digest, ` +
        'executing SHA, target fingerprint, source re-check, and recovery evidence validator'
    );
  }
  if (!SHA_PATTERN.test(options.headSha ?? '')) {
    throw new Error('The executing source SHA is required');
  }
  // The driver's effective endpoint, as for provisioning: the fingerprint recipe
  // is defined over the direct host.
  if (isPoolerUrl(`postgres://${client.host}/`)) {
    throw new Error('Refusing pooled endpoint; use the direct (non-pooler) endpoint.');
  }

  await client.query(execute ? 'BEGIN' : 'BEGIN READ ONLY');
  try {
    // Fixed text forms keep the digest independent of the operator's session.
    await client.query("SET LOCAL TimeZone = 'UTC'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    if (execute) await client.query("SET LOCAL lock_timeout = '5s'");
    const identity = await readDatabaseIdentity(client);
    const targetFingerprint = computeTargetFingerprint({
      directHost: client.host,
      port: client.port,
      database: identity.database,
      user: identity.user,
    });
    if (execute && targetFingerprint !== options.expectedTargetFingerprint) {
      throw new Error('Target fingerprint missing or mismatched.');
    }

    const plan = await readRunPlan(client, { runId, fundId, lock: execute });
    if (plan.purged) {
      const { receipt, tombstone } = plan.purged;
      const sameIntent =
        receipt.fundId === fundId &&
        (!execute ||
          (receipt.digest === options.expectedPlanDigest &&
            receipt.executingSha === options.headSha &&
            receipt.targetFingerprint === targetFingerprint));
      if (!sameIntent) {
        throw new Error('Release canary run was purged under a conflicting purge intent');
      }
      await client.query('ROLLBACK');
      const replay = {
        outcome: execute ? 'replayed' : 'readback',
        ...receiptSummary(receipt, tombstone),
      };
      output(JSON.stringify(replay, null, 2));
      return replay;
    }

    const digest = computePurgeDigest({
      schema: 'release-canary-purge-plan-v1',
      executingSha: options.headSha,
      targetFingerprint,
      runId,
      fundId,
      run: plan.run.row_text,
      catalog: plan.catalog,
      tables: plan.rowsByTable,
    });
    if (!execute) {
      await client.query('ROLLBACK');
      const described = describePlan({ runId, fundId, headSha: options.headSha, digest, plan });
      output(JSON.stringify(described, null, 2));
      return described;
    }

    if (digest !== options.expectedPlanDigest) {
      throw new Error(
        'Plan digest mismatch: the source, target, run, or canary rows changed since the ' +
          'dry run. Re-run the dry run and review the new plan.'
      );
    }
    await options.revalidateSource();
    // Re-checked here, after the digest and source checks and before any write;
    // awaited so an asynchronous validator settles first.
    const recoveryEvidence = await options.verifyRecoveryEvidence();
    if (recoveryEvidence === null || typeof recoveryEvidence !== 'object') {
      throw new Error('Recovery evidence validator returned no evidence record');
    }

    const receipt = {
      digest,
      executingSha: options.headSha,
      runId,
      fundId,
      deleted: plan.rowsByTable.map(({ table, rows }) => ({ table, count: rows.length })),
    };
    const receiptText = jsonObjectText([
      ['schema', JSON.stringify('release-canary-purge-receipt-v1')],
      ['digest', JSON.stringify(digest)],
      ['executingSha', JSON.stringify(options.headSha)],
      ['targetFingerprint', JSON.stringify(targetFingerprint)],
      ['runId', JSON.stringify(runId)],
      ['fundId', JSON.stringify(fundId)],
      ['recoveryEvidence', JSON.stringify(recoveryEvidence)],
      ['run', plan.run.row_text],
      [
        'deleted',
        `[${plan.rowsByTable
          .map(({ table, rows }) =>
            jsonObjectText([
              ['table', JSON.stringify(table)],
              ['count', String(rows.length)],
              ['rows', `[${rows.join(',')}]`],
            ])
          )
          .join(',')}]`,
      ],
    ]);
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, changes)
       VALUES ($1, $2, $3::uuid, $4::jsonb)`,
      [RECEIPT_ACTION, RECEIPT_ENTITY, runId, receiptText]
    );
    for (const { table, rows } of plan.rowsByTable) {
      const result = await client.query(
        `DELETE FROM public.${table} AS t
         WHERE ${scopeSql(
           plan.scopes.find((entry) => entry.table === table),
           't',
           '$1::int'
         )}`,
        [fundId]
      );
      if (result.rowCount !== rows.length) {
        throw new Error(
          `Release canary purge deleted ${result.rowCount} rows from ${table}; ` +
            `the reviewed plan has ${rows.length}`
        );
      }
    }
    const remaining = await nonZeroLabels(
      client,
      leftoverParts(plan.scopes, plan.catalog),
      fundId,
      runId
    );
    if (remaining.length > 0) {
      throw new Error(`Release canary purge left rows behind: ${remaining.join(', ')}`);
    }
    const tombstone = await client.query(
      `UPDATE release_canary_runs
       SET status = 'purged', purged_at = clock_timestamp(), version = version + 1,
           updated_at = clock_timestamp()
       WHERE id = $1::uuid AND version = $2 AND status = $3
         AND NOT EXISTS (SELECT 1 FROM funds WHERE canary_run_id = $1::uuid)
       RETURNING version, purged_at::text AS purged_at`,
      [runId, plan.run.version, plan.run.status]
    );
    if (tombstone.rows.length !== 1) {
      throw new Error('Release canary purge tombstone lost its version fence');
    }
    try {
      await client.query('COMMIT');
    } catch {
      // A lost acknowledgement can follow a successful COMMIT.
      throw new PurgeCommitUnknownError(
        'COMMIT was not confirmed, so the purge may or may not have committed. ' +
          'Run the dry run to read the run back before any retry.'
      );
    }
    const done = { outcome: 'purged', ...receiptSummary(receipt, tombstone.rows[0]) };
    output(JSON.stringify(done, null, 2));
    return done;
  } catch (error) {
    if (!(error instanceof PurgeCommitUnknownError)) {
      await client.query('ROLLBACK').catch(() => undefined);
    }
    throw error;
  }
}

function readHeadSha(repoRoot) {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
  }).trim();
}

async function main() {
  const options = parsePurgeArgs(process.argv.slice(2));
  if (options.execute && process.env.RELEASE_CANARY_PURGE_OPERATOR !== '1') {
    throw new Error('Release canary purge requires RELEASE_CANARY_PURGE_OPERATOR=1');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl === 'memory://') {
    throw new Error('DATABASE_URL is required; refusing to run against memory://');
  }

  if (options.runId !== undefined) {
    if (options.execute) throw new Error(RECOVERY_BLOCK_MESSAGE);
    options.headSha = readHeadSha(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'));
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await runPurge(client, options);
  } finally {
    client.release();
    await pool.end();
  }
}

if (isDirectEntrypoint(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
