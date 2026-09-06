import { AsyncLocalStorage } from 'node:async_hooks';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import type { CombinedSchema } from '../db-schema';
import type { UserContext } from '../lib/secure-context';

export interface RequestDatabaseScope {
  context: UserContext;
  db: NodePgDatabase<CombinedSchema>;
  client: PoolClient;
  completed: boolean;
  runOwnedTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
}

export const requestDatabaseStorage = new AsyncLocalStorage<RequestDatabaseScope>();

export function getRequestDatabaseScope(): RequestDatabaseScope | undefined {
  const scope = requestDatabaseStorage.getStore();
  if (scope?.completed) throw new Error('Request database transaction has completed');
  return scope;
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
