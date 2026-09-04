import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { lockFinancialFactsFund } from '../../../../server/services/financial-facts/fund-lock';

class RecordingTransaction {
  readonly statements: unknown[] = [];

  execute(statement: unknown): Promise<{ rows: [] }> {
    this.statements.push(statement);
    return Promise.resolve({ rows: [] });
  }
}

function rendered(statement: unknown): { sql: string; params: unknown[] } {
  const query = new PgDialect().sqlToQuery(
    statement as Parameters<PgDialect['sqlToQuery']>[0]
  );
  return { sql: query.sql, params: query.params };
}

describe('lockFinancialFactsFund', () => {
  it('issues only today advisory-lock SQL without timeouts', async () => {
    const transaction = new RecordingTransaction();

    await lockFinancialFactsFund(transaction as never, 42);

    expect(transaction.statements).toHaveLength(1);
    expect(rendered(transaction.statements[0])).toEqual({
      sql: 'SELECT pg_advisory_xact_lock(hashtext($1))',
      params: ['financial-facts:42'],
    });
  });

  it('sets statement and lock timeouts before acquiring the advisory lock', async () => {
    const transaction = new RecordingTransaction();

    await lockFinancialFactsFund(transaction as never, 42, {
      statementTimeoutMs: 10_000,
      lockTimeoutMs: 2_000,
    });

    expect(transaction.statements.map(rendered)).toEqual([
      { sql: 'SET LOCAL statement_timeout = 10000', params: [] },
      { sql: 'SET LOCAL lock_timeout = 2000', params: [] },
      {
        sql: 'SELECT pg_advisory_xact_lock(hashtext($1))',
        params: ['financial-facts:42'],
      },
    ]);
  });

  it.each([
    { statementTimeoutMs: 0, lockTimeoutMs: 1 },
    { statementTimeoutMs: -1, lockTimeoutMs: 1 },
    { statementTimeoutMs: 1.5, lockTimeoutMs: 1 },
    { statementTimeoutMs: 1, lockTimeoutMs: 0 },
    { statementTimeoutMs: 1, lockTimeoutMs: -1 },
    { statementTimeoutMs: 1, lockTimeoutMs: 1.5 },
  ])('rejects non-positive or non-integer timeouts: %o', async (timeouts) => {
    await expect(
      lockFinancialFactsFund(new RecordingTransaction() as never, 42, timeouts)
    ).rejects.toThrow(/positive integer/);
  });
});
