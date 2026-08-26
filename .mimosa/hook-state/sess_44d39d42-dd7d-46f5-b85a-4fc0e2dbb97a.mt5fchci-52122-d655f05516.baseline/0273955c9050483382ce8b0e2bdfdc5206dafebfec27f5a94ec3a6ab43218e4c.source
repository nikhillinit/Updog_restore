import type { Pool } from 'pg';
import { expect } from 'vitest';

export interface PostgresReplayDriftScenario<TCatalog> {
  name: string;
  seed: (pool: Pool) => Promise<void>;
  outcome: 'applies' | 'refuses';
  expectedError?: RegExp;
  assertBeforeRefusal?: (catalog: TCatalog) => void;
  assertAfterApply?: (catalog: TCatalog) => void | Promise<void>;
}

interface PostgresReplayDriftFactoryOptions<TCatalog, TLedger> {
  scenario: PostgresReplayDriftScenario<TCatalog>;
  createDatabase: (name: string) => Promise<{ connectionString: string }>;
  withPool: <T>(connectionString: string, callback: (pool: Pool) => Promise<T>) => Promise<T>;
  captureCatalog: (pool: Pool) => Promise<TCatalog>;
  captureLedger: (pool: Pool) => Promise<TLedger>;
  runMigration: (connectionString: string) => Promise<unknown>;
  assertApplied: (pool: Pool, connectionString: string, ledgerBefore: TLedger) => Promise<void>;
  assertRefused: (
    pool: Pool,
    connectionString: string,
    catalogBefore: TCatalog,
    ledgerBefore: TLedger
  ) => Promise<void>;
}

/**
 * Executes one PostgreSQL migration replay mutation with isolated database,
 * catalog and ledger snapshots, and transactional refusal proof.
 */
export async function exercisePostgresReplayDriftScenario<TCatalog, TLedger>(
  options: PostgresReplayDriftFactoryOptions<TCatalog, TLedger>
): Promise<void> {
  const { scenario } = options;
  const { connectionString } = await options.createDatabase(
    `drizzle-catalog-${scenario.name.replaceAll(/[^a-z]+/g, '-')}`
  );

  await options.withPool(connectionString, async (pool) => {
    await scenario.seed(pool);
    const catalogBefore = await options.captureCatalog(pool);
    const ledgerBefore = await options.captureLedger(pool);

    if (scenario.outcome === 'applies') {
      await expect(options.runMigration(connectionString)).resolves.toBeDefined();
      const catalogAfter = await options.captureCatalog(pool);
      await scenario.assertAfterApply?.(catalogAfter);
      expect(await options.captureLedger(pool)).not.toEqual(ledgerBefore);
      await options.assertApplied(pool, connectionString, ledgerBefore);
      return;
    }

    scenario.assertBeforeRefusal?.(catalogBefore);
    await expect(options.runMigration(connectionString)).rejects.toThrow(scenario.expectedError);
    expect(await options.captureCatalog(pool)).toEqual(catalogBefore);
    expect(await options.captureLedger(pool)).toEqual(ledgerBefore);
    await options.assertRefused(pool, connectionString, catalogBefore, ledgerBefore);
  });
}
