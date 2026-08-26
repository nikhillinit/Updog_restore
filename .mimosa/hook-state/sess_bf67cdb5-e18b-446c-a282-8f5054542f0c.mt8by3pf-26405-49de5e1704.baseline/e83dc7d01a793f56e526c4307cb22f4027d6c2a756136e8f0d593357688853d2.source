import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

export const SCENARIO_MIGRATION_FILES = [
  '0012_scenario_set_id.sql',
  '0013_fund_scenario_sets.sql',
  '0014_fund_scenario_calculated_event.sql',
  '0015_fund_scenario_reserve_allocation.sql',
  '0016_fund_scenario_calculation_runs.sql',
  '0017_fund_scenario_allocation_sector_overrides.sql',
] as const;

export async function applyScenarioMigrations(pool: Pool): Promise<void> {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  for (const file of SCENARIO_MIGRATION_FILES) {
    const sql = await readFile(path.join(process.cwd(), 'server/db/migrations', file), 'utf8');
    await pool.query(sql);
  }
}
