// Testcontainers-only mutation seam. This file is intentionally outside the
// production command path: production can preview but cannot import or reach
// a delete implementation.
import {
  PURGE_RESIDUE_GROUPS,
  PURGE_RESIDUE_GROUP_TABLES,
  topologicallyOrderChildTables,
} from '../../scripts/release/purge-canary-runs.mjs';

const CANARY_ORIGIN = 'release_canary';
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

function rowCount(result) {
  return result.rowCount ?? result.rows?.length ?? 0;
}

function number(value) {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new Error('Release canary purge receipt is invalid');
  return parsed;
}

function receiptFromRow(row) {
  const receipt = Object.fromEntries(
    PURGE_RESIDUE_GROUPS.map((group) => [group, number(row[RESIDUE_COLUMN_BY_GROUP[group]])])
  );
  return {
    ...receipt,
    total: PURGE_RESIDUE_GROUPS.reduce((total, group) => total + receipt[group], 0),
  };
}

function tableCountSql(entry, fundIdSelect) {
  if (entry.scope === 'id')
    return `(SELECT count(*)::int FROM ${entry.table} AS t WHERE t.id = ANY(${fundIdSelect}))`;
  if (entry.scope === 'fund_id')
    return `(SELECT count(*)::int FROM ${entry.table} AS t WHERE t.fund_id = ANY(${fundIdSelect}))`;
  return `(SELECT count(*)::int FROM ${entry.table} AS t JOIN ${entry.scope.via} AS p ON p.id = t.${entry.scope.on} WHERE p.fund_id = ANY(${fundIdSelect}))`;
}

async function countDerivedResidue(client, fundIds) {
  const selections = PURGE_RESIDUE_GROUPS.map(
    (group) =>
      `${PURGE_RESIDUE_GROUP_TABLES[group].map((entry) => tableCountSql(entry, '$1::int[]')).join(' + ')} AS "${RESIDUE_COLUMN_BY_GROUP[group]}"`
  ).join(',\n');
  const result = await client.query(`SELECT ${selections}`, [fundIds]);
  return receiptFromRow(result.rows[0] ?? {});
}

async function listDirectFundForeignKeys(client) {
  const result = await client.query(`
    SELECT format('%I.%I', child_ns.nspname, child.relname) AS table_name,
           format('%I', child_column.attname) AS column_name
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS child ON child.oid = constraint_row.conrelid
    JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_attribute AS child_column
      ON child_column.attrelid = child.oid AND child_column.attnum = constraint_row.conkey[1]
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'public.funds'::regclass
      AND array_length(constraint_row.conkey, 1) = 1
      AND child.oid <> 'public.funds'::regclass
    ORDER BY child_ns.nspname, child.relname, child_column.attname
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
    SELECT format('%I.%I', child_ns.nspname, child.relname) AS child_table,
           format('%I.%I', parent_ns.nspname, parent.relname) AS parent_table
    FROM direct_children
    JOIN pg_constraint AS foreign_key ON foreign_key.conrelid = direct_children.oid
    JOIN pg_class AS child ON child.oid = foreign_key.conrelid
    JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_class AS parent ON parent.oid = foreign_key.confrelid
    JOIN pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
    WHERE foreign_key.contype = 'f'
  `);
  return result.rows;
}

async function deleteDerivedFundRows(client, fundIds, runId) {
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
    const entries = foreignKeysByTable.get(foreignKey.table_name) ?? [];
    entries.push(foreignKey);
    foreignKeysByTable.set(foreignKey.table_name, entries);
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
    `DELETE FROM funds WHERE id = ANY($1::int[]) AND data_origin = $2 AND canary_run_id = $3`,
    [fundIds, CANARY_ORIGIN, runId]
  );
  if ((funds.rowCount ?? 0) !== fundIds.length)
    throw new Error('Release canary purge derived target changed before deletion');
  return deleted + (funds.rowCount ?? 0);
}

export async function purgeCanaryRunForTest(client, { runId, expectedVersion }) {
  if (
    typeof runId !== 'string' ||
    runId.length === 0 ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1
  ) {
    throw new Error('Release canary purge intent is invalid');
  }
  await client.query('BEGIN');
  try {
    const runResult = await client.query(
      `
      SELECT id, status, version, expires_at, purged_at,
             expires_at <= clock_timestamp() AS expired,
             total_residue_count,
             ${Object.values(RESIDUE_COLUMN_BY_GROUP).join(', ')}
      FROM release_canary_runs WHERE id = $1 FOR UPDATE
    `,
      [runId]
    );
    if (rowCount(runResult) !== 1) throw new Error('Release canary purge target was not found');
    const run = runResult.rows[0];
    const receipt = receiptFromRow(run);
    if (number(run.total_residue_count) !== receipt.total)
      throw new Error('Release canary purge stored receipt is inconsistent');
    const version = number(run.version);
    if (run.status === 'purged') {
      if (version !== expectedVersion + 1)
        throw new Error('Release canary purge replay intent does not match tombstone');
      if (run.purged_at == null)
        throw new Error('Release canary purge replay tombstone is malformed');
      const remaining = await client.query(
        `SELECT count(*)::int AS count FROM funds WHERE data_origin = $1 AND canary_run_id = $2`,
        [CANARY_ORIGIN, runId]
      );
      if (number(remaining.rows[0]?.count) !== 0)
        throw new Error('Release canary purge replay still has live derived funds');
      await client.query('COMMIT');
      return { outcome: 'replayed', targetFunds: 0, deleted: 0, receipt, version };
    }
    if (version !== expectedVersion) throw new Error('Release canary purge lost its version fence');
    if (!['completed', 'failed', 'expired'].includes(run.status))
      throw new Error('Release canary purge target is not terminal eligible');
    if (run.expired !== true)
      throw new Error('Release canary purge target has not expired');
    const targets = await client.query(
      `SELECT id FROM funds WHERE data_origin = $1 AND canary_run_id = $2 ORDER BY id FOR UPDATE`,
      [CANARY_ORIGIN, runId]
    );
    const fundIds = targets.rows.map((target) => Number(target.id));
    if (fundIds.length === 0 || fundIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
      throw new Error('Release canary purge has no live derived target');
    }
    const liveReceipt = await countDerivedResidue(client, fundIds);
    if (JSON.stringify(liveReceipt) !== JSON.stringify(receipt))
      throw new Error('Release canary purge live target does not match stored receipt');
    const deleted = await deleteDerivedFundRows(client, fundIds, runId);
    const tombstone = await client.query(
      `
      UPDATE release_canary_runs
      SET status = 'purged', purged_at = clock_timestamp(), version = version + 1, updated_at = clock_timestamp()
      WHERE id = $1 AND version = $2
        AND NOT EXISTS (SELECT 1 FROM funds WHERE data_origin = $3 AND canary_run_id = $1)
      RETURNING version
    `,
      [runId, expectedVersion, CANARY_ORIGIN]
    );
    if (rowCount(tombstone) !== 1)
      throw new Error('Release canary purge tombstone lost its version fence');
    await client.query('COMMIT');
    return {
      outcome: 'purged',
      targetFunds: fundIds.length,
      deleted,
      receipt,
      version: number(tombstone.rows[0].version),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
