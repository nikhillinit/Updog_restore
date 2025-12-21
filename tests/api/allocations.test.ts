/**
 * Fund Allocation Management API - Comprehensive Test Suite
 *
 * Tests for Phase 1b allocation CRUD operations with optimistic locking
 *
 * NOTE: This is an integration test that requires a real PostgreSQL database.
 * Currently skipped in CI/test environments - needs database mock conversion.
 *
 * @group api
 * @group allocations
 * @group integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { makeApp } from '../../server/app';
import { pool } from '../../server/db/pg-circuit';
import type { Express } from 'express';

describe.skip('Fund Allocation Management API', () => {
  let app: Express;
  let testFundId: number;
  let testCompanyIds: number[];

  beforeEach(async () => {
    app = makeApp();

    // Create test fund
    const fundResult = await pool.query(
      `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['Test Fund', '100000000', '0.02', '0.20', 2024]
    );
    testFundId = fundResult.rows[0].id;

    // Create test portfolio companies
    const company1 = await pool.query(
      `INSERT INTO portfoliocompanies
       (fund_id, name, sector, stage, investment_amount, status,
        planned_reserves_cents, deployed_reserves_cents, allocation_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [testFundId, 'Company A', 'SaaS', 'Seed', '1000000', 'active', 500000, 0, 1]
    );

    const company2 = await pool.query(
      `INSERT INTO portfoliocompanies
       (fund_id, name, sector, stage, investment_amount, status,
        planned_reserves_cents, deployed_reserves_cents, allocation_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [testFundId, 'Company B', 'FinTech', 'Series A', '2000000', 'active', 1000000, 250000, 1]
    );

    const company3 = await pool.query(
      `INSERT INTO portfoliocompanies
       (fund_id, name, sector, stage, investment_amount, status,
        planned_reserves_cents, deployed_reserves_cents, allocation_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [testFundId, 'Company C', 'HealthTech', 'Seed', '500000', 'active', 0, 0, 1]
    );

    testCompanyIds = [company1.rows[0].id, company2.rows[0].id, company3.rows[0].id];
  });

  afterEach(async () => {
    // Clean up test data
    if (testFundId) {
      await pool.query('DELETE FROM portfoliocompanies WHERE fund_id = $1', [testFundId]);
      await pool.query('DELETE FROM fund_events WHERE fund_id = $1', [testFundId]);
      await pool.query('DELETE FROM funds WHERE id = $1', [testFundId]);
    }
  });

  describe('GET /api/funds/:fundId/allocations/latest', () => {
    it('should successfully retrieve latest allocation state', async () => {
      const response = await request(app)
        .get(`/api/funds/${testFundId}/allocations/latest`)
        .expect(200);

      expect(response.body).toMatchObject({
        fund_id: testFundId,
        companies: expect.arrayContaining([
          expect.objectContaining({
            company_id: testCompanyIds[0],
            company_name: 'Company A',
            planned_reserves_cents: 500000,
            deployed_reserves_cents: 0,
            allocation_version: 1,
          }),
          expect.objectContaining({
            company_id: testCompanyIds[1],
            company_name: 'Company B',
            planned_reserves_cents: 1000000,
            deployed_reserves_cents: 250000,
            allocation_version: 1,
          }),
        ]),
        metadata: {
          total_planned_cents: 1500000,
          total_deployed_cents: 250000,
          companies_count: 3,
          last_updated_at: null,
        },
      });
    });

    it('should return 404 for non-existent fund', async () => {
      const response = await request(app).get('/api/funds/999999/allocations/latest').expect(404);

      expect(response.body).toMatchObject({
        error: expect.stringContaining('not found'),
      });
    });

    it('should return 400 for invalid fund ID', async () => {
      const response = await request(app).get('/api/funds/invalid/allocations/latest').expect(400);

      expect(response.body).toMatchObject({
        error: 'Invalid fund ID',
      });
    });

    it('should return empty companies array for fund with no companies', async () => {
      // Create fund with no companies
      const emptyFundResult = await pool.query(
        `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['Empty Fund', '50000000', '0.02', '0.20', 2024]
      );
      const emptyFundId = emptyFundResult.rows[0].id;

      const response = await request(app)
        .get(`/api/funds/${emptyFundId}/allocations/latest`)
        .expect(200);

      expect(response.body).toMatchObject({
        fund_id: emptyFundId,
        companies: [],
        metadata: {
          total_planned_cents: 0,
          total_deployed_cents: 0,
          companies_count: 0,
          last_updated_at: null,
        },
      });

      // Clean up
      await pool.query('DELETE FROM funds WHERE id = $1', [emptyFundId]);
    });
  });

  describe('POST /api/funds/:fundId/allocations', () => {
    it('should successfully update allocations for a single company', async () => {
      const updateRequest = {
        expected_version: 1,
        updates: [
          {
            company_id: testCompanyIds[0],
            planned_reserves_cents: 750000,
            allocation_cap_cents: 1000000,
            allocation_reason: 'Strong performance, increasing allocation',
          },
        ],
      };

      const response = await request(app)
        .post(`/api/funds/${testFundId}/allocations`)
        .send(updateRequest)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        new_version: 2,
        updated_count: 1,
      });

      // Verify database was updated
      const verifyResult = await pool.query(
        `SELECT planned_reserves_cents, allocation_cap_cents, allocation_reason,
                allocation_version, last_allocation_at
         FROM portfoliocompanies
         WHERE id = $1`,
        [testCompanyIds[0]]
      );

      expect(verifyResult.rows[0]).toMatchObject({
        planned_reserves_cents: '750000',
        allocation_cap_cents: '1000000',
        allocation_reason: 'Strong performance, increasing allocation',
        allocation_version: 2,
      });
      expect(verifyResult.rows[0].last_allocation_at).toBeTruthy();
    });

    it('should successfully update allocations for multiple companies in batch', async () => {
      const updateRequest = {
        expected_version: 1,
        updates: [
          {
            company_id: testCompanyIds[0],
            planned_reserves_cents: 750000,
          },
          {
            company_id: testCompanyIds[1],
            planned_reserves_cents: 1500000,
            allocation_cap_cents: 2000000,
          },
          {
            company_id: testCompanyIds[2],
            planned_reserves_cents: 300000,
            allocation_reason: 'Initial allocation based on traction',
          },
        ],
      };

      const response = await request(app)
        .post(`/api/funds/${testFundId}/allocations`)
        .send(updateRequest)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        new_version: 2,
        updated_count: 3,
      });

      // Verify all companies were updated
      const verifyResult = await pool.query(
        `SELECT id, allocation_version
         FROM portfoliocompanies
         WHERE fund_id = $1
         ORDER BY id`,
        [testFundId]
      );

      expect(verifyResult.rows.every((row) => row.allocation_version === 2)).toBe(true);
    });

    it('should return 409 conflict when version does not match', async () => {
      // First update to increment version
      await pool.query(
        `UPDATE portfoliocompanies
         SET allocation_version = 2
         WHERE id = $1`,
        [testCompanyIds[0]]
      );

      // Try to update with stale version
      const updateRequest = {
        expected_version: 1, // Stale version
        updates: [
          {
            company_id: testCompanyIds[0],
            planned_reserves_cents: 900000,
          },
        ],
      };

      const response = await request(app)
        .post(`/api/funds/${testFundId}/allocations`)
        .send(updateRequest)
        .expect(409);

      expect(response.body).toMatchObject({
        error: 'Version conflict',
        conflicts: [
          {
            company_id: testCompanyIds[0],
            expected_version: 1,
            actual_version: 2,
          },
        ],
      });

      // Verify database was NOT updated
      const verifyResult = await pool.query(
        `SELECT planned_reserves_cents, allocation_version
         FROM portfoliocompanies
         WHERE id = $1`,
        [testCompanyIds[0]]
      );

      expect(verifyResult.rows[0]).toMatchObject({
        planned_reserves_cents: '500000', // Original value
        allocation_version: 2,
      });
    });

    it('should rollback all updates on partial version conflict', async () => {
      // Update one company's version to create conflict
      await pool.query(
        `UPDATE portfoliocompanies
         SET allocation_version = 5
         WHERE id = $1`,
        [testCompanyIds[1]]
      );

      // Try to update all three companies
      const updateRequest = {
        expected_version: 1,
        updates: [
          {
            company_id: testCompanyIds[0],
            planned_reserves_cents: 800000,
          },
          {
            company_id: testCompanyIds[1],
            planned_reserves_cents: 1200000, // This will conflict
          },
          {
            company_id: testCompanyIds[2],
            planned_reserves_cents: 400000,
          },
        ],
      };

      const response = await request(app)
        .post(`/api/funds/${testFundId}/allocations`)
        .send(updateRequest)
        .expect(409);

      expect(response.body.conflicts).toHaveLength(1);
      expect(response.body.conflicts[0]).toMatchObject({
        company_id: testCompanyIds[1],
        expected_version: 1,
        actual_version: 5,
      });

      // Verify NO companies were updated (transaction rollback)
      const verifyResult = await pool.query(
        `SELECT id, planned_reserves_cents, allocation_version
         FROM portfoliocompanies
         WHERE fund_id = $1
         ORDER BY id`,
        [testFundId]
      );

      expect(verifyResult.rows[0].planned_reserves_cents).toBe('500000'); // Original
      expect(verifyResult.rows[0].allocation_version).toBe(1); // Original
      expect(verifyResult.rows[1].allocation_version).toBe(5); // Modified before
      expect(verifyResult.rows[2].planned_reserves_cents).toBe('0'); // Original
    });

    it('should return 404 for non-existent company', async () => {
      const updateRequest = {
        expected_version: 1,
        updates: [
          {
            company_id: 999999, // Non-existent
            planned_reserves_cents: 500000,
          },
        ],
      };

      const response = await request(app)
        .post(`/api/funds/${testFundId}/allocations`)
        .send(updateRequest)
        .expect(404);

      expect(response.body.error).toBeTruthy();
    });

    it('should return 404 for company not in the fund', async () => {
      // Create company in different fund
      const otherFundResult = await pool.query(
        `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['Other Fund', '50000000', '0.02', '0.20', 2024]
      );
      const otherFundId = otherFundResult.rows[0].id;

      const otherCompanyResult = await pool.query(
        `INSERT INTO portfoliocompanies
         (fund_id, name, sector, stage, investment_amount, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [otherFundId, 'Other Company', 'SaaS', 'Seed', '1000000', 'active']
      );
      const otherCompanyId = otherCompanyResult.rows[0].id;

      const updateRequest = {
        expected_version: 1,
        updates: [
          {
            company_id: otherCompanyId,
            planned_reserves_cents: 500000,
          },
        ],
      };

      const response = await request(app)
        .post(`/api/funds/${testFundId}/allocations`)
        .send(updateRequest)
        .expect(404);

      expect(response.body.error).toMatch(/not found/i);

      // Clean up
      await pool.query('DELETE FROM portfoliocompanies WHERE id = $1', [otherCompanyId]);
      await pool.query('DELETE FROM funds WHERE id = $1', [otherFundId]);
    });

    it('should return 400 for invalid request body', async () => {
      const invalidRequests = [
        // Missing expected_version
        {
          updates: [
            {
              company_id: testCompanyIds[0],
              planned_reserves_cents: 500000,
            },
          ],
        },
        // Negative planned_reserves_cents
        {
          expected_version: 1,
          updates: [
            {
              company_id: testCompanyIds[0],
              planned_reserves_cents: -100,
            },
          ],
        },
        // allocation_cap_cents < planned_reserves_cents
        {
          expected_version: 1,
          updates: [
            {
              company_id: testCompanyIds[0],
              planned_reserves_cents: 1000000,
              allocation_cap_cents: 500000, // Less than planned
            },
          ],
        },
        // Empty updates array
        {
          expected_version: 1,
          updates: [],
        },
        // Too many updates (>100)
        {
          expected_version: 1,
          updates: Array(101).fill({
            company_id: testCompanyIds[0],
            planned_reserves_cents: 500000,
          }),
        },
      ];

      for (const invalidRequest of invalidRequests) {
        const response = await request(app)
          .post(`/api/funds/${testFundId}/allocations`)
          .send(invalidRequest)
          .expect(400);

        expect(response.body.error).toBe('Invalid request body');
      }
    });

    it('should create audit log entry on successful update', async () => {
      const updateRequest = {
        expected_version: 1,
        updates: [
          {
            company_id: testCompanyIds[0],
            planned_reserves_cents: 600000,
          },
        ],
      };

      await request(app)
        .post(`/api/funds/${testFundId}/allocations`)
        .send(updateRequest)
        .expect(200);

      // Verify audit log entry was created
      const auditResult = await pool.query(
        `SELECT event_type, payload, operation, entity_type
         FROM fund_events
         WHERE fund_id = $1 AND event_type = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [testFundId, 'ALLOCATION_UPDATED']
      );

      expect(auditResult.rows).toHaveLength(1);
      expect(auditResult.rows[0]).toMatchObject({
        event_type: 'ALLOCATION_UPDATED',
        operation: 'UPDATE',
        entity_type: 'allocation',
      });

      const payload = auditResult.rows[0].payload;
      expect(payload).toMatchObject({
        new_version: 2,
        update_count: 1,
        updates: [
          {
            company_id: testCompanyIds[0],
            planned_reserves_cents: 600000,
          },
        ],
      });
    });

    it('should handle concurrent updates correctly (race condition test)', async () => {
      // Simulate concurrent updates by making two requests with same version
      const updateRequest1 = {
        expected_version: 1,
        updates: [
          {
            company_id: testCompanyIds[0],
            planned_reserves_cents: 700000,
          },
        ],
      };

      const updateRequest2 = {
        expected_version: 1,
        updates: [
          {
            company_id: testCompanyIds[0],
            planned_reserves_cents: 800000,
          },
        ],
      };

      // Execute both updates concurrently
      const [response1, response2] = await Promise.all([
        request(app).post(`/api/funds/${testFundId}/allocations`).send(updateRequest1),
        request(app).post(`/api/funds/${testFundId}/allocations`).send(updateRequest2),
      ]);

      // One should succeed (200), one should conflict (409)
      const statuses = [response1.status, response2.status].sort();
      expect(statuses).toEqual([200, 409]);

      // The successful one should have new_version = 2
      const successResponse = response1.status === 200 ? response1 : response2;
      expect(successResponse.body).toMatchObject({
        success: true,
        new_version: 2,
        updated_count: 1,
      });

      // The failed one should have conflict
      const failedResponse = response1.status === 409 ? response1 : response2;
      expect(failedResponse.body).toMatchObject({
        error: 'Version conflict',
        conflicts: [
          {
            company_id: testCompanyIds[0],
            expected_version: 1,
            actual_version: 2,
          },
        ],
      });
    });
  });

  describe('GET /api/funds/:fundId/companies', () => {
    beforeEach(async () => {
      // Add additional test data with allocation fields
      await pool.query(
        `UPDATE portfoliocompanies
         SET exit_moic_bps = $1, ownership_current_pct = $2,
             allocation_cap_cents = $3, allocation_reason = $4
         WHERE id = $5`,
        [25000, 0.15, 2000000, 'High performer', testCompanyIds[0]]
      );

      await pool.query(
        `UPDATE portfoliocompanies
         SET exit_moic_bps = $1, ownership_current_pct = $2
         WHERE id = $3`,
        [15000, 0.2, testCompanyIds[1]]
      );
    });

    it('should retrieve companies with default pagination and sorting', async () => {
      const response = await request(app).get(`/api/funds/${testFundId}/companies`).expect(200);

      expect(response.body).toMatchObject({
        companies: expect.any(Array),
        pagination: {
          next_cursor: expect.any(String),
          has_more: false,
        },
      });

      // Should be sorted by exit_moic_bps DESC by default
      const companies = response.body.companies;
      expect(companies).toHaveLength(3);
      expect(companies[0].id).toBe(testCompanyIds[0]); // Highest MOIC
      expect(companies[0]).toMatchObject({
        name: 'Company A',
        sector: 'SaaS',
        stage: 'Seed',
        status: 'active',
        invested_cents: 100000000, // $1M in cents
        planned_reserves_cents: 500000,
        deployed_reserves_cents: 0,
        exit_moic_bps: 25000,
        ownership_pct: 0.15,
        allocation_cap_cents: 2000000,
        allocation_reason: 'High performer',
        last_allocation_at: null,
      });
    });

    it('should filter companies by status', async () => {
      // Add an exited company
      await pool.query(
        `INSERT INTO portfoliocompanies
         (fund_id, name, sector, stage, investment_amount, status, exit_moic_bps)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [testFundId, 'Exited Co', 'SaaS', 'Series B', '5000000', 'exited', 30000]
      );

      const response = await request(app)
        .get(`/api/funds/${testFundId}/companies?status=exited`)
        .expect(200);

      expect(response.body.companies).toHaveLength(1);
      expect(response.body.companies[0]).toMatchObject({
        name: 'Exited Co',
        status: 'exited',
        exit_moic_bps: 30000,
      });
    });

    it('should filter companies by sector', async () => {
      const response = await request(app)
        .get(`/api/funds/${testFundId}/companies?sector=SaaS`)
        .expect(200);

      expect(response.body.companies).toHaveLength(1);
      expect(response.body.companies[0]).toMatchObject({
        name: 'Company A',
        sector: 'SaaS',
      });
    });

    it('should search companies by name (case-insensitive)', async () => {
      const response = await request(app)
        .get(`/api/funds/${testFundId}/companies?q=company+b`)
        .expect(200);

      expect(response.body.companies).toHaveLength(1);
      expect(response.body.companies[0]).toMatchObject({
        name: 'Company B',
      });
    });

    it('should support sorting by planned_reserves_desc', async () => {
      const response = await request(app)
        .get(`/api/funds/${testFundId}/companies?sortBy=planned_reserves_desc`)
        .expect(200);

      const companies = response.body.companies;
      expect(companies[0].name).toBe('Company B'); // 1M planned
      expect(companies[1].name).toBe('Company A'); // 500K planned
      expect(companies[2].name).toBe('Company C'); // 0 planned
    });

    it('should support sorting by name_asc', async () => {
      const response = await request(app)
        .get(`/api/funds/${testFundId}/companies?sortBy=name_asc`)
        .expect(200);

      const companies = response.body.companies;
      expect(companies[0].name).toBe('Company A');
      expect(companies[1].name).toBe('Company B');
      expect(companies[2].name).toBe('Company C');
    });

    it('should support cursor-based pagination', async () => {
      // Create 60 companies to test pagination
      const extraCompanyIds: number[] = [];
      for (let i = 0; i < 60; i++) {
        const result = await pool.query(
          `INSERT INTO portfoliocompanies
           (fund_id, name, sector, stage, investment_amount, status,
            planned_reserves_cents, exit_moic_bps)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [testFundId, `Test Co ${i}`, 'SaaS', 'Seed', '1000000', 'active', 100000, 10000 + i]
        );
        extraCompanyIds.push(result.rows[0].id);
      }

      // First page
      const page1 = await request(app)
        .get(`/api/funds/${testFundId}/companies?limit=20`)
        .expect(200);

      expect(page1.body.companies).toHaveLength(20);
      expect(page1.body.pagination.has_more).toBe(true);
      expect(page1.body.pagination.next_cursor).toBeTruthy();

      // Second page using cursor
      const page2 = await request(app)
        .get(
          `/api/funds/${testFundId}/companies?limit=20&cursor=${page1.body.pagination.next_cursor}`
        )
        .expect(200);

      expect(page2.body.companies).toHaveLength(20);
      expect(page2.body.pagination.has_more).toBe(true);

      // Verify no duplicates between pages
      const page1Ids = page1.body.companies.map((c: any) => c.id);
      const page2Ids = page2.body.companies.map((c: any) => c.id);
      const intersection = page1Ids.filter((id: number) => page2Ids.includes(id));
      expect(intersection).toHaveLength(0);

      // Clean up
      await pool.query(`DELETE FROM portfoliocompanies WHERE id = ANY($1::int[])`, [
        extraCompanyIds,
      ]);
    });

    it('should respect limit parameter (max 200)', async () => {
      const response1 = await request(app)
        .get(`/api/funds/${testFundId}/companies?limit=2`)
        .expect(200);

      expect(response1.body.companies).toHaveLength(2);

      // Test invalid limit (> 200)
      const response2 = await request(app)
        .get(`/api/funds/${testFundId}/companies?limit=201`)
        .expect(400);

      expect(response2.body.error).toBe('invalid_query_parameters');
    });

    it('should return 404 for non-existent fund', async () => {
      const response = await request(app).get('/api/funds/999999/companies').expect(404);

      expect(response.body).toMatchObject({
        error: 'fund_not_found',
        message: expect.stringContaining('not found'),
      });
    });

    it('should return 400 for invalid fund ID', async () => {
      const response = await request(app).get('/api/funds/invalid/companies').expect(400);

      expect(response.body).toMatchObject({
        error: 'invalid_fund_id',
      });
    });

    it('should return 400 for invalid query parameters', async () => {
      // Invalid status
      await request(app).get(`/api/funds/${testFundId}/companies?status=invalid`).expect(400);

      // Invalid sortBy
      await request(app).get(`/api/funds/${testFundId}/companies?sortBy=invalid`).expect(400);

      // Invalid cursor (not a number)
      await request(app).get(`/api/funds/${testFundId}/companies?cursor=abc`).expect(400);

      // Invalid limit (not a number)
      await request(app).get(`/api/funds/${testFundId}/companies?limit=abc`).expect(400);
    });

    it('should handle empty result set with filters', async () => {
      const response = await request(app)
        .get(`/api/funds/${testFundId}/companies?sector=NonExistent`)
        .expect(200);

      expect(response.body).toMatchObject({
        companies: [],
        pagination: {
          next_cursor: null,
          has_more: false,
        },
      });
    });

    it('should combine multiple filters correctly', async () => {
      const response = await request(app)
        .get(`/api/funds/${testFundId}/companies?status=active&sector=FinTech&q=company`)
        .expect(200);

      expect(response.body.companies).toHaveLength(1);
      expect(response.body.companies[0]).toMatchObject({
        name: 'Company B',
        sector: 'FinTech',
        status: 'active',
      });
    });

    it('should handle NULL values correctly', async () => {
      // Create company with NULL optional fields
      await pool.query(
        `INSERT INTO portfoliocompanies
         (fund_id, name, sector, stage, investment_amount, status,
          planned_reserves_cents, deployed_reserves_cents,
          exit_moic_bps, ownership_current_pct, allocation_cap_cents,
          allocation_reason, last_allocation_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, NULL, NULL, NULL)`,
        [testFundId, 'Null Co', 'SaaS', 'Seed', '1000000', 'active', 0, 0]
      );

      const response = await request(app)
        .get(`/api/funds/${testFundId}/companies?q=null+co`)
        .expect(200);

      expect(response.body.companies[0]).toMatchObject({
        name: 'Null Co',
        exit_moic_bps: null,
        allocation_cap_cents: null,
        allocation_reason: null,
        last_allocation_at: null,
      });
    });

    it('should complete query for 100 companies in < 200ms', async () => {
      // Create 100 companies
      const companyIds: number[] = [];
      for (let i = 0; i < 100; i++) {
        const result = await pool.query(
          `INSERT INTO portfoliocompanies
           (fund_id, name, sector, stage, investment_amount, status,
            planned_reserves_cents, exit_moic_bps)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [testFundId, `Perf Test ${i}`, 'SaaS', 'Seed', '1000000', 'active', 100000, 10000 + i]
        );
        companyIds.push(result.rows[0].id);
      }

      const startTime = Date.now();
      const response = await request(app)
        .get(`/api/funds/${testFundId}/companies?limit=100`)
        .expect(200);
      const duration = Date.now() - startTime;

      expect(response.body.companies).toHaveLength(100);

      // Performance requirement: < 200ms
      expect(duration).toBeLessThan(200);

      // Clean up
      await pool.query(`DELETE FROM portfoliocompanies WHERE id = ANY($1::int[])`, [companyIds]);
    });
  });

  describe('Edge Cases and Performance', () => {
    it('should handle updates with NULL allocation_cap_cents and allocation_reason', async () => {
      const updateRequest = {
        expected_version: 1,
        updates: [
          {
            company_id: testCompanyIds[0],
            planned_reserves_cents: 550000,
            allocation_cap_cents: null,
            allocation_reason: null,
          },
        ],
      };

      const response = await request(app)
        .post(`/api/funds/${testFundId}/allocations`)
        .send(updateRequest)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify NULL values were stored
      const verifyResult = await pool.query(
        `SELECT allocation_cap_cents, allocation_reason
         FROM portfoliocompanies
         WHERE id = $1`,
        [testCompanyIds[0]]
      );

      expect(verifyResult.rows[0].allocation_cap_cents).toBeNull();
      expect(verifyResult.rows[0].allocation_reason).toBeNull();
    });

    it('should complete batch update of 50 companies in < 500ms', async () => {
      // Create 50 companies
      const companyIds: number[] = [];
      for (let i = 0; i < 50; i++) {
        const result = await pool.query(
          `INSERT INTO portfoliocompanies
           (fund_id, name, sector, stage, investment_amount, status, allocation_version)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [testFundId, `Company ${i}`, 'SaaS', 'Seed', '1000000', 'active', 1]
        );
        companyIds.push(result.rows[0].id);
      }

      const updateRequest = {
        expected_version: 1,
        updates: companyIds.map((id) => ({
          company_id: id,
          planned_reserves_cents: 500000,
        })),
      };

      const startTime = Date.now();
      const response = await request(app)
        .post(`/api/funds/${testFundId}/allocations`)
        .send(updateRequest)
        .expect(200);
      const duration = Date.now() - startTime;

      expect(response.body).toMatchObject({
        success: true,
        new_version: 2,
        updated_count: 50,
      });

      // Performance requirement: < 500ms
      expect(duration).toBeLessThan(500);

      // Clean up
      await pool.query(`DELETE FROM portfoliocompanies WHERE id = ANY($1::int[])`, [companyIds]);
    });
  });
});
