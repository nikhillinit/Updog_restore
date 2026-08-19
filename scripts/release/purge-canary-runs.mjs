import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import console from 'node:console';
import process from 'node:process';
import { Pool } from 'pg';

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
    { table: 'portfolio_company_update_receipts', scope: 'fund_id' },
    { table: 'fund_scenario_calculation_commands', scope: 'fund_id' },
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

export function parsePurgeArgs(args) {
  let execute = false;
  for (const arg of args) {
    if (arg === '--execute') {
      execute = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { execute };
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

export async function runPurge(client, { execute = false, output = console.log } = {}) {
  if (execute) {
    throw new Error(
      'Production data mutation is mechanically blocked pending action-specific hardening'
    );
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

async function main() {
  const options = parsePurgeArgs(process.argv.slice(2));
  if (options.execute && process.env.RELEASE_CANARY_PURGE_OPERATOR !== '1') {
    throw new Error('Release canary purge requires RELEASE_CANARY_PURGE_OPERATOR=1');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl === 'memory://') {
    throw new Error('DATABASE_URL is required; refusing to run against memory://');
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
