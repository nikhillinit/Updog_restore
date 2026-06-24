import { readFileSync } from 'node:fs';
import path from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import { setupTestDB } from '../../helpers/testcontainers';

const STARTUP_TIMEOUT_MS = 90_000;
const skipIfNoDocker = !process.env.CI && process.platform === 'win32';

let container: Awaited<ReturnType<typeof setupTestDB>> | undefined;
let pool: Pool | undefined;

function loadJournalTags(): string[] {
  const journalPath = path.join(process.cwd(), 'migrations', 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ tag: string }>;
  };
  return journal.entries.map((entry) => entry.tag);
}

async function hasColumn(tableName: string, columnName: string): Promise<boolean> {
  expect(pool).toBeDefined();
  const db = drizzle(pool!);
  const rows = await db.execute(sql`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
      AND column_name = ${columnName}
  `);
  return rows.rows.length === 1;
}

async function hasConstraint(constraintName: string): Promise<boolean> {
  expect(pool).toBeDefined();
  const db = drizzle(pool!);
  const rows = await db.execute(sql`
    SELECT 1
    FROM pg_constraint
    WHERE conname = ${constraintName}
  `);
  return rows.rows.length === 1;
}

async function hasIndex(indexName: string): Promise<boolean> {
  expect(pool).toBeDefined();
  const db = drizzle(pool!);
  const rows = await db.execute(sql`
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = ${indexName}
  `);
  return rows.rows.length === 1;
}

describe.skipIf(skipIfNoDocker)('PR-E2 MOIC journaled migration', () => {
  beforeAll(async () => {
    container = await setupTestDB();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 4 });
  }, STARTUP_TIMEOUT_MS * 2);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it('journals the prior reconciliation migration before the PR-E2 migration', () => {
    const tags = loadJournalTags();

    expect(tags).toContain('0016_reconciliation_runs');
    expect(tags).toContain('0017_moic_exit_probability_modes');
    expect(tags.indexOf('0016_reconciliation_runs')).toBeLessThan(
      tags.indexOf('0017_moic_exit_probability_modes')
    );
  });

  it('creates PR-E2 MOIC input, mode, and idempotency structures', async () => {
    await expect(hasColumn('portfoliocompanies', 'exit_probability')).resolves.toBe(true);
    await expect(hasConstraint('portfoliocompanies_exit_probability_check')).resolves.toBe(true);
    await expect(hasConstraint('reconciliation_runs_fund_id_idempotency_key_unique')).resolves.toBe(
      true
    );

    await expect(hasColumn('fund_calculation_modes', 'configured_mode')).resolves.toBe(true);
    await expect(hasColumn('fund_calculation_modes', 'last_moic_source_input_hash')).resolves.toBe(
      true
    );
    await expect(hasConstraint('fund_calculation_modes_configured_mode_check')).resolves.toBe(true);
    await expect(hasConstraint('fund_calculation_modes_fund_calculation_key_unique')).resolves.toBe(
      true
    );
    await expect(hasIndex('idx_fund_calculation_modes_fund_updated')).resolves.toBe(true);

    await expect(hasColumn('fund_calculation_mode_requests', 'request_hash')).resolves.toBe(true);
    await expect(hasConstraint('fund_calculation_mode_requests_scope_unique')).resolves.toBe(true);
    await expect(hasColumn('fund_moic_input_update_requests', 'request_hash')).resolves.toBe(true);
    await expect(hasConstraint('fund_moic_input_update_requests_scope_unique')).resolves.toBe(true);
  });
});
