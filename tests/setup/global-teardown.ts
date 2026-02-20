/**
 * Global teardown for Vitest
 *
 * Runs ONCE after all test files complete.
 * Handles singleton pool cleanup to prevent "Client has been closed" errors
 * in parallel test runs.
 *
 * @see docs/plans/option2-session-logs/task_plan.md - Defect 1: Singleton Suicide
 */

export default async function globalTeardown() {
  console.warn('[globalTeardown] Cleaning up database connections...');

  try {
    // Dynamic import to avoid side effects during setup phase
    const { shutdownDatabases } = await import('../../server/db/index.js');

    if (typeof shutdownDatabases === 'function') {
      await shutdownDatabases();
      console.warn('[globalTeardown] Database connections closed');
    }
  } catch (error) {
    // Swallow errors - teardown should be idempotent
    // Pool might already be closed or never created
    console.warn('[globalTeardown] Cleanup warning:', error);
  }
}
