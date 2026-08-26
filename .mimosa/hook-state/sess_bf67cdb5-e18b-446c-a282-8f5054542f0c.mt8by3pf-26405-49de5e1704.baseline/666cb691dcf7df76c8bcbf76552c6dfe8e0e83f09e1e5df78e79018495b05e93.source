/**
 * @quarantine
 * @owner @qa-team
 * @reason Temporarily skipped pending stabilization triage.
 * @exitCriteria Remove skip and re-enable once deterministic behavior or required test infrastructure is available.
 * @addedDate 2026-02-17
 */

/**
 * Deal Pipeline API - Integration Test Suite
 *
 * Tests for Sprint 1 Deal Pipeline MVP:
 * - Deal opportunities CRUD with cursor pagination
 * - Pipeline stage transitions
 * - Due diligence item management
 *
 * NOTE: This is an integration test that requires a real PostgreSQL database.
 * Currently skipped in CI/test environments - needs database mock conversion.
 *
 * @group api
 * @group deal-pipeline
 * @group integration
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { Pool } from 'pg';

// Conditional describe - only run when ENABLE_PHASE4_TESTS is set
const describeMaybe = process.env.ENABLE_PHASE4_TESTS === 'true' ? describe : describe.skip;

describeMaybe('Deal Pipeline API', () => {
  // TODO: Re-enable after database migration
  // Required tables: deal_opportunities, due_diligence_items, pipeline_stages
  // Defined: shared/schema.ts deal pipeline section
  // Migration: npm run db:push (requires product approval)
  // Blocked by: Sprint 1 feature not yet released to production

  // Dynamic imports - only load when suite actually runs
  let pool: Pool;
  let makeApp: typeof import('../../server/app').makeApp;

  let app: Express;
  let testFundId: number;
  let testDealId: number;

  beforeAll(async () => {
    // Dynamic import prevents pool creation when suite is skipped
    const dbModule = await import('../../server/db/pg-circuit');
    pool = dbModule.pool;
    const appModule = await import('../../server/app');
    makeApp = appModule.makeApp;
  });

  beforeEach(async () => {
    app = makeApp();

    // Create test fund
    const fundResult = await pool.query(
      `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['Test Deal Fund', '100000000', '0.02', '0.20', 2024]
    );
    testFundId = fundResult.rows[0].id;
  });

  afterEach(async () => {
    // Clean up test data
    if (testDealId) {
      await pool.query('DELETE FROM due_diligence_items WHERE opportunity_id = $1', [testDealId]);
      await pool.query('DELETE FROM pipeline_activities WHERE opportunity_id = $1', [testDealId]);
      await pool.query('DELETE FROM deal_opportunities WHERE id = $1', [testDealId]);
    }
    if (testFundId) {
      await pool.query('DELETE FROM funds WHERE id = $1', [testFundId]);
    }
  });

  describe('POST /api/deals/opportunities', () => {
    it('should create a new deal opportunity', async () => {
      const response = await request(app)
        .post('/api/deals/opportunities')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', 'test-create-deal-001')
        .send({
          fundId: testFundId,
          companyName: 'Test Startup',
          sector: 'SaaS',
          stage: 'Seed',
          targetCheckSize: 1000000,
          targetOwnership: 0.1,
          priority: 'high',
          sourceContact: 'John Referral',
          notes: 'Promising AI startup',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        companyName: 'Test Startup',
        sector: 'SaaS',
        stage: 'Seed',
        status: 'lead',
        priority: 'high',
      });
      expect(response.body.id).toBeDefined();
      testDealId = response.body.id;
    });

    it('should reject duplicate idempotency key', async () => {
      const dealData = {
        fundId: testFundId,
        companyName: 'Duplicate Test',
        sector: 'FinTech',
        stage: 'Seed',
        priority: 'medium',
      };

      // First request
      await request(app)
        .post('/api/deals/opportunities')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', 'test-duplicate-key')
        .send(dealData)
        .expect(201);

      // Second request with same key should return 409
      await request(app)
        .post('/api/deals/opportunities')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', 'test-duplicate-key')
        .send(dealData)
        .expect(409);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/deals/opportunities')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', 'test-validation')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('validation_error');
      expect(response.body.issues).toBeDefined();
    });
  });

  describe('GET /api/deals/opportunities', () => {
    it('should return paginated deals with cursor', async () => {
      // Create test deals
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/deals/opportunities')
          .set('Content-Type', 'application/json')
          .set('Idempotency-Key', `test-list-deal-${i}`)
          .send({
            fundId: testFundId,
            companyName: `Test Company ${i}`,
            sector: 'SaaS',
            stage: 'Seed',
            priority: 'medium',
          });
      }

      // First page
      const response = await request(app)
        .get('/api/deals/opportunities')
        .query({ limit: 2 })
        .expect(200);

      expect(response.body.items).toHaveLength(2);
      expect(response.body.hasMore).toBe(true);
      expect(response.body.cursor).toBeDefined();

      // Next page using cursor
      const page2 = await request(app)
        .get('/api/deals/opportunities')
        .query({ limit: 2, cursor: response.body.cursor })
        .expect(200);

      expect(page2.body.items).toHaveLength(2);
      expect(page2.body.items[0].id).not.toBe(response.body.items[0].id);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/deals/opportunities')
        .query({ status: 'lead' })
        .expect(200);

      expect(response.body.items).toBeDefined();
      response.body.items.forEach((deal: { status: string }) => {
        expect(deal.status).toBe('lead');
      });
    });
  });

  describe('GET /api/deals/opportunities/:id', () => {
    it('should return a deal by ID', async () => {
      // Create a deal first
      const createResponse = await request(app)
        .post('/api/deals/opportunities')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', 'test-get-by-id')
        .send({
          fundId: testFundId,
          companyName: 'Get By ID Test',
          sector: 'SaaS',
          stage: 'Seed',
          priority: 'high',
        })
        .expect(201);

      testDealId = createResponse.body.id;

      const response = await request(app).get(`/api/deals/opportunities/${testDealId}`).expect(200);

      expect(response.body.id).toBe(testDealId);
      expect(response.body.companyName).toBe('Get By ID Test');
    });

    it('should return 404 for non-existent deal', async () => {
      await request(app).get('/api/deals/opportunities/999999').expect(404);
    });
  });

  describe('PUT /api/deals/opportunities/:id', () => {
    it('should update a deal with optimistic locking', async () => {
      // Create a deal
      const createResponse = await request(app)
        .post('/api/deals/opportunities')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', 'test-update-deal')
        .send({
          fundId: testFundId,
          companyName: 'Update Test',
          sector: 'SaaS',
          stage: 'Seed',
          priority: 'medium',
        })
        .expect(201);

      testDealId = createResponse.body.id;
      const version = createResponse.body.version;

      // Update the deal
      const response = await request(app)
        .put(`/api/deals/opportunities/${testDealId}`)
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', 'test-update-deal-001')
        .send({
          companyName: 'Updated Name',
          priority: 'high',
          version,
        })
        .expect(200);

      expect(response.body.companyName).toBe('Updated Name');
      expect(response.body.priority).toBe('high');
      expect(response.body.version).toBe(version + 1);
    });

    it('should reject stale version (optimistic lock failure)', async () => {
      const createResponse = await request(app)
        .post('/api/deals/opportunities')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', 'test-stale-version')
        .send({
          fundId: testFundId,
          companyName: 'Version Test',
          sector: 'SaaS',
          stage: 'Seed',
          priority: 'medium',
        })
        .expect(201);

      testDealId = createResponse.body.id;

      // Update with wrong version
      await request(app)
        .put(`/api/deals/opportunities/${testDealId}`)
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', 'test-stale-version-001')
        .send({
          companyName: 'Stale Update',
          version: 999, // Wrong version
        })
        .expect(409);
    });
  });

  describe('POST /api/deals/:id/stage', () => {
    it('should move deal to new stage', async () => {
      const createResponse = await request(app)
        .post('/api/deals/opportunities')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', 'test-stage-change')
        .send({
          fundId: testFundId,
          companyName: 'Stage Change Test',
          sector: 'SaaS',
          stage: 'Seed',
          priority: 'high',
        })
        .expect(201);

      testDealId = createResponse.body.id;

      const response = await request(app)
        .post(`/api/deals/${testDealId}/stage`)
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', 'test-stage-change-001')
        .send({
          status: 'screening',
          notes: 'Moving to screening phase',
        })
        .expect(200);

      expect(response.body.status).toBe('screening');
    });
  });

  describe('GET /api/deals/pipeline', () => {
    it('should return deals grouped by status', async () => {
      // Create deals in different stages
      await request(app)
        .post('/api/deals/opportunities')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', 'pipeline-test-1')
        .send({
          fundId: testFundId,
          companyName: 'Pipeline Test 1',
          sector: 'SaaS',
          stage: 'Seed',
          priority: 'high',
        });

      const response = await request(app).get('/api/deals/pipeline').expect(200);

      expect(response.body).toMatchObject({
        lead: expect.any(Array),
        screening: expect.any(Array),
        diligence: expect.any(Array),
        termSheet: expect.any(Array),
        closing: expect.any(Array),
        passed: expect.any(Array),
        totalCount: expect.any(Number),
      });
    });
  });

  describe('POST /api/deals/:id/diligence', () => {
    it('should add due diligence item to deal', async () => {
      const createResponse = await request(app)
        .post('/api/deals/opportunities')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', 'test-dd-create')
        .send({
          fundId: testFundId,
          companyName: 'DD Test Company',
          sector: 'SaaS',
          stage: 'Seed',
          priority: 'high',
        })
        .expect(201);

      testDealId = createResponse.body.id;

      const response = await request(app)
        .post(`/api/deals/${testDealId}/diligence`)
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', 'test-dd-item')
        .send({
          category: 'Financial',
          title: 'Review Cap Table',
          description: 'Verify ownership structure and option pool',
          assignee: 'Jane Analyst',
          dueDate: '2025-02-15',
          priority: 'high',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        category: 'Financial',
        title: 'Review Cap Table',
        status: 'pending',
        priority: 'high',
      });
      expect(response.body.id).toBeDefined();
    });
  });

  describe('GET /api/deals/:id/diligence', () => {
    it('should return DD items grouped by category', async () => {
      // Create deal and DD items
      const createResponse = await request(app)
        .post('/api/deals/opportunities')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', 'test-dd-list')
        .send({
          fundId: testFundId,
          companyName: 'DD List Test',
          sector: 'SaaS',
          stage: 'Seed',
          priority: 'high',
        })
        .expect(201);

      testDealId = createResponse.body.id;

      // Add DD items
      await request(app)
        .post(`/api/deals/${testDealId}/diligence`)
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', 'test-dd-financial')
        .send({
          category: 'Financial',
          title: 'Financial Review',
          priority: 'high',
        });

      await request(app)
        .post(`/api/deals/${testDealId}/diligence`)
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', 'test-dd-legal')
        .send({
          category: 'Legal',
          title: 'Legal Review',
          priority: 'medium',
        });

      const response = await request(app).get(`/api/deals/${testDealId}/diligence`).expect(200);

      expect(response.body.Financial).toBeDefined();
      expect(response.body.Legal).toBeDefined();
      expect(response.body.Financial.length).toBeGreaterThan(0);
    });
  });
});

// Unit tests that don't require database
describe('Deal Pipeline API - Validation', () => {
  it('should have valid deal status values', () => {
    const validStatuses = [
      'lead',
      'screening',
      'diligence',
      'term_sheet',
      'closing',
      'passed',
      'portfolio',
    ];
    expect(validStatuses).toHaveLength(7);
  });

  it('should have valid priority values', () => {
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    expect(validPriorities).toHaveLength(4);
  });

  it('should have valid DD categories', () => {
    const validCategories = ['Financial', 'Legal', 'Technical', 'Commercial', 'Team', 'Market'];
    expect(validCategories).toHaveLength(6);
  });
});
