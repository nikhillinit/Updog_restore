import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import console from 'node:console';
import process from 'node:process';
import { Pool } from 'pg';

const PRODUCTION_ORIGIN_PREDICATE = '"data_origin" = \'production\'';
const CANARY_ORIGIN = 'release_canary';

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
  const residue = {
    portfolioCompany: count('portfolioCompany'),
    fund: count('fund'),
    fundConfig: count('fundConfig'),
    fundEvent: count('fundEvent'),
    notification: count('notification'),
  };
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
  const result = await client.query(`
    WITH target_funds AS (
      SELECT f.id, f.canary_run_id
      FROM funds AS f
      JOIN release_canary_runs AS r ON r.id = f.canary_run_id
      WHERE f.data_origin = '${CANARY_ORIGIN}'
        AND r.expires_at <= clock_timestamp()
    )
    SELECT
      (SELECT count(*)::int FROM target_funds) AS fund,
      (SELECT count(DISTINCT canary_run_id)::int FROM target_funds) AS run,
      (SELECT count(*)::int FROM portfoliocompanies AS pc
       WHERE pc.fund_id IN (SELECT id FROM target_funds)) AS "portfolioCompany",
      (SELECT count(*)::int FROM fundconfigs AS fc
       WHERE fc.fund_id IN (SELECT id FROM target_funds)) AS "fundConfig",
      (SELECT count(*)::int FROM fund_events AS fe
       WHERE fe.fund_id IN (SELECT id FROM target_funds)) AS "fundEvent",
      (SELECT count(*)::int
       FROM capital_call_notification_outbox AS outbox
       JOIN lp_capital_calls AS calls ON calls.id = outbox.capital_call_id
       WHERE calls.fund_id IN (SELECT id FROM target_funds)) AS notification
  `);
  return result.rows[0] ?? {};
}

