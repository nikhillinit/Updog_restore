/**
 * Database seeding utilities for testcontainers
 * Provides batch insert and transaction helpers
 */

import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import * as schema from '@shared/schema';

export interface SeedFixture {
  table: keyof typeof schema;
  data: Array<Record<string, unknown>>;
}

export interface SeedResult {
  insertedIds: Record<string, Array<string | number>>;
  rowCount: number;
}

export interface SeedOptions {
  dryRun?: boolean;
  logger?: (message: string) => void;
}

const DEFAULT_TABLE_ORDER: Array<keyof typeof schema> = [
  'users',
  'funds',
  'portfoliocompanies',
  'fundconfigs',
  'fund_snapshots',
  'fund_events',
  'fund_metrics',
  'fund_distributions',
  'investments',
  'investment_lots',
  'forecast_snapshots',
  'reserve_allocations',
  'reserve_decisions',
  'scenarios',
  'scenario_cases',
  'scenario_audit_logs',
  'fund_state_snapshots',
  'snapshot_metadata',
  'restoration_history',
  'snapshot_comparisons',
  'fund_baselines',
  'variance_reports',
  'performance_alerts',
  'alert_rules',
  'fund_strategy_models',
  'portfolio_scenarios',
  'reserve_allocation_strategies',
  'performance_forecasts',
  'scenario_comparisons',
  'monte_carlo_simulations',
  'reallocation_audit',
  'comparison_configurations',
  'comparison_access_history',
  'notion_connections',
  'notion_sync_jobs',
  'notion_portfolio_configs',
  'notion_database_mappings',
  'activities',
  'deal_opportunities',
  'pipeline_stages',
  'due_diligence_items',
  'scoring_models',
  'pipeline_activities',
  'market_research',
  'financial_projections',
  'custom_fields',
  'custom_fieldvalues',
  'reserve_strategies',
  'pacing_history',
  'audit_log',
];

function sortFixtures(fixtures: SeedFixture[]): SeedFixture[] {
  const orderIndex = new Map<string, number>();
  DEFAULT_TABLE_ORDER.forEach((table, idx) => {
    orderIndex.set(String(table), idx);
  });

  return fixtures
    .map((fixture, index) => ({
      fixture,
      index,
      order: orderIndex.get(String(fixture.table)) ?? DEFAULT_TABLE_ORDER.length + index,
    }))
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.index - b.index;
    })
    .map((item) => item.fixture);
}

function extractIds(rows: Array<Record<string, unknown>>): Array<string | number> {
  const ids: Array<string | number> = [];
  for (const row of rows) {
    const value = row['id'];
    if (typeof value === 'string' || typeof value === 'number') {
      ids.push(value);
    }
  }
  return ids;
}

/**
 * Insert fixtures in dependency order.
 */
export async function seedDatabase(
  container: StartedPostgreSqlContainer,
  fixtures: SeedFixture[],
  options: SeedOptions = {}
): Promise<SeedResult> {
  const logger = options.logger ?? console.log;
  const orderedFixtures = sortFixtures(fixtures);

  if (options.dryRun) {
    const pool = new Pool({
      connectionString: container.getConnectionUri(),
      max: 1,
    });

    try {
      const db = drizzle(pool, { schema });
      let rowCount = 0;

      for (const fixture of orderedFixtures) {
        if (!fixture.data.length) continue;
        const tableRef = schema[fixture.table];
        const query = db
          .insert(tableRef as any)
          .values(fixture.data as any)
          .toSQL();
        logger(`[seedDatabase:dry-run] ${fixture.table}: ${query.sql}`);
        logger(`[seedDatabase:dry-run] params: ${JSON.stringify(query.params)}`);
        rowCount += fixture.data.length;
      }

      return { insertedIds: {}, rowCount };
    } finally {
      await pool.end();
    }
  }

  return seedWithTransaction(container, async ({ db }) => {
    const insertedIds: Record<string, Array<string | number>> = {};
    let rowCount = 0;

    for (const fixture of orderedFixtures) {
      if (!fixture.data.length) continue;

      try {
        const tableRef = schema[fixture.table];
        const rows = (await db
          .insert(tableRef as any)
          .values(fixture.data as any)
          .returning()) as Array<Record<string, unknown>>;

        rowCount += rows.length;
        const ids = extractIds(rows);
        if (ids.length) {
          insertedIds[String(fixture.table)] = ids;
        }
      } catch (error) {
        console.error(`[seedDatabase] Failed to insert ${fixture.table}`, error);
        throw error;
      }
    }

    return { insertedIds, rowCount };
  });
}

/**
 * Run work inside a transaction (commit on success, rollback on error).
 */
export async function seedWithTransaction<T>(
  container: StartedPostgreSqlContainer,
  callback: (helpers: { db: ReturnType<typeof drizzle>; tx: PoolClient }) => Promise<T>
): Promise<T> {
  const pool = new Pool({
    connectionString: container.getConnectionUri(),
    max: 1,
  });

  const client = await pool.connect();
  const db = drizzle(client, { schema });

  try {
    await client.query('BEGIN');
    const result = await callback({ db, tx: client });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[seedWithTransaction] Transaction failed', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Truncate specified tables with CASCADE and identity reset.
 */
export async function clearTables(
  container: StartedPostgreSqlContainer,
  tableNames: string[],
  options: SeedOptions = {}
): Promise<void> {
  if (tableNames.length === 0) return;

  const logger = options.logger ?? console.log;
  const pool = new Pool({
    connectionString: container.getConnectionUri(),
    max: 1,
  });

  try {
    const db = drizzle(pool, { schema });
    const identifiers = tableNames.map((name) => sql.identifier(name));
    const statement = sql`TRUNCATE ${sql.join(identifiers, sql`, `)} RESTART IDENTITY CASCADE`;

    if (options.dryRun) {
      logger(`[clearTables:dry-run] TRUNCATE ${tableNames.join(', ')}`);
      return;
    }

    await db.execute(statement);
  } catch (error) {
    console.error('[clearTables] Failed to truncate tables', error);
    throw error;
  } finally {
    await pool.end();
  }
}
