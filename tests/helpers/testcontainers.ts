/**
 * Testcontainers infrastructure for integration tests
 *
 * Provides PostgreSQL and Redis container management with:
 * - Health check polling before test execution
 * - Dynamic port allocation (no conflicts)
 * - Graceful cleanup and container lifecycle management
 * - Transaction-based isolation between test suites
 *
 * @module tests/helpers/testcontainers
 */

import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedTestContainer } from 'testcontainers';
import { GenericContainer, Wait } from 'testcontainers';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@shared/schema';

/**
 * Container lifecycle state
 */
interface ContainerState {
  postgres?: StartedPostgreSqlContainer;
  redis?: StartedTestContainer;
  pgPool?: Pool;
  cleanup: () => Promise<void>;
}

let globalState: ContainerState | null = null;

/**
 * Setup PostgreSQL testcontainer with migrations
 *
 * @returns Started PostgreSQL container with connection details
 */
export async function setupTestDB(): Promise<StartedPostgreSqlContainer> {
  console.log('[testcontainers] Starting PostgreSQL container...');

  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withExposedPorts(5432)
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .withWaitStrategy(Wait.forLogMessage(/.*database system is ready to accept connections.*/))
    .withStartupTimeout(30000) // 30 second max startup
    .start();

  console.log(`[testcontainers] PostgreSQL started on port ${container.getPort()}`);

  // Run migrations
  // TODO: Implement migration running after Drizzle config finalized
  // const connectionUri = container.getConnectionUri();
  // const pool = new Pool({ connectionString: connectionUri });
  // const db = drizzle(pool, { schema });
  // console.log('[testcontainers] Running Drizzle migrations...');
  // await migrate(db, { migrationsFolder: './drizzle' });
  // console.log('[testcontainers] Migrations complete');

  return container;
}

/**
 * Setup Redis testcontainer
 *
 * @returns Started Redis container with connection details
 */
export async function setupTestRedis(): Promise<StartedTestContainer> {
  console.log('[testcontainers] Starting Redis container...');

  const container = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/.*Ready to accept connections.*/))
    .withStartupTimeout(10000) // 10 second max startup
    .start();

  console.log(`[testcontainers] Redis started on port ${container.getMappedPort(6379)}`);

  return container;
}

/**
 * Setup both PostgreSQL and Redis containers
 * Containers are started in parallel for performance
 *
 * @returns Container state with cleanup function
 */
export async function setupTestContainers(): Promise<ContainerState> {
  const startTime = Date.now();
  console.log('[testcontainers] Starting PostgreSQL + Redis in parallel...');

  // Start both containers in parallel
  const [postgres, redis] = await Promise.all([setupTestDB(), setupTestRedis()]);

  const elapsed = Date.now() - startTime;
  console.log(`[testcontainers] All containers started in ${elapsed}ms`);

  // Create connection pool for database access
  const pgPool = new Pool({ connectionString: postgres.getConnectionUri() });

  // Cleanup function captures current state to avoid race conditions
  const cleanupFn = async () => {
    console.log('[testcontainers] Cleaning up containers...');
    await pgPool?.end();
    await Promise.all([postgres?.stop(), redis?.stop()]);
    console.log('[testcontainers] Cleanup complete');
  };

  const state: ContainerState = {
    postgres,
    redis,
    pgPool,
    cleanup: cleanupFn,
  };

  globalState = state;
  return state;
}

/**
 * Get current container state (if containers are running)
 *
 * @returns Container state or null if not initialized
 */
export function getContainerState(): ContainerState | null {
  return globalState;
}

/**
 * Cleanup all running containers
 * Safe to call multiple times (idempotent)
 */
export async function cleanupTestContainers(): Promise<void> {
  const state = globalState;
  if (state) {
    await state.cleanup();
    // eslint-disable-next-line require-atomic-updates
    globalState = null;
  }
}

/**
 * Get PostgreSQL connection string from running container
 *
 * @returns Connection string or throws if container not started
 */
export function getPostgresConnectionString(): string {
  if (!globalState?.postgres) {
    throw new Error('PostgreSQL container not started - call setupTestContainers() first');
  }
  return globalState.postgres.getConnectionUri();
}

/**
 * Get Redis connection details from running container
 *
 * @returns Redis host and port or throws if container not started
 */
export function getRedisConnection(): { host: string; port: number } {
  if (!globalState?.redis) {
    throw new Error('Redis container not started - call setupTestContainers() first');
  }
  return {
    host: globalState.redis.getHost(),
    port: globalState.redis.getMappedPort(6379),
  };
}

/**
 * Execute database query within a transaction that will be rolled back
 * Use this for test isolation - changes won't persist between tests
 *
 * @param callback - Function that receives a Drizzle database connection
 * @returns Result of callback function
 */
export async function withTransaction<T>(
  callback: (db: ReturnType<typeof drizzle>) => Promise<T>
): Promise<T> {
  if (!globalState?.pgPool) {
    throw new Error('PostgreSQL pool not initialized - call setupTestContainers() first');
  }

  const client = await globalState.pgPool.connect();
  const db = drizzle(client, { schema });

  try {
    await client.query('BEGIN');
    const result = await callback(db);
    await client.query('ROLLBACK'); // Always rollback for test isolation
    return result;
  } finally {
    client.release();
  }
}
