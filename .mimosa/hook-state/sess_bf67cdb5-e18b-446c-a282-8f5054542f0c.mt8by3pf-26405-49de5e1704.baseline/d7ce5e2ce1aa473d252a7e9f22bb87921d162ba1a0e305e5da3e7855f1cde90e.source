/**
 * Vitest global setup for testcontainers
 *
 * Manages container lifecycle across the entire test suite:
 * - Starts PostgreSQL + Redis containers once before all tests
 * - Keeps containers running for entire test suite (reuse pattern)
 * - Cleans up containers after all tests complete
 *
 * @module tests/setup/global-setup.testcontainers
 */

import { setupTestContainers, cleanupTestContainers } from '../helpers/testcontainers';

export async function setup() {
  console.warn('[global-setup] Starting testcontainers for integration tests...');

  try {
    const state = await setupTestContainers();
    console.warn('[global-setup] Testcontainers ready');
    console.warn(`[global-setup] PostgreSQL: ${state.postgres?.getConnectionUri()}`);
    console.warn(
      `[global-setup] Redis: ${state.redis?.getHost()}:${state.redis?.getMappedPort(6379)}`
    );
  } catch (error) {
    console.error('[global-setup] Failed to start testcontainers:', error);
    throw error;
  }
}

export async function teardown() {
  console.warn('[global-setup] Tearing down testcontainers...');
  await cleanupTestContainers();
  console.warn('[global-setup] Testcontainers cleanup complete');
}
