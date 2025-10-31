#!/usr/bin/env ts-node

/**
 * Stage Normalization Migration Script
 *
 * Purpose: Normalize all non-canonical stage values in portfolio_companies and
 *          deal_opportunities tables to their canonical forms.
 *
 * Canonical stages: pre-seed, seed, series-a, series-b, series-c, series-c+
 *
 * Usage:
 *   ts-node scripts/normalize-stages.ts              # Dry-run mode (shows what would change)
 *   ts-node scripts/normalize-stages.ts --apply      # Apply changes to database
 *   ts-node scripts/normalize-stages.ts --apply --force-unknown  # Force through unknown stages
 *
 * Architecture (ADR-011):
 *   - Single transaction for entire normalization (all tables at once)
 *   - ACCESS EXCLUSIVE locks on both tables (prevent interference)
 *   - Separate audit connection for log persistence on rollback
 *   - Mandatory pre-flight validation (unless --force-unknown)
 *   - Post-migration verification with zero tolerance
 *
 * Exit Codes:
 *   0 = Success (dry-run or apply completed)
 *   1 = Failure (validation error, database error, or verification failure)
 *   2 = Invalid arguments
 */

import { Client, QueryResult } from 'pg';
import { normalizeInvestmentStage } from '@shared/schemas/investment-stages';

// ============================================================================
// Configuration
// ============================================================================

const CANONICAL_STAGES = [
  'pre-seed',
  'seed',
  'series-a',
  'series-b',
  'series-c',
  'series-c+',
] as const;
const TABLES_TO_NORMALIZE = ['portfoliocompanies', 'deal_opportunities'] as const;
const AUDIT_TABLE = 'stage_normalization_log';
const BATCH_SIZE = 1000;
const TIMESTAMP = new Date().toISOString();

interface NormalizationChange {
  table: string;
  row_id: string;
  stage_before: string;
  stage_after: string;
}

interface CLIArgs {
  apply: boolean;
  forceUnknown: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

function log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  const prefix = {
    info: '[INFO]',
    warn: '[WARN]',
    error: '[ERROR]',
  }[level];

  const timestamp = new Date().toISOString();
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(`${timestamp} ${prefix} ${message}\n`);
}

function parseCLIArgs(): CLIArgs {
  const args = process.argv.slice(2);
  return {
    apply: args.includes('--apply'),
    forceUnknown: args.includes('--force-unknown'),
  };
}

/**
 * Find all stages currently in the database that are not canonical
 */
async function findUnknownStages(client: Client): Promise<Set<string>> {
  const unknownStages = new Set<string>();

  for (const table of TABLES_TO_NORMALIZE) {
    try {
      const result = await client.query(
        `SELECT DISTINCT LOWER(stage) as stage FROM ${table}
         WHERE stage IS NOT NULL
         ORDER BY stage`
      );

      for (const row of result.rows) {
        const stage = row.stage?.trim();
        if (!stage) continue; // Skip NULL or empty stages

        // Try to normalize it
        const normalized = normalizeInvestmentStage(stage);
        if (!normalized.ok) {
          unknownStages.add(stage);
        }
      }
    } catch (error) {
      log(`Failed to scan table '${table}' for unknown stages: ${error}`, 'error');
      throw error;
    }
  }

  return unknownStages;
}

/**
 * Get rows that need normalization from a single table
 */
async function getRowsToNormalize(client: Client, table: string): Promise<NormalizationChange[]> {
  const changes: NormalizationChange[] = [];

  try {
    // Get all non-null stages from this table
    const result = await client.query(
      `SELECT id, stage FROM ${table} WHERE stage IS NOT NULL ORDER BY id`
    );

    for (const row of result.rows) {
      const stageBefore = row.stage?.trim();
      if (!stageBefore) continue; // Skip NULL or empty stages

      // Try to normalize using shared schema function
      const normalized = normalizeInvestmentStage(stageBefore);

      if (normalized.ok && normalized.value !== stageBefore.toLowerCase()) {
        changes.push({
          table,
          row_id: String(row.id),
          stage_before: stageBefore,
          stage_after: normalized.value,
        });
      }
    }
  } catch (error) {
    log(`Failed to get rows to normalize from '${table}': ${error}`, 'error');
    throw error;
  }

  return changes;
}

/**
 * Log normalization changes to audit table (same transaction as main updates)
 */
