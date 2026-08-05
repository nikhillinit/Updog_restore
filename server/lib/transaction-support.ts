/** Exact neon-http driver error emitted when transactions are unavailable. */
export const NEON_HTTP_TRANSACTION_UNSUPPORTED_MESSAGE =
  'No transactions support in neon-http driver';

type TransactionalDatabase<TTransaction> = {
  transaction<T>(callback: (transaction: TTransaction) => Promise<T>): Promise<T>;
};

export interface TransactionExecutionContext {
  transactional: boolean;
}

function isNeonHttpTransactionUnsupported(error: unknown): boolean {
  return error instanceof Error && error.message === NEON_HTTP_TRANSACTION_UNSUPPORTED_MESSAGE;
}

/**
 * Use a real transaction where the driver supports it. Neon HTTP has no
 * transaction primitive, so only its exact driver error falls back to the
 * plain database executor, whose statements run independently in autocommit.
 */
export async function runWithTransactionFallback<TDatabase, TTransaction, TResult>(
  database: TDatabase & TransactionalDatabase<TTransaction>,
  fn: (executor: TTransaction, context: TransactionExecutionContext) => Promise<TResult>
): Promise<TResult> {
  try {
    return await database.transaction((transaction) => fn(transaction, { transactional: true }));
  } catch (error) {
    if (!isNeonHttpTransactionUnsupported(error)) throw error;
    return fn(database as unknown as TTransaction, { transactional: false });
  }
}
