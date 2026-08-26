/**
 * Integration Test Setup Helper
 *
 * Provides:
 * - setupIntegrationTest(): Clears mocks after each test (NO pool cleanup here)
 * - withTransaction(): True isolation via RollbackToken pattern
 *
 * @see docs/plans/option2-session-logs/task_plan.md - Defect 2: Fake Transaction Isolation
 */

import { afterEach, vi } from 'vitest';

/**
 * Setup function for integration tests
 * NOTE: Pool cleanup is handled by global-teardown.ts, NOT here
 */
export function setupIntegrationTest() {
  afterEach(() => {
    vi.clearAllMocks();
  });
}

/**
 * Sentinel error for forced transaction rollback
 * Not a real error - caught and swallowed in withTransaction
 */
class RollbackToken extends Error {
  constructor() {
    super('RollbackToken: Intentional rollback for test isolation');
    this.name = 'RollbackToken';
  }
}

/**
 * Execute callback within a transaction that ALWAYS rolls back
 *
 * This provides true test isolation - no data persists to the database.
 * Uses the "Rollback Exception" pattern: throw an error to force rollback.
 *
 * @example
 * ```typescript
 * await withTransaction(async (tx) => {
 *   await tx.insert(users).values({ name: 'test' });
 *   const result = await tx.select().from(users);
 *   expect(result).toHaveLength(1);
 * });
 * // Data is NOT persisted - transaction was rolled back
 * ```
 */
export async function withTransaction<T>(
  callback: (tx: unknown) => Promise<T>
): Promise<T | undefined> {
  // Dynamic import to avoid import-time side effects
  const { db } = await import('../../server/db/index.js');

  let result: T | undefined;

  try {
    await db.transaction(async (tx: unknown) => {
      result = await callback(tx);
      // FORCE rollback - this is intentional, not an error
      throw new RollbackToken();
    });
  } catch (error) {
    // Swallow our sentinel error, re-throw real errors
    if (!(error instanceof RollbackToken)) {
      throw error;
    }
  }

  return result;
}

/**
 * Check if a pool has waiting connections (leak indicator)
 *
 * @param pool - pg Pool instance
 * @returns true if connections are waiting (potential leak)
 */
export function hasWaitingConnections(pool: unknown): boolean {
  if (!pool || typeof pool !== 'object') return false;
  const p = pool as { waitingCount?: number };
  return typeof p.waitingCount === 'number' && p.waitingCount > 0;
}
