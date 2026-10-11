import { AsyncLocalStorage } from 'node:async_hooks';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PgTransaction } from 'drizzle-orm/pg-core';
import type { PoolClient } from 'pg';
import type { CombinedSchema } from '../db-schema';
import type { UserContext } from '../lib/secure-context';

export interface RequestDatabaseScope {
  context: UserContext;
  db: NodePgDatabase<CombinedSchema>;
  client: PoolClient;
  completed: boolean;
  executionTimeoutMs?: number;
  runOwnedTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
}

export const requestDatabaseStorage = new AsyncLocalStorage<RequestDatabaseScope>();

export class DatabaseContextTimeoutError extends Error {
  constructor() {
    super('Database transaction execution deadline exceeded');
    this.name = 'DatabaseContextTimeoutError';
  }
}

export function getRequestDatabaseScope(): RequestDatabaseScope | undefined {
  const scope = requestDatabaseStorage.getStore();
  if (scope?.completed) throw new Error('Request database transaction has completed');
  return scope;
}

/**
 * Run a read whose failure the caller catches and replaces with a fallback.
 * Inside a transaction the read gets its own savepoint: a failed statement
 * rolls back only the savepoint, so the caller's transaction stays usable
 * instead of failing every later statement with 25P02. Outside a transaction
 * the read runs unchanged.
 */
export function withReadSavepoint<D extends object, T>(
  database: D,
  read: (database: D) => Promise<T>
): Promise<T> {
  if (getRequestDatabaseScope() === undefined && !(database instanceof PgTransaction)) {
    return read(database);
  }
  // The `db` proxy forwards transaction() to the request transaction, and a
  // drizzle transaction's transaction() opens a savepoint on its connection.
  const transactional = database as unknown as {
    transaction<R>(callback: (savepoint: D) => Promise<R>): Promise<R>;
  };
  return transactional.transaction(read);
}

export async function applyRLSContext(client: PoolClient, context: UserContext): Promise<void> {
  if (!context.userId || typeof context.orgId !== 'string')
    throw new Error('Verified database context required');
  // Missing organization claims clear prior scope; organization policies must deny empty scope.
  await client.query(
    `SELECT set_config('app.current_user', $1, true),
      set_config('app.current_email', $2, true),
      set_config('app.current_org', $3, true),
      set_config('app.current_fund', $4, true),
      set_config('app.current_role', $5, true),
      set_config('app.current_partner', $6, true)`,
    [
      context.userId,
      context.email,
      context.orgId,
      context.fundId ?? '',
      context.role,
      context.partnerId ?? '',
    ]
  );
  await client.query("SET LOCAL statement_timeout = '10s'");
  await client.query("SET LOCAL lock_timeout = '2s'");
  await client.query("SET LOCAL idle_in_transaction_session_timeout = '30s'");
}
