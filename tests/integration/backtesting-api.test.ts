/**
 * Backtesting API Integration Tests
 *
 * Tests the backtesting REST endpoints for:
 * - Running backtests
 * - Fetching backtest history
 * - Retrieving specific results
 * - Comparing scenarios
 * - Listing available scenarios
 * - Authentication and validation
 */

/**
 * IMPORTANT: Set test environment variables before ANY imports
 * to ensure db.ts uses mocked database instead of real Neon pool
 */
process.env.NODE_ENV = 'test';
process.env.VITEST = 'true';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';
import { errorHandler } from '../../server/errors';
import type { Pool } from 'pg';

// Conditional describe - re-enable when cleanup complete
const describeMaybe = process.env.ENABLE_BACKTESTING_TESTS === 'true' ? describe : describe.skip;

describeMaybe('Backtesting API', () => {
  // TODO: Fix database pool cleanup issue (Option 2)
  // Issue: Neon serverless pool not properly cleaned up in afterAll
  // Error: "Cannot read properties of null (reading 'close')" from timeout handler
  // Root cause: Module initialization order - pool created before NODE_ENV set
  // Tracked in: Option 2 comprehensive integration test cleanup plan
  let _pool: Pool | null = null;
  let server: ReturnType<typeof import('http').createServer>;
  let app: express.Express;
  let authToken: string;

  // Test data
  const validBacktestConfig = {
    fundId: 1,
    startDate: '2020-01-01',
    endDate: '2023-12-31',
    simulationRuns: 1000,
    comparisonMetrics: ['irr', 'tvpi'],
    includeHistoricalScenarios: false,
  };

  const validScenarioCompareRequest = {
    fundId: 1,
    scenarios: ['financial_crisis_2008', 'covid_2020'],
    simulationRuns: 500,
  };

  // Helpers for authenticated requests
  const authPost = (path: string) =>
    request(server).post(path).set('Authorization', `Bearer ${authToken}`);

  const authGet = (path: string) =>
    request(server).get(path).set('Authorization', `Bearer ${authToken}`);

  beforeAll(async () => {
    // Dynamic import prevents pool creation when suite is skipped
    const dbModule = await import('../../server/db');
    _pool = dbModule.pgPool;

    app = express();
    app.set('trust proxy', false);
    app.use(express.json({ limit: '1mb' }));

    server = await registerRoutes(app);
    app.use(errorHandler());

    // Generate auth token for protected endpoints
    const { asUser } = await import('../utils/integrationAuth');
    authToken = asUser();

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
  });

  afterAll(async () => {
    // NOTE: Pool cleanup handled by globalTeardown, not here
    // This prevents "singleton suicide" in parallel test runs
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // ============================================================================
  // Authentication Tests
  // ============================================================================

  describe('Authentication', () => {
    it('should reject unauthenticated requests to POST /run', async () => {
      const response = await request(server).post('/api/backtesting/run').send(validBacktestConfig);

      expect(response.status).toBe(401);
    });

    it('should reject unauthenticated requests to GET /scenarios', async () => {
      const response = await request(server).get('/api/backtesting/scenarios');

      expect(response.status).toBe(401);
    });

    it('should reject unauthenticated requests to GET /fund/:fundId/history', async () => {
      const response = await request(server).get('/api/backtesting/fund/1/history');

      expect(response.status).toBe(401);
    });
  });

  // ============================================================================
  // POST /api/backtesting/run Tests
  // ============================================================================

  describe('POST /api/backtesting/run', () => {
    it('should require fundId in request body', async () => {
      const invalidConfig = { ...validBacktestConfig };
      delete (invalidConfig as Record<string, unknown>).fundId;

      const response = await authPost('/api/backtesting/run').send(invalidConfig);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should require startDate in request body', async () => {
      const invalidConfig = { ...validBacktestConfig };
      delete (invalidConfig as Record<string, unknown>).startDate;

      const response = await authPost('/api/backtesting/run').send(invalidConfig);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should require endDate in request body', async () => {
      const invalidConfig = { ...validBacktestConfig };
      delete (invalidConfig as Record<string, unknown>).endDate;

      const response = await authPost('/api/backtesting/run').send(invalidConfig);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid date format', async () => {
      const response = await authPost('/api/backtesting/run').send({
        ...validBacktestConfig,
        startDate: '01-01-2020',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject simulationRuns below minimum', async () => {
      const response = await authPost('/api/backtesting/run').send({
        ...validBacktestConfig,
        simulationRuns: 50, // Below 100 minimum
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject simulationRuns above maximum', async () => {
      const response = await authPost('/api/backtesting/run').send({
        ...validBacktestConfig,
        simulationRuns: 100000, // Above 50000 maximum
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid comparison metrics', async () => {
      const response = await authPost('/api/backtesting/run').send({
        ...validBacktestConfig,
        comparisonMetrics: ['invalid_metric'],
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should accept valid backtest configuration', async () => {
      const response = await authPost('/api/backtesting/run').send(validBacktestConfig);

      // May fail due to missing fund data, but should pass validation
      expect([200, 500]).toContain(response.status);
      if (response.status === 500) {
        // Service error, not validation error
        expect(response.body.error).toBe('BACKTEST_FAILED');
      }
    });
  });

  // ============================================================================
  // GET /api/backtesting/fund/:fundId/history Tests
  // ============================================================================

  describe('GET /api/backtesting/fund/:fundId/history', () => {
    it('should reject non-numeric fund ID', async () => {
      const response = await authGet('/api/backtesting/fund/abc/history');

      // Returns 400 Bad Request from express before hitting route
      expect(response.status).toBe(400);
    });

    it('should reject zero fund ID (fund access check)', async () => {
      const response = await authGet('/api/backtesting/fund/0/history');

      // Returns 403 from requireFundAccess middleware (not in user's fundIds)
      expect(response.status).toBe(403);
    });

    it('should reject negative fund ID (fund access check)', async () => {
      const response = await authGet('/api/backtesting/fund/-1/history');

      // Returns 403 from requireFundAccess middleware (not in user's fundIds)
      expect(response.status).toBe(403);
    });

    it('should accept valid query with pagination', async () => {
      const response = await authGet('/api/backtesting/fund/1/history').query({
        limit: 10,
        offset: 0,
      });

      // May return empty array if no data
      expect([200, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('fundId');
        expect(response.body).toHaveProperty('history');
        expect(response.body).toHaveProperty('pagination');
      }
    });

    it('should accept date range filters', async () => {
      const response = await authGet('/api/backtesting/fund/1/history').query({
        startDate: '2023-01-01',
        endDate: '2023-12-31',
      });

      expect([200, 500]).toContain(response.status);
    });
  });

  // ============================================================================
  // GET /api/backtesting/result/:backtestId Tests
  // ============================================================================

  describe('GET /api/backtesting/result/:backtestId', () => {
    it('should reject invalid UUID format', async () => {
      const response = await authGet('/api/backtesting/result/not-a-uuid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('INVALID_BACKTEST_ID');
    });

    it('should return 404 for non-existent backtest', async () => {
      const response = await authGet(
        '/api/backtesting/result/00000000-0000-0000-0000-000000000000'
      );

      expect([404, 500]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body.error).toBe('BACKTEST_NOT_FOUND');
      }
    });

    it('should accept valid UUID format', async () => {
      const response = await authGet(
        '/api/backtesting/result/550e8400-e29b-41d4-a716-446655440000'
      );

      // May return 404 if not found, but should pass validation
      expect([200, 404, 500]).toContain(response.status);
    });
  });

  // ============================================================================
  // POST /api/backtesting/compare-scenarios Tests
  // ============================================================================

  describe('POST /api/backtesting/compare-scenarios', () => {
    it('should require fundId', async () => {
      const invalidRequest = { ...validScenarioCompareRequest };
      delete (invalidRequest as Record<string, unknown>).fundId;

      const response = await authPost('/api/backtesting/compare-scenarios').send(invalidRequest);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should require scenarios array', async () => {
      const invalidRequest = { ...validScenarioCompareRequest };
      delete (invalidRequest as Record<string, unknown>).scenarios;

      const response = await authPost('/api/backtesting/compare-scenarios').send(invalidRequest);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject empty scenarios array', async () => {
      const response = await authPost('/api/backtesting/compare-scenarios').send({
        ...validScenarioCompareRequest,
        scenarios: [],
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid scenario names', async () => {
      const response = await authPost('/api/backtesting/compare-scenarios').send({
        ...validScenarioCompareRequest,
        scenarios: ['invalid_scenario_name'],
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should accept valid scenario comparison request', async () => {
      const response = await authPost('/api/backtesting/compare-scenarios').send(
        validScenarioCompareRequest
      );

      // May fail due to missing fund data, but should pass validation
      expect([200, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('fundId');
        expect(response.body).toHaveProperty('comparisons');
        expect(response.body).toHaveProperty('summary');
      }
    });
  });

  // ============================================================================
  // GET /api/backtesting/scenarios Tests
  // ============================================================================

  describe('GET /api/backtesting/scenarios', () => {
    it('should return list of available scenarios', async () => {
      const response = await authGet('/api/backtesting/scenarios');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('scenarios');
      expect(Array.isArray(response.body.scenarios)).toBe(true);
      expect(response.body.scenarios.length).toBeGreaterThan(0);
    });

    it('should include known historical scenarios', async () => {
      const response = await authGet('/api/backtesting/scenarios');

      expect(response.status).toBe(200);
      expect(response.body.scenarios).toContain('financial_crisis_2008');
      expect(response.body.scenarios).toContain('covid_2020');
    });
  });

  // ============================================================================
  // Correlation ID Tests
  // ============================================================================

  describe('Correlation ID handling', () => {
    it('should echo correlation ID in POST /run response', async () => {
      const correlationId = 'test-correlation-123';
      const response = await authPost('/api/backtesting/run')
        .set('x-correlation-id', correlationId)
        .send(validBacktestConfig);

      // Check correlation ID is included regardless of success/failure
      expect(response.body.correlationId).toBe(correlationId);
    });

    it('should echo correlation ID in POST /compare-scenarios response', async () => {
      const correlationId = 'test-correlation-456';
      const response = await authPost('/api/backtesting/compare-scenarios')
        .set('x-correlation-id', correlationId)
        .send(validScenarioCompareRequest);

      expect(response.body.correlationId).toBe(correlationId);
    });
  });
});
