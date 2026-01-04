/**
 * Snapshot Version API Integration Tests
 *
 * Tests the snapshot version REST endpoints for:
 * - Creating versions
 * - Listing versions
 * - Getting version details
 * - Restoring versions
 * - Pinning/unpinning versions
 * - Comparing versions
 *
 * Run: npm test -- snapshot-versions.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the database before importing routes
vi.mock('../../server/db', () => ({
  db: {
    query: {
      snapshotVersions: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      forecastSnapshots: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ maxVersion: 0 }]),
      }),
    }),
  },
  redisGetJSON: vi.fn().mockResolvedValue(null),
  redisSetJSON: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../server/db/typed-query', () => ({
  typedFindFirst: vi.fn(),
  typedFindMany: vi.fn(),
  typedInsert: vi.fn(),
  typedUpdate: vi.fn(),
}));

import versionsRouter from '../../server/routes/portfolio/versions';
import { typedFindFirst, typedFindMany, typedInsert } from '../../server/db/typed-query';

describe('Snapshot Version API', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    // Mount routes at test path
    app.use('/api/snapshots/:snapshotId/versions', versionsRouter);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/snapshots/:snapshotId/versions', () => {
    it('should reject invalid snapshot ID format', async () => {
      const response = await request(app)
        .post('/api/snapshots/invalid-id/versions')
        .send({ versionName: 'Test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_params');
    });

    it('should reject version name exceeding 100 characters', async () => {
      const longName = 'a'.repeat(101);
      const response = await request(app)
        .post('/api/snapshots/00000000-0000-0000-0000-000000000001/versions')
        .send({ versionName: longName });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_request_body');
    });
  });

  describe('GET /api/snapshots/:snapshotId/versions', () => {
    it('should reject invalid limit value', async () => {
      const response = await request(app)
        .get('/api/snapshots/00000000-0000-0000-0000-000000000001/versions')
        .query({ limit: 200 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_query');
    });

    it('should accept valid query parameters', async () => {
      // Mock snapshot exists
      vi.mocked(typedFindFirst).mockResolvedValueOnce({
        id: '00000000-0000-0000-0000-000000000001',
      });

      // Mock empty version list
      vi.mocked(typedFindMany).mockResolvedValueOnce([]);

      const response = await request(app)
        .get('/api/snapshots/00000000-0000-0000-0000-000000000001/versions')
        .query({ limit: 10, includeExpired: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/snapshots/:snapshotId/versions/current', () => {
    it('should return 404 when no current version exists', async () => {
      // Mock snapshot exists
      vi.mocked(typedFindFirst)
        .mockResolvedValueOnce({ id: '00000000-0000-0000-0000-000000000001' })
        .mockResolvedValueOnce(null); // No current version

      const response = await request(app).get(
        '/api/snapshots/00000000-0000-0000-0000-000000000001/versions/current'
      );

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('version_not_found');
    });

    it('should return current version when it exists', async () => {
      const mockVersion = {
        id: 'v1',
        snapshotId: '00000000-0000-0000-0000-000000000001',
        versionNumber: 1,
        versionName: 'Initial',
        isCurrent: true,
        isPinned: false,
        stateSnapshot: { test: 'data' },
        calculatedMetrics: { moic: 1.5 },
        sourceHash: 'abc123',
        createdAt: new Date(),
        expiresAt: null,
      };

      vi.mocked(typedFindFirst)
        .mockResolvedValueOnce({ id: '00000000-0000-0000-0000-000000000001' })
        .mockResolvedValueOnce(mockVersion);

      const response = await request(app).get(
        '/api/snapshots/00000000-0000-0000-0000-000000000001/versions/current'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.versionName).toBe('Initial');
    });
  });

  describe('GET /api/snapshots/:snapshotId/versions/number/:versionNumber', () => {
    it('should reject non-positive version numbers', async () => {
      const response = await request(app).get(
        '/api/snapshots/00000000-0000-0000-0000-000000000001/versions/number/0'
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_params');
    });

    it('should reject non-integer version numbers', async () => {
      const response = await request(app).get(
        '/api/snapshots/00000000-0000-0000-0000-000000000001/versions/number/1.5'
      );

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/snapshots/:snapshotId/versions/:versionId/pin', () => {
    it('should reject invalid version ID format', async () => {
      const response = await request(app).post(
        '/api/snapshots/00000000-0000-0000-0000-000000000001/versions/invalid-id/pin'
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_params');
    });
  });

  describe('POST /api/snapshots/:snapshotId/versions/compare', () => {
    it('should reject missing version IDs', async () => {
      const response = await request(app)
        .post('/api/snapshots/00000000-0000-0000-0000-000000000001/versions/compare')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_request_body');
    });

    it('should reject invalid UUID format for version IDs', async () => {
      const response = await request(app)
        .post('/api/snapshots/00000000-0000-0000-0000-000000000001/versions/compare')
        .send({
          baseVersionId: 'not-a-uuid',
          comparisonVersionId: '00000000-0000-0000-0000-000000000002',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_request_body');
    });

    it('should accept valid comparison request', async () => {
      const mockBaseVersion = {
        id: '00000000-0000-0000-0000-000000000001',
        snapshotId: 's1',
        versionNumber: 1,
        stateSnapshot: { a: 1 },
        calculatedMetrics: { moic: 1.5 },
      };

      const mockCompVersion = {
        id: '00000000-0000-0000-0000-000000000002',
        snapshotId: 's1',
        versionNumber: 2,
        stateSnapshot: { a: 2 },
        calculatedMetrics: { moic: 2.0 },
      };

      vi.mocked(typedFindFirst)
        .mockResolvedValueOnce(mockBaseVersion)
        .mockResolvedValueOnce(mockCompVersion);

      const response = await request(app)
        .post('/api/snapshots/00000000-0000-0000-0000-000000000001/versions/compare')
        .send({
          baseVersionId: '00000000-0000-0000-0000-000000000001',
          comparisonVersionId: '00000000-0000-0000-0000-000000000002',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('diffSummary');
      expect(response.body.data).toHaveProperty('metricDeltas');
    });
  });

  describe('GET /api/snapshots/:snapshotId/versions/:versionId/history', () => {
    it('should reject limit exceeding maximum', async () => {
      const response = await request(app)
        .get(
          '/api/snapshots/00000000-0000-0000-0000-000000000001/versions/00000000-0000-0000-0000-000000000002/history'
        )
        .query({ limit: 100 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_query');
    });
  });
});
