/**
 * Testcontainers infrastructure for integration tests
 *
 * Provides PostgreSQL and Redis container management with:
 * - Health check polling before test execution
 * - Dynamic port allocation (no conflicts)
 * - Graceful cleanup and container lifecycle management
 * - Transaction-based isolation between test suites
 * - Graceful degradation when Docker is unavailable
 *
 * @module tests/helpers/testcontainers
 */

import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedTestContainer } from 'testcontainers';
import { GenericContainer, Wait } from 'testcontainers';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { execSync } from 'child_process';
import * as schema from '@shared/schema';

/**
 * Check if Docker is available on the system
 *
 * @returns true if Docker daemon is running and accessible
 */
export function isDockerAvailable(): boolean {
  try {
    // Try docker info - most reliable way to check Docker daemon status
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    // Docker command not found or daemon not running
    return false;
  }
}

/**
 * Skip message for tests that require Docker
 */
export const DOCKER_SKIP_MESSAGE = 'Docker not available - skipping integration test';

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

  const container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withExposedPorts(5432)
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .withWaitStrategy(Wait.forLogMessage(/.*database system is ready to accept connections.*/))
    .withStartupTimeout(30000) // 30 second max startup
    .start();

  console.log(`[testcontainers] PostgreSQL started on port ${container.getPort()}`);

  // Run migrations with connection retry logic
  const pool = new Pool({
    connectionString: container.getConnectionUri(),
    max: 1, // Single connection for migrations
    connectionTimeoutMillis: 10000, // 10s connection timeout
    idleTimeoutMillis: 30000, // 30s idle timeout
  });

  try {
    // Wait for PostgreSQL to be ready with exponential backoff
    await waitForPostgres(pool, 5, 1000); // 5 retries, 1s initial delay

    const db = drizzle(pool, { schema });

    // Create required PostgreSQL extensions BEFORE running migrations
    console.log('[testcontainers] Creating PostgreSQL extensions...');
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;'); // For gen_random_uuid()
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;'); // For pgvector (agent_memories)
    console.log('[testcontainers] Extensions created');

    console.log('[testcontainers] Running Drizzle migrations...');
    await migrate(db, {
      migrationsFolder: './migrations',
      migrationsTable: 'drizzle_migrations',
    });
    console.log('[testcontainers] Migrations complete');
  } catch (error) {
    console.error('[testcontainers] Migration failed', error);
    throw error;
  } finally {
    await pool.end();
  }

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
 * Wait for PostgreSQL to be ready to accept queries with exponential backoff
 *
 * @param pool - PostgreSQL connection pool
 * @param maxRetries - Maximum number of retry attempts (default: 5)
 * @param initialDelay - Initial delay in milliseconds (default: 1000)
 * @throws Error if PostgreSQL is not ready after max retries
 */
async function waitForPostgres(
  pool: Pool,
  maxRetries: number = 5,
  initialDelay: number = 1000
): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Simple query to verify PostgreSQL is ready
      await pool.query('SELECT 1');
      console.log(`[testcontainers] PostgreSQL ready after ${attempt + 1} attempt(s)`);
      return;
    } catch (error) {
      const delay = initialDelay * Math.pow(2, attempt);
      console.log(
        `[testcontainers] PostgreSQL not ready (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`
      );

      if (attempt === maxRetries - 1) {
        console.error('[testcontainers] PostgreSQL failed to become ready', error);
        throw new Error(
          `PostgreSQL not ready after ${maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
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