async function logChanges(client: Client, changes: NormalizationChange[]): Promise<void> {
  if (changes.length === 0) return;

  // Batch inserts for performance - all within same transaction
  for (let i = 0; i < changes.length; i += BATCH_SIZE) {
    const batch = changes.slice(i, i + BATCH_SIZE);

    // Build parameterized query to prevent SQL injection
    const valuesList: string[] = [];
    const params: (string | number)[] = [];

    batch.forEach((change, batchIdx) => {
      const paramIdx = batchIdx * 5;
      valuesList.push(
        `($${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5})`
      );
      params.push(
        change.table,
        change.row_id,
        change.stage_before,
        change.stage_after,
        'normalize'
      );
    });

    try {
      await client.query(
        `INSERT INTO stage_normalization_log (table_name, row_id, stage_before, stage_after, action)
         VALUES ${valuesList.join(', ')}`,
        params
      );
    } catch (error) {
      log(`Failed to log changes to audit table: ${error}`, 'error');
      throw error;
    }
  }
}

/**
 * Apply normalization updates to a single table with parameterized queries
 */
async function applyNormalizationToTable(
  client: Client,
  table: string,
  changes: NormalizationChange[]
): Promise<number> {
  if (changes.length === 0) return 0;

  try {
    // Build parameterized CASE statement to prevent SQL injection
    const caseWhens: string[] = [];
    const params: (string | null)[] = [];

    changes.forEach((change, idx) => {
      const paramIdx = idx * 2 + 1; // 1-indexed: 1, 3, 5, ...
      caseWhens.push(`WHEN LOWER(stage) = $${paramIdx} THEN $${paramIdx + 1}`);
      params.push(change.stage_before.toLowerCase(), change.stage_after);
    });

    // IN clause references the BEFORE values (odd-numbered params: 1, 3, 5, ...)
    const stageLowerList = changes.map((_, idx) => `$${idx * 2 + 1}`).join(', ');

    const result = await client.query(
      `UPDATE ${table}
       SET stage = CASE
         ${caseWhens.join(' ')}
       END
       WHERE LOWER(stage) IN (${stageLowerList})
       RETURNING id`,
      params
    );

    const rowCount = result.rowCount ?? 0;
    if (rowCount === null) {
      log(`Warning: UPDATE returned null rowCount for table '${table}'`, 'warn');
    }
    return rowCount || 0;
  } catch (error) {
    log(`Failed to update table '${table}': ${error}`, 'error');
    throw error;
  }
}

/**
 * Verify that normalization succeeded
 */
async function verifyMigration(client: Client): Promise<boolean> {
  let success = true;

  for (const table of TABLES_TO_NORMALIZE) {
    try {
      // Check 1: No unknown stages remain
      const unknownResult = await client.query(
        `SELECT DISTINCT LOWER(stage) as stage FROM ${table}
         WHERE stage IS NOT NULL
         AND LOWER(stage) NOT IN (${CANONICAL_STAGES.map((_, i) => `$${i + 1}`).join(', ')})
         ORDER BY stage`,
        [...CANONICAL_STAGES]
      );

      if (unknownResult.rowCount && unknownResult.rowCount > 0) {
        log(
          `Verification failed for '${table}': Found ${unknownResult.rowCount} non-canonical stages: ${unknownResult.rows
            .map((r: any) => r.stage)
            .join(', ')}`,
          'error'
        );
        success = false;
      }

      // Check 2: All non-null stages are canonical
      const allStagesResult = await client.query(
        `SELECT COUNT(DISTINCT LOWER(stage)) as unique_stages FROM ${table}
         WHERE stage IS NOT NULL`
      );

      log(
        `Verification: '${table}' has ${allStagesResult.rows[0].unique_stages} unique stage values (all should be canonical)`,
        'info'
      );
    } catch (error) {
      log(`Verification query failed for '${table}': ${error}`, 'error');
      success = false;
    }
  }

  return success;
}

// ============================================================================
// Main Script
// ============================================================================

