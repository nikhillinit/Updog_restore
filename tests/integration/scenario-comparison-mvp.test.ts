/**
 * Scenario Comparison API Integration Tests (MVP Phase 1)
 *
 * Tests for ephemeral scenario comparisons:
 * - POST /api/portfolio/comparisons - Create comparison
 * - GET /api/portfolio/comparisons/:id - Get cached comparison
 *
 * Phase 2 tests (saved configs, export) are deferred to future PR
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes.js';
import { errorHandler } from '../../server/errors.js';
import { db } from '../../server/db/index.js';
import { scenarios, scenarioCases } from '@shared/schema';
import { v4 as uuid } from 'uuid';

describe.skip('Scenario Comparison MVP API', () => {
  // TODO: Re-enable after database migration
  // Required tables: fund_strategy_models, portfolio_scenarios,
  //   reserve_allocation_strategies, performance_forecasts
  // Defined: shared/schema.ts:1210-1580
  // Migration: npm run db:push (requires product approval)
  // Blocked by: Feature not yet released to production

  let server: ReturnType<typeof import('http').createServer>;
  let app: express.Express;

  // Test scenario IDs (will be created in beforeAll)
  let baseScenarioId: string;
  let comparisonScenarioId: string;

  beforeAll(async () => {
    // Setup Express app
    app = express();
    app.set('trust proxy', true);
    app.use(express.json({ limit: '1mb' }));

    server = await registerRoutes(app);
    app.use(errorHandler());

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });

    // Create test scenarios in database
    baseScenarioId = uuid();
    comparisonScenarioId = uuid();

    // Insert base scenario (requires valid companyId from portfolio_companies table)
    await db.insert(scenarios).values({
      id: baseScenarioId,
      companyId: 1, // Assumes portfolio_companies.id=1 exists
      name: 'Test Base Scenario',
      isDefault: false,
    });

    // Insert base scenario cases
    await db.insert(scenarioCases).values([
      {
        id: uuid(),
        scenarioId: baseScenarioId,
        caseName: 'Base Case',
        probability: 0.5,
        investment: 1000000,
        followOns: 500000,
        exitProceeds: 3000000,
        exitValuation: 5000000,
      },
      {
        id: uuid(),
        scenarioId: baseScenarioId,
        caseName: 'Best Case',
        probability: 0.5,
        investment: 1000000,
        followOns: 500000,
        exitProceeds: 5000000,
        exitValuation: 8000000,
      },
    ]);

    // Insert comparison scenario
    await db.insert(scenarios).values({
      id: comparisonScenarioId,
      companyId: 1,
      name: 'Test Comparison Scenario',
      isDefault: false,
    });

    // Insert comparison scenario cases
    await db.insert(scenarioCases).values([
      {
        id: uuid(),
        scenarioId: comparisonScenarioId,
        caseName: 'Moderate Case',
        probability: 1.0,
        investment: 1000000,
        followOns: 300000,
        exitProceeds: 3500000,
        exitValuation: 6000000,
      },
    ]);
  });

  afterAll(async () => {
    // Cleanup test data
    await db.delete(scenarioCases).where();
    await db.delete(scenarios).where();

    // Close server
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // ============================================================================
  // POST /api/portfolio/comparisons
  // ============================================================================

  describe('POST /api/portfolio/comparisons', () => {
    it('should reject empty request body', async () => {
      const response = await request(server)
        .post('/api/portfolio/comparisons')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid request');
    });

    it('should reject invalid UUID for baseScenarioId', async () => {
      const response = await request(server)
        .post('/api/portfolio/comparisons')
        .send({
          fundId: 1,
          baseScenarioId: 'not-a-uuid',
          comparisonScenarioIds: [comparisonScenarioId],
          comparisonMetrics: ['moic'],
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject empty comparisonScenarioIds', async () => {
      const response = await request(server)
        .post('/api/portfolio/comparisons')
        .send({
          fundId: 1,
          baseScenarioId,
          comparisonScenarioIds: [],
          comparisonMetrics: ['moic'],
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.details).toBeDefined();
    });

    it('should reject more than 5 comparison scenarios', async () => {
      const manyScenarios = Array(6).fill(uuid());
      const response = await request(server)
        .post('/api/portfolio/comparisons')
        .send({
          fundId: 1,
          baseScenarioId,
          comparisonScenarioIds: manyScenarios,
          comparisonMetrics: ['moic'],
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject request with extra fields (strict validation)', async () => {
      const response = await request(server)
        .post('/api/portfolio/comparisons')
        .send({
          fundId: 1,
          baseScenarioId,
          comparisonScenarioIds: [comparisonScenarioId],
          comparisonMetrics: ['moic'],
          extraField: 'should-fail',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent scenarios', async () => {
      const fakeScenarioId = uuid();
      const response = await request(server)
        .post('/api/portfolio/comparisons')
        .send({
          fundId: 1,
          baseScenarioId: fakeScenarioId,
          comparisonScenarioIds: [comparisonScenarioId],
          comparisonMetrics: ['moic'],
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should create comparison with valid request', async () => {
      const response = await request(server)
        .post('/api/portfolio/comparisons')
        .send({
          fundId: 1,
          baseScenarioId,
          comparisonScenarioIds: [comparisonScenarioId],
          comparisonMetrics: ['moic', 'total_investment', 'exit_proceeds'],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();

      const { data } = response.body;
      expect(data.id).toBeDefined();
      expect(data.status).toBe('ready');
      expect(data.scenarios).toHaveLength(2);
      expect(data.deltaMetrics).toBeDefined();
      expect(data.comparisonMetrics).toEqual(['moic', 'total_investment', 'exit_proceeds']);
      expect(data.createdAt).toBeDefined();
      expect(data.expiresAt).toBeDefined();

      // Verify delta metrics structure
      const deltaMetric = data.deltaMetrics[0];
      expect(deltaMetric).toHaveProperty('metricName');
      expect(deltaMetric).toHaveProperty('displayName');
      expect(deltaMetric).toHaveProperty('scenarioId');
      expect(deltaMetric).toHaveProperty('baseValue');
      expect(deltaMetric).toHaveProperty('comparisonValue');
      expect(deltaMetric).toHaveProperty('absoluteDelta');
      expect(deltaMetric).toHaveProperty('percentageDelta');
      expect(deltaMetric).toHaveProperty('isBetter');
      expect(deltaMetric).toHaveProperty('trend');
    });

    it('should apply default metrics if not specified', async () => {
      const response = await request(server)
        .post('/api/portfolio/comparisons')
        .send({
          fundId: 1,
          baseScenarioId,
          comparisonScenarioIds: [comparisonScenarioId],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.comparisonMetrics).toEqual([
        'moic',
        'total_investment',
        'exit_proceeds',
      ]);
    });
  });

  // ============================================================================
  // GET /api/portfolio/comparisons/:id
  // ============================================================================

  describe('GET /api/portfolio/comparisons/:id', () => {
    it('should reject invalid UUID', async () => {
      const response = await request(server).get('/api/portfolio/comparisons/not-a-uuid');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent comparison', async () => {
      const fakeComparisonId = uuid();
      const response = await request(server).get(
        `/api/portfolio/comparisons/${fakeComparisonId}`
      );

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('expired or not found');
    });

    it('should retrieve cached comparison', async () => {
      // First create a comparison
      const createResponse = await request(server)
        .post('/api/portfolio/comparisons')
        .send({
          fundId: 1,
          baseScenarioId,
          comparisonScenarioIds: [comparisonScenarioId],
          comparisonMetrics: ['moic'],
        });

      expect(createResponse.status).toBe(200);
      const comparisonId = createResponse.body.data.id;

      // Then retrieve it
      const getResponse = await request(server).get(`/api/portfolio/comparisons/${comparisonId}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.success).toBe(true);
      expect(getResponse.body.data.id).toBe(comparisonId);
      expect(getResponse.body.data.status).toBe('ready');
      expect(getResponse.body.data.scenarios).toHaveLength(2);
    });
  });
});
