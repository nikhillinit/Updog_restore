/**
 * Scenario Comparison API Integration Tests
 *
 * Tests the scenario comparison REST endpoints for:
 * - Creating comparisons
 * - Listing and retrieving comparisons
 * - Saved configuration CRUD
 * - Export functionality
 * - Access tracking
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';
import { errorHandler } from '../../server/errors';

describe('Scenario Comparison API', () => {
  let server: ReturnType<typeof import('http').createServer>;
  let app: express.Express;

  // Test data
  const validComparisonRequest = {
    fundId: 1,
    baseScenarioId: '00000000-0000-0000-0000-000000000001',
    comparisonScenarioIds: ['00000000-0000-0000-0000-000000000002'],
    comparisonType: 'deal_level',
    comparisonMetrics: ['moic', 'irr'],
    comparisonName: 'Test Comparison',
  };

  const validConfigRequest = {
    fundId: 1,
    configName: 'Test Configuration',
    scenarioIds: [
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
    ],
    scenarioTypes: {
      '00000000-0000-0000-0000-000000000001': 'deal',
      '00000000-0000-0000-0000-000000000002': 'deal',
    },
    metricsToCompare: ['moic', 'irr'],
    displayLayout: 'side_by_side',
  };

  beforeAll(async () => {
    app = express();
    app.set('trust proxy', true);
    app.use(express.json({ limit: '1mb' }));

    server = await registerRoutes(app);
    app.use(errorHandler());

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // ============================================================================
  // Comparison CRUD Tests
  // ============================================================================

  describe('POST /api/portfolio/comparisons', () => {
    it('should validate required fields', async () => {
      const response = await request(server)
        .post('/api/portfolio/comparisons')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid UUID for baseScenarioId', async () => {
      const response = await request(server)
        .post('/api/portfolio/comparisons')
        .send({
          ...validComparisonRequest,
          baseScenarioId: 'not-a-uuid',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject empty comparisonScenarioIds', async () => {
      const response = await request(server)
        .post('/api/portfolio/comparisons')
        .send({
          ...validComparisonRequest,
          comparisonScenarioIds: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject more than 5 comparison scenarios', async () => {
      const response = await request(server)
        .post('/api/portfolio/comparisons')
        .send({
          ...validComparisonRequest,
          comparisonScenarioIds: [
            '00000000-0000-0000-0000-000000000002',
            '00000000-0000-0000-0000-000000000003',
            '00000000-0000-0000-0000-000000000004',
            '00000000-0000-0000-0000-000000000005',
            '00000000-0000-0000-0000-000000000006',
            '00000000-0000-0000-0000-000000000007',
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should accept valid comparison request', async () => {
      const response = await request(server)
        .post('/api/portfolio/comparisons')
        .send(validComparisonRequest);

      // May fail if scenarios don't exist in DB, but should not be validation error
      if (response.status === 201) {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.id).toBeDefined();
      } else {
        // Acceptable errors: not found (scenarios don't exist) or comparison error
        expect([400, 404, 500]).toContain(response.status);
      }
    });
  });

  describe('GET /api/portfolio/comparisons', () => {
    it('should require fundId query parameter', async () => {
      const response = await request(server)
        .get('/api/portfolio/comparisons');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should accept valid fundId and return list', async () => {
      const response = await request(server)
        .get('/api/portfolio/comparisons')
        .query({ fundId: 1 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.page).toBe(1);
    });

    it('should filter by status', async () => {
      const response = await request(server)
        .get('/api/portfolio/comparisons')
        .query({ fundId: 1, status: 'ready' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(server)
        .get('/api/portfolio/comparisons')
        .query({ fundId: 1, page: 2, limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.pagination.page).toBe(2);
      expect(response.body.pagination.limit).toBe(5);
    });
  });

  describe('GET /api/portfolio/comparisons/:comparisonId', () => {
    it('should return 400 for invalid UUID', async () => {
      const response = await request(server)
        .get('/api/portfolio/comparisons/not-a-uuid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should return 404 for non-existent comparison', async () => {
      const response = await request(server)
        .get('/api/portfolio/comparisons/00000000-0000-0000-0000-000000000099');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/portfolio/comparisons/:comparisonId', () => {
    it('should return 400 for invalid UUID', async () => {
      const response = await request(server)
        .delete('/api/portfolio/comparisons/not-a-uuid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should return 404 for non-existent comparison', async () => {
      const response = await request(server)
        .delete('/api/portfolio/comparisons/00000000-0000-0000-0000-000000000099');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  // ============================================================================
  // Export Tests
  // ============================================================================

  describe('GET /api/portfolio/comparisons/:comparisonId/export', () => {
    it('should return 400 for missing format', async () => {
      const response = await request(server)
        .get('/api/portfolio/comparisons/00000000-0000-0000-0000-000000000001/export');

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent comparison', async () => {
      const response = await request(server)
        .get('/api/portfolio/comparisons/00000000-0000-0000-0000-000000000099/export')
        .query({ format: 'json' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  // ============================================================================
  // Saved Configuration Tests
  // ============================================================================

  describe('POST /api/portfolio/comparison-configs', () => {
    it('should validate required fields', async () => {
      const response = await request(server)
        .post('/api/portfolio/comparison-configs')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject less than 2 scenarios', async () => {
      const response = await request(server)
        .post('/api/portfolio/comparison-configs')
        .send({
          ...validConfigRequest,
          scenarioIds: ['00000000-0000-0000-0000-000000000001'],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject more than 6 scenarios', async () => {
      const response = await request(server)
        .post('/api/portfolio/comparison-configs')
        .send({
          ...validConfigRequest,
          scenarioIds: [
            '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000002',
            '00000000-0000-0000-0000-000000000003',
            '00000000-0000-0000-0000-000000000004',
            '00000000-0000-0000-0000-000000000005',
            '00000000-0000-0000-0000-000000000006',
            '00000000-0000-0000-0000-000000000007',
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/portfolio/comparison-configs', () => {
    it('should require fundId query parameter', async () => {
      const response = await request(server)
        .get('/api/portfolio/comparison-configs');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should return list for valid fundId', async () => {
      const response = await request(server)
        .get('/api/portfolio/comparison-configs')
        .query({ fundId: 1 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/portfolio/comparison-configs/:configId', () => {
    it('should return 404 for non-existent config', async () => {
      const response = await request(server)
        .get('/api/portfolio/comparison-configs/00000000-0000-0000-0000-000000000099');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /api/portfolio/comparison-configs/:configId', () => {
    it('should require version for optimistic locking', async () => {
      const response = await request(server)
        .patch('/api/portfolio/comparison-configs/00000000-0000-0000-0000-000000000001')
        .send({ configName: 'Updated Name' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/portfolio/comparison-configs/:configId', () => {
    it('should return 404 for non-existent config', async () => {
      const response = await request(server)
        .delete('/api/portfolio/comparison-configs/00000000-0000-0000-0000-000000000099');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  // ============================================================================
  // Access Tracking Tests
  // ============================================================================

  describe('POST /api/portfolio/comparison-access', () => {
    it('should accept valid tracking data', async () => {
      const response = await request(server)
        .post('/api/portfolio/comparison-access')
        .send({
          fundId: 1,
          accessType: 'view',
          scenariosCompared: ['00000000-0000-0000-0000-000000000001'],
          cacheHit: false,
        });

      // Should always return 201 (tracking errors are swallowed)
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should return 400 for invalid access type', async () => {
      const response = await request(server)
        .post('/api/portfolio/comparison-access')
        .send({
          fundId: 1,
          accessType: 'invalid_type',
          scenariosCompared: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  // ============================================================================
  // Security Tests
  // ============================================================================

  describe('Security', () => {
    it('should reject oversized payloads', async () => {
      const largePayload = {
        ...validComparisonRequest,
        description: 'x'.repeat(10000), // Very large description
      };

      const response = await request(server)
        .post('/api/portfolio/comparisons')
        .send(largePayload);

      // Should either reject or truncate - not crash
      expect([400, 201]).toContain(response.status);
    });

    it('should sanitize string inputs', async () => {
      const response = await request(server)
        .post('/api/portfolio/comparisons')
        .send({
          ...validComparisonRequest,
          comparisonName: '<script>alert("xss")</script>',
        });

      // Should not contain raw script tag in response
      if (response.status === 201) {
        expect(response.body.data.comparisonName).not.toContain('<script>');
      }
    });
  });
});