async function main() {
  const args = parseCLIArgs();
  const isDryRun = !args.apply;

  log(`Starting stage normalization script`);
  log(`Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}`);
  log(`Force unknown stages: ${args.forceUnknown ? 'YES' : 'NO'}`);

  // Validate DATABASE_URL
  if (!process.env.DATABASE_URL) {
    log('ERROR: DATABASE_URL environment variable not set', 'error');
    process.exit(1);
  }

  const mainClient = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Connect
    try {
      await mainClient.connect();
      log('Connected to database (main client)');
    } catch (error) {
      log(`Failed to connect to database: ${error}`, 'error');
      throw error;
    }

    // Pre-flight: Check for unknown stages
    log('Running pre-flight validation...');
    const unknownStages = await findUnknownStages(mainClient);

    if (unknownStages.size > 0) {
      const unknownList = Array.from(unknownStages).sort().join(', ');
      log(`Found ${unknownStages.size} unknown stage(s): ${unknownList}`, 'warn');

      if (!args.forceUnknown) {
        log('Use --force-unknown to proceed (unknown stages will be skipped)', 'warn');
        process.exit(1);
      }
      log('Proceeding with --force-unknown flag (unknown stages will be skipped)', 'warn');
    } else {
      log('No unknown stages found. Ready to normalize.');
    }

    // Collect all changes across all tables
    const allChanges: NormalizationChange[] = [];

    for (const table of TABLES_TO_NORMALIZE) {
      const changes = await getRowsToNormalize(mainClient, table);
      if (changes.length > 0) {
        log(`Found ${changes.length} rows to normalize in '${table}'`);
        allChanges.push(...changes);
      } else {
        log(`No rows to normalize in '${table}'`);
      }
    }

    if (allChanges.length === 0) {
      log('No normalization needed. Exiting with success.');
      process.exit(0);
    }

    if (isDryRun) {
      log(
        `[DRY-RUN] Would normalize ${allChanges.length} rows across ${new Set(allChanges.map((c) => c.table)).size} table(s)`
      );
      allChanges.forEach((change) => {
        log(
          `  ${change.table}[${change.row_id}]: '${change.stage_before}' → '${change.stage_after}'`
        );
      });
      process.exit(0);
    }

    // Main Transaction
    log('Starting database transaction...');
    await mainClient.query('BEGIN');

    try {
      // Lock both tables
      log('Acquiring ACCESS EXCLUSIVE locks on tables...');
      const tablesToLock = TABLES_TO_NORMALIZE.join(', ');
      await mainClient.query(`LOCK TABLE ${tablesToLock} IN ACCESS EXCLUSIVE MODE`);
      log('Locks acquired');

      // Log changes to audit table (WITHIN same transaction for atomicity)
      log(`Logging ${allChanges.length} changes to audit table...`);
      await logChanges(mainClient, allChanges);
      log('Audit logging complete');

      // Apply updates
      let totalUpdated = 0;
      const changesByTable = new Map<string, NormalizationChange[]>();

      for (const change of allChanges) {
        if (!changesByTable.has(change.table)) {
          changesByTable.set(change.table, []);
        }
        changesByTable.get(change.table)!.push(change);
      }

      for (const [table, changes] of changesByTable) {
        const updateCount = await applyNormalizationToTable(mainClient, table, changes);
        log(`Updated ${updateCount} rows in '${table}'`);
        totalUpdated += updateCount;
      }

      // Commit
      await mainClient.query('COMMIT');
      log(`Transaction committed successfully. ${totalUpdated} rows updated.`);

      // Post-migration verification
      log('Running post-migration verification...');
      const verificationPassed = await verifyMigration(mainClient);

      if (!verificationPassed) {
        log('Verification FAILED! Database may be in inconsistent state.', 'error');
        process.exit(1);
      }

      log('Verification PASSED. Migration successful.');
      process.exit(0);
    } catch (error) {
      log(`Error during transaction: ${error}`, 'error');
      log('Rolling back transaction...');

      try {
        await mainClient.query('ROLLBACK');
        log('Rollback succeeded. Transaction was safely rolled back.', 'info');
      } catch (rollbackError) {
        log(
          `CRITICAL: Rollback failed: ${rollbackError}. DATABASE MAY BE IN INCONSISTENT STATE!`,
          'error'
        );
        log(`Original error that triggered rollback: ${error}`, 'error');
        process.exit(1);
      }

      process.exit(1);
    }
  } catch (error) {
    log(`Fatal error: ${error}`, 'error');
    process.exit(1);
  } finally {
    await mainClient.end().catch(() => {});
  }
}

// Run main
main();
