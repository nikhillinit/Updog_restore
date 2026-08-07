import { describe, expect, it, vi } from 'vitest';

import {
  NEON_HTTP_TRANSACTION_UNSUPPORTED_MESSAGE,
  runWithTransactionFallback,
} from '../../../server/lib/transaction-support';

type FakeTransaction = { transactional: true };
type FakeDatabase = {
  transaction: (callback: (transaction: FakeTransaction) => Promise<string>) => Promise<string>;
};

function databaseRejecting(error: unknown): FakeDatabase {
  return {
    transaction: vi.fn(async () => {
      throw error;
    }),
  };
}

describe('runWithTransactionFallback', () => {
  it('falls back only for the pinned neon-http transaction error', async () => {
    const database = databaseRejecting(new Error(NEON_HTTP_TRANSACTION_UNSUPPORTED_MESSAGE));
    const fallback = vi.fn(
      async (_executor: FakeTransaction, context: { transactional: boolean }) => {
        expect(context.transactional).toBe(false);
        return 'fallback';
      }
    );

    await expect(
      runWithTransactionFallback(database, async (executor, context) => fallback(executor, context))
    ).resolves.toBe('fallback');
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('fails loudly when neon-http changes its transaction error shape', async () => {
    const database = databaseRejecting(new Error('NeOn-HtTp transaction primitive changed'));
    const fallback = vi.fn();

    await expect(
      runWithTransactionFallback(database, async (executor, context) => fallback(executor, context))
    ).rejects.toThrow(
      'neon-http driver transaction error changed shape; update transaction-support pin'
    );
    expect(fallback).not.toHaveBeenCalled();
  });

  it('rethrows unrelated transaction errors unchanged', async () => {
    const error = new Error('database connection lost');
    const database = databaseRejecting(error);
    const fallback = vi.fn();

    await expect(
      runWithTransactionFallback(database, async (executor, context) => fallback(executor, context))
    ).rejects.toBe(error);
    expect(fallback).not.toHaveBeenCalled();
  });
});
