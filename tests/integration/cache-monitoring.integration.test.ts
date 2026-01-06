/**
 * Cache Monitoring API Integration Tests
 *
 * Tests cache monitoring and management endpoints with real infrastructure:
 * - GET /api/cache/stats - Cache statistics (Redis + PostgreSQL)
 * - POST /api/cache/invalidate - Cache invalidation (all/fund/matrix scopes)
 * - POST /api/cache/warm - Cache warming (BullMQ job scheduling)
 *
 * Tests graceful degradation (with/without Redis), authentication,
 * and Zod validation.
 *
 * @group integration
 * @group testcontainers
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import { Pool } from 'pg';
import express from 'express';
import type { Application } from 'express';
import request from 'supertest';
import {
  setupTestContainers,
  cleanupTestContainers,
  getPostgresConnectionString,
  getRedisConnection,
} from '../helpers/testcontainers';
import * as schema from '@shared/schema';
import { scenarioMatrices } from '@shared/schema';
import cacheRoutes from '../../server/routes/cache.js';

// Test infrastructure
let pgPool: Pool;
let db: ReturnType<typeof drizzle>;
let redis: RedisClientType;
let app: Application;

describe.skipIf(!process.env.CI && process.platform === 'win32')(
  'Cache Monitoring API Integration',
  () => {
    beforeAll(async () => {
      // Start PostgreSQL + Redis containers
      await setupTestContainers();

      // Connect to PostgreSQL
      pgPool = new Pool({ connectionString: getPostgresConnectionString() });
      db = drizzle(pgPool, { schema });

      // Connect to Redis
      const redisConn = getRedisConnection();
      redis = createClient({ url: `redis://${redisConn.host}:${redisConn.port}` });
      await redis.connect();

      // Setup Express app with cache routes
      app = express();
      app.use(express.json());
      app.use('/api/cache', cacheRoutes);
    }, 90000); // 90s timeout for container startup

    afterAll(async () => {
      await redis?.quit();
      await pgPool?.end();
      await cleanupTestContainers();
    });

    beforeEach(async () => {
      // Clean up between tests
      await redis.flushDb();
      await pgPool.query('TRUNCATE scenario_matrices CASCADE');
    });

    describe('GET /api/cache/stats', () => {
      it('should return cache statistics with empty cache', async () => {
        const response = await request(app).get('/api/cache/stats').expect(200);

        expect(response.body).toMatchObject({
          overview: {
            totalRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            hitRate: 0,
            avgLatencyMs: {
              redis: expect.any(Number),
              postgres: expect.any(Number),
              generation: expect.any(Number),
            },
          },
          storage: {
            redis: {
              entriesCount: 0,
              totalSizeBytes: 0,
              avgEntrySizeBytes: 0,
            },
            postgres: {
              entriesCount: 0,
              totalSizeBytes: 0,
              avgEntrySizeBytes: 0,
            },
          },
          performance: {
            p50LatencyMs: expect.any(Number),
            p95LatencyMs: expect.any(Number),
            p99LatencyMs: expect.any(Number),
            slowestQueries: expect.any(Array),
          },
          recentActivity: {
            last24Hours: {
              requests: 0,
              hits: 0,
              misses: 0,
            },
            last7Days: {
              requests: 0,
              hits: 0,
              misses: 0,
            },
          },
        });
      });

      it('should return PostgreSQL cache statistics', async () => {
        // Seed PostgreSQL with test data
        const testMatrix = Buffer.from(new Float32Array([1.5, 2.0, 3.0]).buffer);
        await db.insert(scenarioMatrices).values({
          fundId: 'test-fund-1',
          taxonomyVersion: 'v1.2',
          matrixKey: 'test-matrix-key-1',
          moicMatrix: testMatrix,
          bucketCount: 3,
          scenarioCount: 1,
          status: 'complete',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const response = await request(app).get('/api/cache/stats').expect(200);

        expect(response.body.storage.postgres).toMatchObject({
          entriesCount: 1,
          totalSizeBytes: expect.any(Number),
          avgEntrySizeBytes: expect.any(Number),
        });

        // Verify size calculations are reasonable
        expect(response.body.storage.postgres.totalSizeBytes).toBeGreaterThan(0);
        expect(response.body.storage.postgres.avgEntrySizeBytes).toBeGreaterThan(0);
      });

      it('should return Redis cache statistics', async () => {
        // Seed Redis with test data
        const testData = JSON.stringify({ data: [1.5, 2.0, 3.0] });
        await redis.set('scenario-matrix:test-key-1', testData, { EX: 3600 });
        await redis.set('scenario-matrix:test-key-2', testData, { EX: 3600 });

        const response = await request(app).get('/api/cache/stats').expect(200);

        expect(response.body.storage.redis).toMatchObject({
          entriesCount: 2,
          totalSizeBytes: expect.any(Number),
          avgEntrySizeBytes: expect.any(Number),
        });

        // Verify size calculations are reasonable
        expect(response.body.storage.redis.totalSizeBytes).toBeGreaterThan(0);
        expect(response.body.storage.redis.avgEntrySizeBytes).toBeGreaterThan(0);
      });
    });

    describe('POST /api/cache/invalidate', () => {
      beforeEach(async () => {
        // Seed test data
        const testMatrix = Buffer.from(new Float32Array([1.5, 2.0]).buffer);
        await db.insert(scenarioMatrices).values([
          {
            fundId: 'fund-1',
            taxonomyVersion: 'v1.2',
            matrixKey: 'matrix-1',
            moicMatrix: testMatrix,
            bucketCount: 2,
            scenarioCount: 1,
            status: 'complete',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            fundId: 'fund-1',
            taxonomyVersion: 'v1.2',
            matrixKey: 'matrix-2',
            moicMatrix: testMatrix,
            bucketCount: 2,
            scenarioCount: 1,
            status: 'complete',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            fundId: 'fund-2',
            taxonomyVersion: 'v1.2',
            matrixKey: 'matrix-3',
            moicMatrix: testMatrix,
            bucketCount: 2,
            scenarioCount: 1,
            status: 'complete',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);

        // Seed Redis
        await redis.set('scenario-matrix:matrix-1', 'data1', { EX: 3600 });
        await redis.set('scenario-matrix:matrix-2', 'data2', { EX: 3600 });
        await redis.set('scenario-matrix:matrix-3', 'data3', { EX: 3600 });
      });

      it('should invalidate all cache entries (scope=all)', async () => {
        const response = await request(app)
          .post('/api/cache/invalidate')
          .send({ scope: 'all' })
          .expect(200);

        expect(response.body).toMatchObject({
          invalidated: {
            redis: 3,
            postgres: 3,
          },
          duration: expect.any(Number),
          auditLog: {
            timestamp: expect.any(String),
            user: 'system',
            reason: expect.any(String),
          },
        });

        // Verify PostgreSQL invalidation
        const pgResult = await pgPool.query(
          "SELECT COUNT(*) FROM scenario_matrices WHERE status = 'invalidated'"
        );
        expect(parseInt(pgResult.rows[0].count, 10)).toBe(3);

        // Verify Redis invalidation
        const keys = await redis.keys('scenario-matrix:*');
        expect(keys).toHaveLength(0);
      });

      it('should invalidate fund-specific entries (scope=fund)', async () => {
        const response = await request(app)
          .post('/api/cache/invalidate')
          .send({ scope: 'fund', fundId: 'fund-1', reason: 'Test invalidation' })
          .expect(200);

        expect(response.body).toMatchObject({
          invalidated: {
            redis: 2, // matrix-1, matrix-2
            postgres: 2,
          },
          duration: expect.any(Number),
          auditLog: {
            reason: 'Test invalidation',
          },
        });

        // Verify PostgreSQL invalidation (only fund-1)
        const pgResult = await pgPool.query(
          "SELECT COUNT(*) FROM scenario_matrices WHERE status = 'invalidated' AND fund_id = 'fund-1'"
        );
        expect(parseInt(pgResult.rows[0].count, 10)).toBe(2);

        // Verify fund-2 is untouched
        const fund2Result = await pgPool.query(
          "SELECT COUNT(*) FROM scenario_matrices WHERE status = 'complete' AND fund_id = 'fund-2'"
        );
        expect(parseInt(fund2Result.rows[0].count, 10)).toBe(1);
      });

      it('should invalidate specific matrix entry (scope=matrix)', async () => {
        const response = await request(app)
          .post('/api/cache/invalidate')
          .send({ scope: 'matrix', matrixKey: 'matrix-1' })
          .expect(200);

        expect(response.body).toMatchObject({
          invalidated: {
            redis: 1,
            postgres: 1,
          },
        });

        // Verify only matrix-1 is invalidated
        const pgResult = await pgPool.query(
          "SELECT status FROM scenario_matrices WHERE matrix_key = 'matrix-1'"
        );
        expect(pgResult.rows[0].status).toBe('invalidated');

        // Verify matrix-2 is untouched
        const matrix2Result = await pgPool.query(
          "SELECT status FROM scenario_matrices WHERE matrix_key = 'matrix-2'"
        );
        expect(matrix2Result.rows[0].status).toBe('complete');
      });

      it('should require fundId for scope=fund', async () => {
        const response = await request(app)
          .post('/api/cache/invalidate')
          .send({ scope: 'fund' })
          .expect(400);

        expect(response.body).toMatchObject({
          error: 'VALIDATION_ERROR',
          message: 'Invalid invalidation request',
          details: expect.any(Array),
        });
      });

      it('should require matrixKey for scope=matrix', async () => {
        const response = await request(app)
          .post('/api/cache/invalidate')
          .send({ scope: 'matrix' })
          .expect(400);

        expect(response.body).toMatchObject({
          error: 'VALIDATION_ERROR',
          details: expect.any(Array),
        });
      });

      it('should reject invalid scope', async () => {
        const response = await request(app)
          .post('/api/cache/invalidate')
          .send({ scope: 'invalid' })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });

      it('should reject extra properties (strict mode)', async () => {
        const response = await request(app)
          .post('/api/cache/invalidate')
          .send({ scope: 'all', extraField: 'not-allowed' })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });
    });

    describe('POST /api/cache/warm', () => {
      it('should schedule cache warming jobs', async () => {
        const response = await request(app)
          .post('/api/cache/warm')
          .send({
            fundIds: ['fund-1', 'fund-2'],
            taxonomyVersion: 'v1.2',
            priority: 'high',
            configs: [
              {
                numScenarios: 1000,
                buckets: [
                  {
                    name: 'bucket-a',
                    capitalAllocation: 0.6,
                    moicCalibration: { median: 2.5, p90: 6.0 },
                  },
                ],
                correlationWeights: {
                  macro: 0.3,
                  systematic: 0.4,
                  idiosyncratic: 0.3,
                },
                recycling: {
                  enabled: false,
                  mode: 'same-bucket',
                },
              },
            ],
          })
          .expect(200);

        expect(response.body).toMatchObject({
          scheduled: 2, // 2 funds × 1 config
          estimated: {
            totalDurationMs: expect.any(Number),
            completionTime: expect.any(String),
          },
          jobs: expect.arrayContaining([
            {
              jobId: expect.any(String),
              configHash: expect.any(String),
              status: 'pending',
            },
          ]),
        });

        expect(response.body.jobs).toHaveLength(2);
      });

      it('should support multiple configs per fund', async () => {
        const response = await request(app)
          .post('/api/cache/warm')
          .send({
            fundIds: ['fund-1'],
            taxonomyVersion: 'v1.2',
            priority: 'low',
            configs: [
              {
                numScenarios: 100,
                buckets: [
                  { name: 'a', capitalAllocation: 1.0, moicCalibration: { median: 2, p90: 5 } },
                ],
                correlationWeights: { macro: 0.33, systematic: 0.33, idiosyncratic: 0.34 },
                recycling: { enabled: false, mode: 'same-bucket' },
              },
              {
                numScenarios: 200,
                buckets: [
                  { name: 'b', capitalAllocation: 1.0, moicCalibration: { median: 3, p90: 7 } },
                ],
                correlationWeights: { macro: 0.33, systematic: 0.33, idiosyncratic: 0.34 },
                recycling: { enabled: false, mode: 'same-bucket' },
              },
            ],
          })
          .expect(200);

        expect(response.body.scheduled).toBe(2); // 1 fund × 2 configs
      });

      it('should enforce fundIds array min/max constraints', async () => {
        // Empty array
        const emptyResponse = await request(app)
          .post('/api/cache/warm')
          .send({
            fundIds: [],
            taxonomyVersion: 'v1.2',
            priority: 'high',
            configs: [
              {
                numScenarios: 100,
                buckets: [
                  { name: 'a', capitalAllocation: 1.0, moicCalibration: { median: 2, p90: 5 } },
                ],
                correlationWeights: { macro: 0.33, systematic: 0.33, idiosyncratic: 0.34 },
                recycling: { enabled: false, mode: 'same-bucket' },
              },
            ],
          })
          .expect(400);

        expect(emptyResponse.body.error).toBe('VALIDATION_ERROR');

        // Too many funds (>10)
        const tooManyResponse = await request(app)
          .post('/api/cache/warm')
          .send({
            fundIds: Array(11).fill('fund'),
            taxonomyVersion: 'v1.2',
            priority: 'high',
            configs: [
              {
                numScenarios: 100,
                buckets: [
                  { name: 'a', capitalAllocation: 1.0, moicCalibration: { median: 2, p90: 5 } },
                ],
                correlationWeights: { macro: 0.33, systematic: 0.33, idiosyncratic: 0.34 },
                recycling: { enabled: false, mode: 'same-bucket' },
              },
            ],
          })
          .expect(400);

        expect(tooManyResponse.body.error).toBe('VALIDATION_ERROR');
      });

      it('should enforce configs array min/max constraints', async () => {
        // Empty configs
        const emptyResponse = await request(app)
          .post('/api/cache/warm')
          .send({
            fundIds: ['fund-1'],
            taxonomyVersion: 'v1.2',
            priority: 'high',
            configs: [],
          })
          .expect(400);

        expect(emptyResponse.body.error).toBe('VALIDATION_ERROR');

        // Too many configs (>5)
        const tooManyResponse = await request(app)
          .post('/api/cache/warm')
          .send({
            fundIds: ['fund-1'],
            taxonomyVersion: 'v1.2',
            priority: 'high',
            configs: Array(6).fill({
              numScenarios: 100,
              buckets: [
                { name: 'a', capitalAllocation: 1.0, moicCalibration: { median: 2, p90: 5 } },
              ],
              correlationWeights: { macro: 0.33, systematic: 0.33, idiosyncratic: 0.34 },
              recycling: { enabled: false, mode: 'same-bucket' },
            }),
          })
          .expect(400);

        expect(tooManyResponse.body.error).toBe('VALIDATION_ERROR');
      });

      it('should enforce numScenarios range (100-50000)', async () => {
        // Too low
        const lowResponse = await request(app)
          .post('/api/cache/warm')
          .send({
            fundIds: ['fund-1'],
            taxonomyVersion: 'v1.2',
            priority: 'high',
            configs: [
              {
                numScenarios: 99,
                buckets: [
                  { name: 'a', capitalAllocation: 1.0, moicCalibration: { median: 2, p90: 5 } },
                ],
                correlationWeights: { macro: 0.33, systematic: 0.33, idiosyncratic: 0.34 },
                recycling: { enabled: false, mode: 'same-bucket' },
              },
            ],
          })
          .expect(400);

        expect(lowResponse.body.error).toBe('VALIDATION_ERROR');

        // Too high
        const highResponse = await request(app)
          .post('/api/cache/warm')
          .send({
            fundIds: ['fund-1'],
            taxonomyVersion: 'v1.2',
            priority: 'high',
            configs: [
              {
                numScenarios: 50001,
                buckets: [
                  { name: 'a', capitalAllocation: 1.0, moicCalibration: { median: 2, p90: 5 } },
                ],
                correlationWeights: { macro: 0.33, systematic: 0.33, idiosyncratic: 0.34 },
                recycling: { enabled: false, mode: 'same-bucket' },
              },
            ],
          })
          .expect(400);

        expect(highResponse.body.error).toBe('VALIDATION_ERROR');
      });

      it('should enforce taxonomyVersion format (v1.2)', async () => {
        const response = await request(app)
          .post('/api/cache/warm')
          .send({
            fundIds: ['fund-1'],
            taxonomyVersion: '1.2', // Missing 'v' prefix
            priority: 'high',
            configs: [
              {
                numScenarios: 100,
                buckets: [
                  { name: 'a', capitalAllocation: 1.0, moicCalibration: { median: 2, p90: 5 } },
                ],
                correlationWeights: { macro: 0.33, systematic: 0.33, idiosyncratic: 0.34 },
                recycling: { enabled: false, mode: 'same-bucket' },
              },
            ],
          })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
        expect(response.body.details[0].message).toMatch(/Must be format: v1\.2/);
      });

      it('should reject invalid priority values', async () => {
        const response = await request(app)
          .post('/api/cache/warm')
          .send({
            fundIds: ['fund-1'],
            taxonomyVersion: 'v1.2',
            priority: 'medium', // Invalid: only 'high' or 'low'
            configs: [
              {
                numScenarios: 100,
                buckets: [
                  { name: 'a', capitalAllocation: 1.0, moicCalibration: { median: 2, p90: 5 } },
                ],
                correlationWeights: { macro: 0.33, systematic: 0.33, idiosyncratic: 0.34 },
                recycling: { enabled: false, mode: 'same-bucket' },
              },
            ],
          })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });

      it('should reject extra properties (strict mode)', async () => {
        const response = await request(app)
          .post('/api/cache/warm')
          .send({
            fundIds: ['fund-1'],
            taxonomyVersion: 'v1.2',
            priority: 'high',
            configs: [
              {
                numScenarios: 100,
                buckets: [
                  { name: 'a', capitalAllocation: 1.0, moicCalibration: { median: 2, p90: 5 } },
                ],
                correlationWeights: { macro: 0.33, systematic: 0.33, idiosyncratic: 0.34 },
                recycling: { enabled: false, mode: 'same-bucket' },
              },
            ],
            extraField: 'not-allowed',
          })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });
    });

    describe('Authentication (X-Health-Key)', () => {
      it('should allow localhost requests without key', async () => {
        // Stats endpoint (public)
        await request(app).get('/api/cache/stats').expect(200);

        // Invalidate endpoint (protected, but localhost bypass)
        await request(app).post('/api/cache/invalidate').send({ scope: 'all' }).expect(200);

        // Warm endpoint (protected, but localhost bypass)
        await request(app)
          .post('/api/cache/warm')
          .send({
            fundIds: ['fund-1'],
            taxonomyVersion: 'v1.2',
            priority: 'high',
            configs: [
              {
                numScenarios: 100,
                buckets: [
                  { name: 'a', capitalAllocation: 1.0, moicCalibration: { median: 2, p90: 5 } },
                ],
                correlationWeights: { macro: 0.33, systematic: 0.33, idiosyncratic: 0.34 },
                recycling: { enabled: false, mode: 'same-bucket' },
              },
            ],
          })
          .expect(200);
      });

      // Note: Testing non-localhost auth requires mocking process.env.HEALTH_KEY and req.ip
      // which is beyond integration test scope. Covered by unit tests instead.
    });
  }
);