async function reconcileExpiredCanaryRuns(client) {
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
        (SELECT count(*)::int FROM portfoliocompanies AS pc
         WHERE pc.fund_id IN (SELECT id FROM target_funds WHERE canary_run_id = r.id)) AS portfolio_company,
        (SELECT count(*)::int FROM funds AS f
         WHERE f.id IN (SELECT id FROM target_funds WHERE canary_run_id = r.id)) AS fund,
        (SELECT count(*)::int FROM fundconfigs AS fc
         WHERE fc.fund_id IN (SELECT id FROM target_funds WHERE canary_run_id = r.id)) AS fund_config,
        (SELECT count(*)::int FROM fund_events AS fe
         WHERE fe.fund_id IN (SELECT id FROM target_funds WHERE canary_run_id = r.id)) AS fund_event,
        (SELECT count(*)::int
         FROM capital_call_notification_outbox AS outbox
         JOIN lp_capital_calls AS calls ON calls.id = outbox.capital_call_id
         WHERE calls.fund_id IN (SELECT id FROM target_funds WHERE canary_run_id = r.id)) AS notification
      FROM release_canary_runs AS r
      WHERE r.id IN (SELECT canary_run_id FROM target_funds)
    )
    UPDATE release_canary_runs AS r
    SET portfolio_company_residue_count = counts.portfolio_company,
        fund_residue_count = counts.fund,
        fund_config_residue_count = counts.fund_config,
        fund_event_residue_count = counts.fund_event,
        notification_residue_count = counts.notification,
        total_residue_count = counts.portfolio_company + counts.fund + counts.fund_config
          + counts.fund_event + counts.notification,
        updated_at = clock_timestamp()
    FROM counts
    WHERE r.id = counts.id
  `);
}

async function selectTargetIds(client) {
  const result = await client.query(`
    SELECT f.id, f.canary_run_id
    FROM funds AS f
    JOIN release_canary_runs AS r ON r.id = f.canary_run_id
    WHERE f.data_origin = '${CANARY_ORIGIN}'
      AND r.expires_at <= clock_timestamp()
    ORDER BY f.id
  `);
  return {
    fundIds: result.rows.map((row) => row.id),
    runIds: [...new Set(result.rows.map((row) => row.canary_run_id).filter(Boolean))],
  };
}

async function listDirectFundForeignKeys(client) {
  const result = await client.query(`
    SELECT
      format('%I.%I', child_ns.nspname, child.relname) AS table_name,
      format('%I', child_column.attname) AS column_name
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS child ON child.oid = constraint_row.conrelid
    JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_class AS parent ON parent.oid = constraint_row.confrelid
    JOIN pg_attribute AS child_column
      ON child_column.attrelid = child.oid
     AND child_column.attnum = constraint_row.conkey[1]
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'public.funds'::regclass
      AND array_length(constraint_row.conkey, 1) = 1
      AND child.oid <> 'public.funds'::regclass
    ORDER BY child.relname
  `);
  return result.rows;
}

async function listChildTableDependencies(client) {
  const result = await client.query(`
    WITH direct_children AS (
      SELECT DISTINCT child.oid, format('%I.%I', child_ns.nspname, child.relname) AS table_name
      FROM pg_constraint AS constraint_row
      JOIN pg_class AS child ON child.oid = constraint_row.conrelid
      JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
      WHERE constraint_row.contype = 'f'
        AND constraint_row.confrelid = 'public.funds'::regclass
        AND child.oid <> 'public.funds'::regclass
    )
    SELECT
      format('%I.%I', child_ns.nspname, child.relname) AS child_table,
      format('%I.%I', parent_ns.nspname, parent.relname) AS parent_table
    FROM direct_children AS child_direct
    JOIN pg_constraint AS foreign_key ON foreign_key.conrelid = child_direct.oid
    JOIN pg_class AS child ON child.oid = foreign_key.conrelid
    JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
    JOIN direct_children AS parent_direct ON parent_direct.oid = foreign_key.confrelid
    JOIN pg_class AS parent ON parent.oid = foreign_key.confrelid
    JOIN pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
    WHERE foreign_key.contype = 'f'
  `);
  return result.rows;
}

async function executePurge(client, fundIds, runIds) {
  if (fundIds.length === 0) return 0;
  const directForeignKeys = await listDirectFundForeignKeys(client);
  const dependencies = await listChildTableDependencies(client);
  const orderedTables = topologicallyOrderChildTables(
    directForeignKeys.map(({ table_name }) => table_name),
    dependencies.map(({ child_table, parent_table }) => ({
      childTable: child_table,
      parentTable: parent_table,
    }))
  );
  const foreignKeysByTable = new Map();
  for (const foreignKey of directForeignKeys) {
    const existing = foreignKeysByTable.get(foreignKey.table_name) ?? [];
    existing.push(foreignKey);
    foreignKeysByTable.set(foreignKey.table_name, existing);
  }
  let deleted = 0;
  for (const tableName of orderedTables) {
    for (const foreignKey of foreignKeysByTable.get(tableName) ?? []) {
      const result = await client.query(
        `DELETE FROM ${foreignKey.table_name} WHERE ${foreignKey.column_name} = ANY($1::int[])`,
        [fundIds]
      );
      deleted += result.rowCount ?? 0;
    }
  }

  const funds = await client.query(
    `DELETE FROM funds WHERE data_origin = $2 AND id = ANY($1::int[])`,
    [fundIds, CANARY_ORIGIN]
  );
  const runs = await client.query(
    `DELETE FROM release_canary_runs
       WHERE id = ANY($1::uuid[])
         AND id NOT IN (SELECT canary_run_id FROM funds WHERE canary_run_id IS NOT NULL)`,
    [runIds]
  );
  deleted += (funds.rowCount ?? 0) + (runs.rowCount ?? 0);
  return deleted;
}

export async function runPurge(client, { execute = false, output = console.log } = {}) {
  if (execute) {
    throw new Error(
      'Production data mutation is mechanically blocked pending action-specific hardening'
    );
  }
  await assertCanaryExclusionAvailable(client);
  if (!execute) {
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

  await client.query('BEGIN');
  try {
    await reconcileExpiredCanaryRuns(client);
    const plan = buildPurgePlan(await selectExpiredCanaryResidue(client));
    const targets = await selectTargetIds(client);
    const deleted = await executePurge(client, targets.fundIds, targets.runIds);
    await client.query('COMMIT');
    const result = { ...plan, mode: 'execute', deleted };
    output(JSON.stringify(result, null, 2));
    return result;
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
