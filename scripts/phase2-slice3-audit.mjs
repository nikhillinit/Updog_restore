#!/usr/bin/env node
/**
 * Phase 2 Slice 3 operator audit/apply helper.
 *
 * Default mode is audit-only:
 *   node scripts/phase2-slice3-audit.mjs --environment staging
 *
 * Apply mode requires explicit confirmation:
 *   node scripts/phase2-slice3-audit.mjs --environment staging --apply --yes
 */

// Load environment variables before DB imports.
import { config } from 'dotenv';
config({ quiet: true });

import { mkdir, writeFile } from 'fs/promises';
import { spawn } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { stringify } from 'csv-stringify/sync';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

const RETIRED_TABLES = [
  'scenario_comparisons',
  'comparison_configurations',
  'comparison_access_history',
];

const LIVE_BACKTEST_RESULT_COLUMNS = [
  'scenario_comparisons',
  'scenario_comparison_summary',
];

function printHelp() {
  console.log(`Phase 2 Slice 3 audit/apply helper

Usage:
  node scripts/phase2-slice3-audit.mjs --environment <name> [--artifact-dir <dir>]
  node scripts/phase2-slice3-audit.mjs --environment <name> --apply --yes [--artifact-dir <dir>]

Options:
  --environment <name>   Logical target label used in output artifacts.
  --artifact-dir <dir>   Directory for CSV/JSON audit artifacts.
                         Default: ./artifacts/phase2-slice3
  --apply                Run npm run db:push after the audit/export steps.
  --yes                  Required with --apply to acknowledge destructive rollout.
  --help                 Show this message.

Environment:
  DATABASE_URL must point at the target PostgreSQL environment.
`);
}

function parseArgs(argv) {
  const options = {
    environment: null,
    artifactDir: resolve(repoRoot, 'artifacts', 'phase2-slice3'),
    apply: false,
    confirmed: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case '--environment':
        options.environment = argv[i + 1];
        i += 1;
        break;
      case '--artifact-dir':
        options.artifactDir = resolve(process.cwd(), argv[i + 1]);
        i += 1;
        break;
      case '--apply':
        options.apply = true;
        break;
      case '--yes':
        options.confirmed = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.environment) {
    throw new Error('--environment is required');
  }

  if (options.apply && !options.confirmed) {
    throw new Error('--apply requires --yes');
  }

  return options;
}

function sanitizeLabel(value) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

async function queryScalar(client, sql, params = []) {
  const result = await client.query(sql, params);
  return Object.values(result.rows[0] ?? {})[0];
}

async function tableExists(client, tableName) {
  return queryScalar(client, 'select to_regclass($1) is not null as exists', [`public.${tableName}`]);
}

async function countTableRows(client, tableName) {
  if (!RETIRED_TABLES.includes(tableName)) {
    throw new Error(`Unexpected table name: ${tableName}`);
  }

  const sql = `select count(*)::bigint as count from public.${tableName}`;
  const count = await queryScalar(client, sql);
  return Number(count);
}

async function backtestResultsColumnExists(client, columnName) {
  return queryScalar(
    client,
    `select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'backtest_results'
        and column_name = $1
    ) as exists`,
    [columnName]
  );
}

async function exportTableToCsv(client, tableName, artifactDir, environmentLabel, timestamp) {
  const result = await client.query(`select * from public.${tableName}`);
  const columns = result.fields.map((field) => field.name);
  const fileName = `${environmentLabel}-${tableName}-${timestamp}.csv`;
  const filePath = resolve(artifactDir, fileName);
  const csv = stringify(result.rows, {
    header: true,
    columns,
  });

  await writeFile(filePath, csv, 'utf8');

  return {
    table: tableName,
    rowCount: result.rowCount,
    filePath,
  };
}

async function collectPreState(client) {
  const tableStates = {};
  for (const table of RETIRED_TABLES) {
    tableStates[table] = {
      exists: await tableExists(client, table),
    };
  }

  const backtestResultsTable = await tableExists(client, 'backtest_results');
  const liveColumns = {};
  for (const column of LIVE_BACKTEST_RESULT_COLUMNS) {
    liveColumns[column] = await backtestResultsColumnExists(client, column);
  }

  return {
    retiredTables: tableStates,
    backtestResultsTable,
    liveColumns,
  };
}

async function addRowCounts(client, state) {
  for (const [table, info] of Object.entries(state.retiredTables)) {
    if (info.exists) {
      info.count = await countTableRows(client, table);
    } else {
      info.count = null;
    }
  }

  return state;
}

async function runDbPush() {
  await new Promise((resolvePromise, rejectPromise) => {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(npmCommand, ['run', 'db:push'], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`npm run db:push exited with code ${code}`));
    });
  });
}

function assertPreconditions(state) {
  if (!state.backtestResultsTable) {
    throw new Error('backtest_results is missing; stop because DATABASE_URL points at the wrong schema');
  }

  for (const column of LIVE_BACKTEST_RESULT_COLUMNS) {
    if (!state.liveColumns[column]) {
      throw new Error(`backtest_results.${column} is missing before rollout; stop because the target schema is not the expected Phase 2 baseline`);
    }
  }
}

