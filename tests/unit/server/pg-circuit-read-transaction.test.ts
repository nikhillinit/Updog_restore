import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { readTransaction } from '../../../server/db/pg-circuit';
import {
  requestDatabaseStorage,
  type RequestDatabaseScope,
} from '../../../server/db/request-context';
import type { CombinedSchema } from '../../../server/db-schema';

function requestScope(completed = false) {
  const client = { query: vi.fn() } as unknown as PoolClient;
  const runOwnedTransaction = vi.fn();
  const scope: RequestDatabaseScope = {
    context: { userId: 'user-a', email: 'a@example.test', orgId: 'org-a', role: 'admin' },
    db: {} as NodePgDatabase<CombinedSchema>,
    client,
    completed,
    runOwnedTransaction,
  };
  return { client, runOwnedTransaction, scope };
}

describe('pg-circuit readTransaction', () => {
  it('reuses the current request client without opening an owned transaction', async () => {
    const { client, runOwnedTransaction, scope } = requestScope();
    const callback = vi.fn(async (received: PoolClient) => {
      expect(received).toBe(client);
      return 'read';
    });

    await expect(requestDatabaseStorage.run(scope, () => readTransaction(callback))).resolves.toBe(
      'read'
    );
    expect(callback).toHaveBeenCalledTimes(1);
    expect(runOwnedTransaction).not.toHaveBeenCalled();
  });

  it('rejects a completed request scope before invoking the read', async () => {
    const { scope } = requestScope(true);
    const callback = vi.fn();

    await expect(
      requestDatabaseStorage.run(scope, () => readTransaction(callback))
    ).rejects.toThrow('Request database transaction has completed');
    expect(callback).not.toHaveBeenCalled();
  });
});
