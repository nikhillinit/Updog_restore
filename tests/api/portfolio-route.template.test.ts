/**
 * Portfolio Route API Integration Tests Template
 *
 * This template demonstrates comprehensive testing patterns for the Portfolio Route API,
 * including Testcontainers setup, database seeding, idempotency testing, optimistic locking,
 * and pagination scenarios.
 *
 * Version: 1.0.0
 * Created: 2025-11-08
 *
 * @module tests/api/portfolio-route.template.test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express, { type Application } from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Queue } from 'bullmq';

// Import schemas and validators

// Import test utilities
import {
  PortfolioApiClient,
  assertValidLot,
  assertValidSnapshot,
  assertValidPagination,
  assertBigIntEquals,
  seedTestPortfolio,
  type SeedResult,
} from '../utils/portfolio-route-test-utils';

// Import test fixtures
import {
  createLotRequestFactory,
  createSnapshotRequestFactory,
  createUpdateSnapshotRequestFactory,
  getStatusTransitionScenarios,
  generateLotBatch,
} from '../fixtures/portfolio-route-fixtures';

// =====================
// TEST INFRASTRUCTURE SETUP
// =====================

/**
 * @group integration
 * Testcontainers integration test template - requires Docker
 */
describe.skip('Portfolio Route API - Integration Tests', () => {
  // Testcontainers instances
  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedTestContainer;

  // Database and queue clients
  let db: NodePgDatabase;
  let pool: Pool;
  let queue: Queue;

  // Express app and API client
  let app: Application;
  let apiClient: PortfolioApiClient;

  // Test data
  let seedData: SeedResult;

  // =====================
  // GLOBAL SETUP/TEARDOWN
  // =====================

  beforeAll(async () => {
    // Start PostgreSQL container
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('updog_test')
      .withUsername('test_user')
      .withPassword('test_password')
      .withExposedPorts(5432)
      .start();

    // Start Redis container
    redisContainer = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();

    // Initialize database connection
    const connectionString = pgContainer.getConnectionUri();
    pool = new Pool({ connectionString });
    db = drizzle(pool);

    // Run migrations
    await migrate(db, { migrationsFolder: './migrations' });

    // Initialize BullMQ queue
    const redisHost = redisContainer.getHost();
    const redisPort = redisContainer.getMappedPort(6379);
    queue = new Queue('snapshot-calculations', {
      connection: { host: redisHost, port: redisPort },
    });

    // Initialize Express app (import your actual app setup here)
    app = express();
    app.use(express.json());

    // TODO: Mount your actual portfolio routes here
    // app.use('/api', portfolioRoutes);

    // Initialize API client
    apiClient = new PortfolioApiClient(app);
  }, 60000); // 60s timeout for container startup

  afterAll(async () => {
    // Cleanup connections
    await queue.close();
    await pool.end();

    // Stop containers
    await pgContainer.stop();
    await redisContainer.stop();
  });

  // =====================
  // PER-TEST SETUP/TEARDOWN
  // =====================

  beforeEach(async () => {
    // Seed test data
    seedData = await seedTestPortfolio(db, {
      investmentCount: 3,
      lotsPerInvestment: 2,
      snapshotCount: 2,
    });
  });

  afterEach(async () => {
    // Cleanup test data
    await seedData.cleanup();
  });

  // =====================
  // ENDPOINT 1: POST /api/funds/:fundId/portfolio/snapshots
  // =====================

  describe('POST /api/funds/:fundId/portfolio/snapshots', () => {
    describe('Happy Paths', () => {
      it('should create snapshot successfully (202 Accepted)', async () => {
        // Arrange
        const payload = createSnapshotRequestFactory({
          name: 'Q4 2024 Snapshot',
        });

        // Act
        const response = await apiClient.createSnapshot(seedData.fundId, payload);

        // Assert
        expect(response.snapshotId).toBeDefined();
        expect(response.status).toMatch(/^(pending|calculating)$/);
        expect(response.statusUrl).toContain(`/api/snapshots/${response.snapshotId}`);
        expect(response.retryAfter).toBeGreaterThan(0);

        // Verify database persistence
        const snapshot = await db.query.forecastSnapshots.findFirst({
          where: (snapshots, { eq }) => eq(snapshots.id, response.snapshotId),
        });
        expect(snapshot).toBeDefined();
        expect(snapshot!.name).toBe(payload.name);

        // Verify background job queued
        const job = await queue.getJob(response.snapshotId);
        expect(job).toBeDefined();
      });

      it('should handle idempotency: duplicate request returns same snapshot', async () => {
        // Arrange
        const idempotencyKey = randomUUID();
        const payload = createSnapshotRequestFactory({ idempotencyKey });

        // Act
        const response1 = await apiClient.createSnapshot(seedData.fundId, payload);
        const response2 = await apiClient.createSnapshot(seedData.fundId, payload);

        // Assert
        expect(response2.snapshotId).toBe(response1.snapshotId);
        expect(response2.status).toBe(response1.status);

        // Verify only one snapshot in database
        const snapshots = await db.query.forecastSnapshots.findMany({
          where: (snapshots, { eq }) => eq(snapshots.idempotencyKey, idempotencyKey),
        });
        expect(snapshots).toHaveLength(1);
      });
    });

    describe('Error Scenarios', () => {
      it('should return 404 for non-existent fund', async () => {
        // Arrange
        const nonExistentFundId = 999999;
        const payload = createSnapshotRequestFactory();

        // Act & Assert
        await request(app)
          .post(`/api/funds/${nonExistentFundId}/portfolio/snapshots`)
          .send(payload)
          .expect(404)
          .expect((res) => {
            expect(res.body.error).toContain('Fund not found');
          });
      });

      it('should return 400 for missing required fields', async () => {
        // Arrange
        const invalidPayload = { idempotencyKey: randomUUID() }; // Missing 'name'

        // Act & Assert
        await request(app)
          .post(`/api/funds/${seedData.fundId}/portfolio/snapshots`)
          .send(invalidPayload)
          .expect(400)
          .expect((res) => {
            expect(res.body.error).toBeDefined();
            expect(res.body.error).toContain('name');
          });
      });

      it('should return 400 for invalid idempotency key format', async () => {
        // Arrange
        const payload = {
          name: 'Test Snapshot',
          idempotencyKey: 'not-a-uuid',
        };

        // Act & Assert
        await request(app)
          .post(`/api/funds/${seedData.fundId}/portfolio/snapshots`)
          .send(payload)
          .expect(400);
      });
    });
  });

  // =====================
  // ENDPOINT 2: GET /api/funds/:fundId/portfolio/snapshots
  // =====================

  describe('GET /api/funds/:fundId/portfolio/snapshots', () => {
    describe('Pagination', () => {
      beforeEach(async () => {
        // Create 25 snapshots for pagination testing
        for (let i = 0; i < 25; i++) {
          await apiClient.createSnapshot(seedData.fundId, {
            name: `Snapshot ${i}`,
          });
        }
      });

      it('should paginate with cursor (default limit)', async () => {
        // Act
        const page1 = await apiClient.listSnapshots(seedData.fundId);

        // Assert
        expect(page1.snapshots.length).toBeLessThanOrEqual(20); // Default limit
        assertValidPagination(page1, true);

        // Fetch next page
        const page2 = await apiClient.listSnapshots(seedData.fundId, {
          cursor: page1.pagination.nextCursor,
        });

        expect(page2.snapshots.length).toBeGreaterThan(0);
        expect(page2.snapshots[0].id).not.toBe(page1.snapshots[0].id);
      });

      it('should respect custom limit', async () => {
        // Act
        const response = await apiClient.listSnapshots(seedData.fundId, {
          limit: 5,
        });

        // Assert
        expect(response.snapshots.length).toBeLessThanOrEqual(5);
      });

      it('should handle last page correctly', async () => {
        // Act
        const response = await apiClient.listSnapshots(seedData.fundId, {
          limit: 100, // Larger than total count
        });

        // Assert
        assertValidPagination(response, false); // No more results
        expect(response.pagination.nextCursor).toBeUndefined();
      });
    });

    describe('Filtering', () => {
      it('should filter by status', async () => {
        // Act
        const response = await apiClient.listSnapshots(seedData.fundId, {
          status: 'complete',
        });

        // Assert
        expect(response.snapshots.every((s) => s.status === 'complete')).toBe(true);
      });

      it('should return empty array for no matches', async () => {
        // Arrange: Ensure no error snapshots exist
        await db
          .delete(db.schema.forecastSnapshots)
          .where((snapshots, { eq }) => eq(snapshots.status, 'error'));

        // Act
        const response = await apiClient.listSnapshots(seedData.fundId, {
          status: 'error',
        });

        // Assert
        expect(response.snapshots).toHaveLength(0);
        assertValidPagination(response, false);
      });
    });
  });

  // =====================
  // ENDPOINT 3: GET /api/snapshots/:snapshotId
  // =====================

  describe('GET /api/snapshots/:snapshotId', () => {
    it('should get complete snapshot with metrics', async () => {
      // Arrange
      const snapshotId = seedData.snapshotIds[0]; // First snapshot is complete

      // Act
      const response = await apiClient.getSnapshotStatus(snapshotId);

      // Assert
      assertValidSnapshot(response.snapshot);
      expect(response.snapshot.status).toBe('complete');
      expect(response.snapshot.calculatedMetrics).toBeDefined();
      expect(response.progress).toBeUndefined(); // No progress for complete snapshot
    });

    it('should get calculating snapshot with progress', async () => {
      // Arrange: Create snapshot and set to calculating
      const payload = createSnapshotRequestFactory();
      const createResp = await apiClient.createSnapshot(seedData.fundId, payload);

      // Simulate worker starting calculation
      await db
        .update(db.schema.forecastSnapshots)
        .set({ status: 'calculating' })
        .where((snapshots, { eq }) => eq(snapshots.id, createResp.snapshotId));

      // Act
      const response = await apiClient.getSnapshotStatus(createResp.snapshotId);

      // Assert
      expect(response.snapshot.status).toBe('calculating');
      expect(response.progress).toBeDefined();
      expect(response.progress!.current).toBeGreaterThanOrEqual(0);
      expect(response.progress!.total).toBeGreaterThan(0);
      expect(response.retryAfter).toBeDefined();
    });

    it('should return 404 for non-existent snapshot', async () => {
      // Arrange
      const nonExistentId = randomUUID();

      // Act & Assert
      await request(app)
        .get(`/api/snapshots/${nonExistentId}`)
        .expect(404)
        .expect((res) => {
          expect(res.body.error).toContain('Snapshot not found');
        });
    });
  });

  // =====================
  // ENDPOINT 4: POST /api/funds/:fundId/portfolio/lots
  // =====================

  describe('POST /api/funds/:fundId/portfolio/lots', () => {
    describe('Happy Paths', () => {
      it('should create lot successfully', async () => {
        // Arrange
        const payload = createLotRequestFactory({
          investmentId: seedData.investmentIds[0],
        });

        // Act
        const response = await apiClient.createLot(seedData.fundId, payload);

        // Assert
        expect(response.created).toBe(true);
        assertValidLot(response.lot);
        expect(response.lot.investmentId).toBe(payload.investmentId);
        expect(response.lot.lotType).toBe(payload.lotType);

        // Verify database persistence
        const lot = await db.query.investmentLots.findFirst({
          where: (lots, { eq }) => eq(lots.id, response.lot.id),
        });
        expect(lot).toBeDefined();
      });

      it('should validate cost basis approximately equals price * shares', async () => {
        // Arrange
        const sharePriceCents = BigInt(250_000); // $2.50/share
        const sharesAcquired = '1000.00';
        const expectedCost = BigInt(250_000 * 1000); // $2,500
        const payload = createLotRequestFactory({
          investmentId: seedData.investmentIds[0],
          sharePriceCents: sharePriceCents.toString(),
          sharesAcquired,
          costBasisCents: expectedCost.toString(),
        });

        // Act
        const response = await apiClient.createLot(seedData.fundId, payload);

        // Assert
        assertBigIntEquals(response.lot.costBasisCents, expectedCost, BigInt(1000)); // ±$10 tolerance
      });

      it('should handle idempotency for duplicate lots', async () => {
        // Arrange
        const idempotencyKey = randomUUID();
        const payload = createLotRequestFactory({
          investmentId: seedData.investmentIds[0],
          idempotencyKey,
        });

        // Act
        const response1 = await apiClient.createLot(seedData.fundId, payload);
        const response2 = await apiClient.createLot(seedData.fundId, payload);

        // Assert
        expect(response1.created).toBe(true);
        expect(response2.created).toBe(false); // Duplicate
        expect(response2.lot.id).toBe(response1.lot.id);
      });
    });

    describe('Error Scenarios', () => {
      it('should return 404 for non-existent investment', async () => {
        // Arrange
        const payload = createLotRequestFactory({
          investmentId: 999999,
        });

        // Act & Assert
        await request(app)
          .post(`/api/funds/${seedData.fundId}/portfolio/lots`)
          .send(payload)
          .expect(404);
      });

      it('should return 400 for invalid lot type', async () => {
        // Arrange
        const payload = {
          ...createLotRequestFactory({
            investmentId: seedData.investmentIds[0],
          }),
          lotType: 'invalid_type',
        };

        // Act & Assert
        await request(app)
          .post(`/api/funds/${seedData.fundId}/portfolio/lots`)
          .send(payload)
          .expect(400);
      });

      it('should return 400 for cost basis mismatch', async () => {
        // Arrange
        const payload = createLotRequestFactory({
          investmentId: seedData.investmentIds[0],
          sharePriceCents: BigInt(100_000).toString(), // $1.00/share
          sharesAcquired: '1000.00',
          costBasisCents: BigInt(500_000_00).toString(), // $5,000 (way off!)
        });

        // Act & Assert
        await request(app)
          .post(`/api/funds/${seedData.fundId}/portfolio/lots`)
          .send(payload)
          .expect(400)
          .expect((res) => {
            expect(res.body.error).toContain('costBasisCents');
          });
      });
    });
  });

  // =====================
  // ENDPOINT 5: GET /api/funds/:fundId/portfolio/lots
  // =====================

  describe('GET /api/funds/:fundId/portfolio/lots', () => {
    describe('Filtering', () => {
      it('should filter by investmentId', async () => {
        // Arrange
        const targetInvestmentId = seedData.investmentIds[0];

        // Act
        const response = await apiClient.listLots(seedData.fundId, {
          investmentId: targetInvestmentId,
        });

        // Assert
        expect(response.lots.every((lot) => lot.investmentId === targetInvestmentId)).toBe(true);
      });

      it('should filter by lotType', async () => {
        // Act
        const response = await apiClient.listLots(seedData.fundId, {
          lotType: 'follow_on',
        });

        // Assert
        expect(response.lots.every((lot) => lot.lotType === 'follow_on')).toBe(true);
      });

      it('should combine filters (investmentId + lotType)', async () => {
        // Arrange
        const targetInvestmentId = seedData.investmentIds[0];

        // Act
        const response = await apiClient.listLots(seedData.fundId, {
          investmentId: targetInvestmentId,
          lotType: 'initial',
        });

        // Assert
        expect(
          response.lots.every(
            (lot) => lot.investmentId === targetInvestmentId && lot.lotType === 'initial'
          )
        ).toBe(true);
      });
    });

    describe('Pagination', () => {
      it('should paginate lots with cursor', async () => {
        // Arrange: Create 50 lots
        const lots = generateLotBatch(50, seedData.investmentIds[0]);
        for (const lot of lots) {
          await db.insert(db.schema.investmentLots).values(lot);
        }

        // Act
        const page1 = await apiClient.listLots(seedData.fundId, { limit: 20 });
        const page2 = await apiClient.listLots(seedData.fundId, {
          limit: 20,
          cursor: page1.pagination.nextCursor,
        });

        // Assert
        expect(page1.lots.length).toBe(20);
        expect(page2.lots.length).toBeGreaterThan(0);
        assertValidPagination(page1, true);
      });
    });
  });

  // =====================
  // ENDPOINT 6: PUT /api/snapshots/:snapshotId
  // =====================

  describe('PUT /api/snapshots/:snapshotId', () => {
    describe('Optimistic Locking', () => {
      it('should update successfully with correct version', async () => {
        // Arrange
        const snapshotId = seedData.snapshotIds[0];
        const currentSnapshot = await db.query.forecastSnapshots.findFirst({
          where: (snapshots, { eq }) => eq(snapshots.id, snapshotId),
        });
        const payload = createUpdateSnapshotRequestFactory({
          name: 'Updated Name',
          version: currentSnapshot!.version,
        });

        // Act
        const response = await apiClient.updateSnapshot(snapshotId, payload);

        // Assert
        expect(response.updated).toBe(true);
        expect(response.snapshot.name).toBe('Updated Name');
        expect(response.snapshot.version).toBe(currentSnapshot!.version + 1);
      });

      it('should return 409 for version mismatch', async () => {
        // Arrange
        const snapshotId = seedData.snapshotIds[0];
        const payload = createUpdateSnapshotRequestFactory({
          version: 999, // Wrong version
        });

        // Act & Assert
        await request(app)
          .put(`/api/snapshots/${snapshotId}`)
          .send(payload)
          .expect(409)
          .expect((res) => {
            expect(res.body.error).toContain('Version conflict');
            expect(res.body.currentVersion).toBeDefined();
          });
      });
    });

    describe('Status Transitions', () => {
      it('should allow valid status transitions', async () => {
        // Test valid transitions using fixture scenarios
        const scenarios = getStatusTransitionScenarios().filter(
          ([, , shouldSucceed]) => shouldSucceed
        );

        for (const [currentStatus, newStatus] of scenarios) {
          // Arrange: Create snapshot with currentStatus
          const snapshot = await db
            .insert(db.schema.forecastSnapshots)
            .values({
              id: randomUUID(),
              fundId: seedData.fundId,
              name: 'Transition Test',
              status: currentStatus,
              snapshotTime: new Date(),
              version: 1,
            })
            .returning();

          // Act
          const response = await apiClient.updateSnapshot(snapshot[0].id, {
            status: newStatus,
            version: 1,
          });

          // Assert
          expect(response.snapshot.status).toBe(newStatus);
        }
      });

      it('should reject invalid status transitions', async () => {
        // Test invalid transitions
        const scenarios = getStatusTransitionScenarios().filter(
          ([, , shouldSucceed]) => !shouldSucceed
        );

        for (const [currentStatus, newStatus] of scenarios) {
          // Arrange
          const snapshot = await db
            .insert(db.schema.forecastSnapshots)
            .values({
              id: randomUUID(),
              fundId: seedData.fundId,
              name: 'Transition Test',
              status: currentStatus,
              snapshotTime: new Date(),
              version: 1,
            })
            .returning();

          // Act & Assert
          await request(app)
            .put(`/api/snapshots/${snapshot[0].id}`)
            .send({ status: newStatus, version: 1 })
            .expect(400)
            .expect((res) => {
              expect(res.body.error).toContain('Invalid status transition');
            });
        }
      });
    });
  });

  // =====================
  // WORKFLOW TESTS (E2E)
  // =====================

  describe('Workflow Tests', () => {
    it('should complete full snapshot creation workflow', async () => {
      // 1. Create snapshot
      const payload = createSnapshotRequestFactory({ name: 'E2E Snapshot' });
      const createResp = await apiClient.createSnapshot(seedData.fundId, payload);

      expect(createResp.status).toMatch(/^(pending|calculating)$/);

      // 2. Poll until complete
      const finalSnapshot = await apiClient.pollSnapshotUntilComplete(createResp.snapshotId, {
        maxAttempts: 30,
        intervalMs: 500,
      });

      expect(finalSnapshot.status).toBe('complete');
      expect(finalSnapshot.calculatedMetrics).toBeDefined();

      // 3. Verify metrics are realistic
      const metrics = finalSnapshot.calculatedMetrics as any;
      expect(metrics.irr).toBeGreaterThan(0);
      expect(metrics.moic).toBeGreaterThan(1);
    });

    it('should handle concurrent lot creation correctly', async () => {
      // Arrange
      const investmentId = seedData.investmentIds[0];
      const lotPromises = Array.from({ length: 10 }, (_, i) =>
        apiClient.createLot(
          seedData.fundId,
          createLotRequestFactory({
            investmentId,
            idempotencyKey: randomUUID(), // Unique keys
            sharePriceCents: BigInt((i + 1) * 100_000).toString(),
          })
        )
      );

      // Act
      const results = await Promise.all(lotPromises);

      // Assert
      expect(results).toHaveLength(10);
      expect(new Set(results.map((r) => r.lot.id)).size).toBe(10); // All unique IDs
      expect(results.every((r) => r.created === true)).toBe(true);
    });
  });
});