function assertPostconditions(state) {
  if (!state.backtestResultsTable) {
    throw new Error('backtest_results disappeared after db:push');
  }

  for (const [table, info] of Object.entries(state.retiredTables)) {
    if (info.exists) {
      throw new Error(`Retired table still exists after apply: ${table}`);
    }
  }

  for (const column of LIVE_BACKTEST_RESULT_COLUMNS) {
    if (!state.liveColumns[column]) {
      throw new Error(`Live column missing after apply: backtest_results.${column}`);
    }
  }
}

function printAuditState(state, heading) {
  console.log(`\n[${heading}]`);
  console.log(`  backtest_results present: ${state.backtestResultsTable ? 'yes' : 'no'}`);

  for (const [table, info] of Object.entries(state.retiredTables)) {
    const countLabel = info.count === null || info.count === undefined ? 'n/a' : String(info.count);
    console.log(`  ${table}: exists=${info.exists ? 'yes' : 'no'}, count=${countLabel}`);
  }

  for (const [column, exists] of Object.entries(state.liveColumns)) {
    console.log(`  backtest_results.${column}: ${exists ? 'present' : 'missing'}`);
  }
}

async function writeSummaryFile(artifactDir, environmentLabel, summary) {
  const filePath = resolve(artifactDir, `${environmentLabel}-slice3-audit-summary.json`);
  await writeFile(filePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return filePath;
}

async function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[FAIL] ${error.message}`);
    printHelp();
    process.exit(1);
  }

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (!process.env.DATABASE_URL) {
    console.error('[FAIL] DATABASE_URL is required');
    process.exit(1);
  }

  const environmentLabel = sanitizeLabel(options.environment);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  await mkdir(options.artifactDir, { recursive: true });

  const summary = {
    environment: options.environment,
    databaseUrlConfigured: true,
    timestamp,
    applyRequested: options.apply,
    artifactDir: options.artifactDir,
    exports: [],
    steps: [],
  };

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  let client = await pool.connect();

  try {
    console.log(`[START] Phase 2 Slice 3 audit for environment: ${options.environment}`);
    console.log(`[INFO] Artifact directory: ${options.artifactDir}`);

    summary.steps.push('connected');

    const preState = await addRowCounts(client, await collectPreState(client));
    summary.preState = preState;
    assertPreconditions(preState);
    printAuditState(preState, 'PRE-APPLY STATE');

    const alreadyApplied = Object.values(preState.retiredTables).every((info) => !info.exists);
    if (alreadyApplied) {
      summary.steps.push('already-applied');
      const summaryFile = await writeSummaryFile(options.artifactDir, environmentLabel, summary);
      console.log('\n[PASS] Slice 3 tables are already absent in this environment.');
      console.log(`[INFO] Summary written to ${summaryFile}`);
      return;
    }

    const nonZeroTables = Object.entries(preState.retiredTables)
      .filter(([, info]) => info.exists && Number(info.count) > 0)
      .map(([table]) => table);

    if (nonZeroTables.length > 0) {
      console.log(`\n[INFO] Exporting non-zero retired tables before apply: ${nonZeroTables.join(', ')}`);
      for (const table of nonZeroTables) {
        const exportInfo = await exportTableToCsv(
          client,
          table,
          options.artifactDir,
          environmentLabel,
          timestamp
        );
        summary.exports.push(exportInfo);
        console.log(`  exported ${table} -> ${exportInfo.filePath}`);
      }
      summary.steps.push('exported-nonzero-retired-tables');
    } else {
      summary.steps.push('all-retired-tables-empty');
      console.log('\n[PASS] All retired tables are empty.');
    }

    if (!options.apply) {
      const summaryFile = await writeSummaryFile(options.artifactDir, environmentLabel, summary);
      console.log('\n[NEXT] Audit complete. Re-run with --apply --yes to execute npm run db:push.');
      console.log(`[INFO] Summary written to ${summaryFile}`);
      return;
    }

    summary.steps.push('db-push-started');
    console.log('\n[APPLY] Running npm run db:push');
    client.release();
    client = null;
    await runDbPush();

    client = await pool.connect();
    summary.steps.push('db-push-completed');

    const postState = await collectPreState(client);
    summary.postState = postState;
    assertPostconditions(postState);
    printAuditState(postState, 'POST-APPLY STATE');

    const summaryFile = await writeSummaryFile(options.artifactDir, environmentLabel, summary);
    console.log('\n[PASS] Slice 3 audit and apply completed successfully.');
    console.log(`[INFO] Summary written to ${summaryFile}`);
  } catch (error) {
    summary.failure = {
      message: error.message,
      stack: error.stack,
    };

    const summaryFile = await writeSummaryFile(options.artifactDir, environmentLabel, summary);
    console.error(`[INFO] Partial summary written to ${summaryFile}`);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(`\n[FAIL] ${error.message}`);
  process.exit(1);
});
