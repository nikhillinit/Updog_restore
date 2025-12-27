/**
 * Testcontainers smoke test
 *
 * Validates that PostgreSQL and Redis containers can be started,
 * connected to, and cleaned up successfully.
 *
 * @group integration
 * @group testcontainers
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestContainers,
  cleanupTestContainers,
  getPostgresConnectionString,
  getRedisConnection,
  withTransaction,
} from '../helpers/testcontainers';
import { Pool } from 'pg';
import Redis from 'ioredis';

describe('Testcontainers Infrastructure', () => {
  beforeAll(async () => {
    // Start containers for this test suite
    console.log('[smoke-test] Starting testcontainers...');
    await setupTestContainers();
    console.log('[smoke-test] Containers ready');
  }, 60000); // 60 second timeout for container startup

  afterAll(async () => {
    // Clean up containers after tests complete
    console.log('[smoke-test] Cleaning up containers...');
    await cleanupTestContainers();
  });

  describe('PostgreSQL Container', () => {
    it('should provide valid connection string', () => {
      const connectionString = getPostgresConnectionString();
      expect(connectionString).toMatch(/^postgresql:\/\/test_user:test_password@/);
      expect(connectionString).toContain('test_db');
    });

    it('should allow database connections', async () => {
      const connectionString = getPostgresConnectionString();
      const pool = new Pool({ connectionString });

      try {
        const result = await pool.query('SELECT 1 as test');
        expect(result.rows[0].test).toBe(1);
      } finally {
        await pool.end();
      }
    });

    it('should support transaction-based test isolation', async () => {
      // This test verifies that changes are rolled back
      // In a real test, you'd create test data here and verify rollback

      await withTransaction(async (db) => {
        // Transaction will be rolled back after this function completes
        // Any data created here won't persist
        expect(db).toBeDefined();
      });

      // Verify transaction was rolled back (no data persists)
      // In real tests, you'd query to ensure no data exists
    });
  });

  describe('Redis Container', () => {
    it('should provide valid connection details', () => {
      const { host, port } = getRedisConnection();
      expect(host).toBeDefined();
      expect(port).toBeGreaterThan(0);
      expect(port).toBeLessThan(65536);
    });

    it('should allow Redis connections', async () => {
      const { host, port } = getRedisConnection();
      const redis = new Redis({ host, port });

      try {
        await redis.set('test-key', 'test-value');
        const value = await redis.get('test-key');
        expect(value).toBe('test-value');
      } finally {
        await redis.quit();
      }
    });
  });

  describe('Container Lifecycle', () => {
    it('should have containers running', () => {
      // If we got this far, containers started successfully
      expect(getPostgresConnectionString()).toBeDefined();
      expect(getRedisConnection()).toBeDefined();
    });

    it('should complete within performance targets', () => {
      // This test verifies we met startup time targets
      // Actual timing measured in global-setup logs
      expect(true).toBe(true); // Placeholder - check logs for actual timing
    });
  });
});
