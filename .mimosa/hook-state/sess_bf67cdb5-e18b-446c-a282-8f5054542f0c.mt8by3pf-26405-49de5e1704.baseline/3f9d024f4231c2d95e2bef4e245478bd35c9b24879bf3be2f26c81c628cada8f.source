/** Exact neon-http driver error emitted when transactions are unavailable. */
export const NEON_HTTP_TRANSACTION_UNSUPPORTED_MESSAGE =
  'No transactions support in neon-http driver';
const NEON_HTTP_TRANSACTION_ERROR_CHANGED_MESSAGE =
  'neon-http driver transaction error changed shape; update transaction-support pin';

type TransactionalDatabase<TTransaction> = {
  transaction<T>(callback: (transaction: TTransaction) => Promise<T>): Promise<T>;
};

/** Execute callback in driver transaction. Transaction failures propagate. */
export function runInTransaction<TTransaction, TResult>(
  database: TransactionalDatabase<TTransaction>,
  callback: (transaction: TTransaction) => Promise<TResult>
): Promise<TResult> {
  return database.transaction(callback);
}

export interface TransactionExecutionContext {
  transactional: boolean;
}

function isNeonHttpTransactionUnsupported(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message === NEON_HTTP_TRANSACTION_UNSUPPORTED_MESSAGE) return true;

  const normalizedMessage = error.message.toLowerCase();
  if (normalizedMessage.includes('transaction') && normalizedMessage.includes('neon-http')) {
    throw new Error(NEON_HTTP_TRANSACTION_ERROR_CHANGED_MESSAGE, { cause: error });
  }
  return false;
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
