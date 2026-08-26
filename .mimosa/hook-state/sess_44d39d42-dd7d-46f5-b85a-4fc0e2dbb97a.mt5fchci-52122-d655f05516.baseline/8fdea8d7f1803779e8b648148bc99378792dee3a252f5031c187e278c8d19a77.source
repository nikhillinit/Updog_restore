import { escapeIdentifier, Pool } from 'pg';

type PoolErrorListener = (error: Error) => void;

interface PoolLifecycle {
  end(): Promise<void>;
  on(event: 'error', listener: PoolErrorListener): unknown;
  off(event: 'error', listener: PoolErrorListener): unknown;
}

interface DatabaseAdmin {
  query(sql: string): Promise<unknown>;
}

export interface ManagedIsolatedDatabasePool<TPool extends PoolLifecycle> {
  readonly pool: TPool;
  dropDatabase(adminPool: DatabaseAdmin, databaseName: string): Promise<void>;
}

function isExpectedPostgresStopError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  const message = error instanceof Error ? error.message : String(error);
  return code === '57P01' || /terminating connection due to administrator command/i.test(message);
}

export function manageIsolatedDatabasePool<TPool extends PoolLifecycle>(
  pool: TPool
): ManagedIsolatedDatabasePool<TPool> {
  let isDroppingDatabase = false;
  const handlePoolError: PoolErrorListener = (error) => {
    if (isDroppingDatabase && isExpectedPostgresStopError(error)) {
      return;
    }
    throw error;
  };

  pool.on('error', handlePoolError);

  return {
    pool,
    async dropDatabase(adminPool, databaseName) {
      isDroppingDatabase = true;
      try {
        const poolEndResult = await Promise.allSettled([pool.end()]);
        const dropResult = await Promise.allSettled([
          adminPool.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(databaseName)} WITH (FORCE)`),
        ]);
        const poolEnd = poolEndResult[0];
        const drop = dropResult[0];
        const unexpectedFailures: unknown[] = [];
        if (poolEnd.status === 'rejected' && !isExpectedPostgresStopError(poolEnd.reason)) {
          unexpectedFailures.push(poolEnd.reason);
        }
        if (drop.status === 'rejected') {
          unexpectedFailures.push(drop.reason);
        }
        if (unexpectedFailures.length > 1) {
          throw new AggregateError(unexpectedFailures, 'Isolated database cleanup failed');
        }
        if (unexpectedFailures.length === 1) {
          throw unexpectedFailures[0];
        }
      } finally {
        isDroppingDatabase = false;
        pool.off('error', handlePoolError);
      }
    },
  };
}

export function createIsolatedDatabasePool(
  connectionString: string
): ManagedIsolatedDatabasePool<Pool> {
  return manageIsolatedDatabasePool(new Pool({ connectionString, max: 1 }));
}
