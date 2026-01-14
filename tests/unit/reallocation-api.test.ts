/**
 * Reallocation API Unit Tests (Phase 1b)
 *
 * Comprehensive test suite covering:
 * - Preview endpoint validation
 * - Commit endpoint with transactions
 * - Warning detection (cap exceeded, concentration, etc.)
 * - Version conflict handling
 * - Audit trail verification
 * - Error handling
 *
 * @group integration
 * FIXME: Skipped - requires real PostgreSQL database for SQL queries
 *
 * @module tests/unit/reallocation-api
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { dollarsToCents } from '../../client/src/lib/units';
import request from 'supertest';
import express from 'express';

// Type-only imports (no runtime side effects)
type QueryFn = <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount: number }>;

// Conditional describe - only run when ENABLE_REALLOCATION_TESTS is set
const describeMaybe = process.env.ENABLE_REALLOCATION_TESTS === 'true' ? describe : describe.skip;

// Dynamic module references (populated in beforeAll)
let query: QueryFn;
let reallocationRouter: typeof import('../../server/routes/reallocation').default;

// ============================================================================
// TEST SETUP
// ============================================================================

let app: express.Express;

interface TestFund {
  id: number;
  name: string;
  size: string;
}

interface TestCompany {
  id: number;
  fund_id: number;
  name: string;
  planned_reserves_cents: number;
  allocation_cap_cents: number | null;
  allocation_version: number;
}

let testFundId: number;
const testCompanies: TestCompany[] = [];

describeMaybe('Reallocation API', () => {
  /**
   * Setup test database with fund and companies
   */
  beforeAll(async () => {
    // Dynamic imports - only execute when suite actually runs
    // Mock server/db module to avoid dynamic require issues
    vi.mock('../../server/db', async () => {
      const { databaseMock } = await import('../helpers/database-mock');
      return {
        db: databaseMock,
        query: databaseMock.query ?? vi.fn(),
        transaction: databaseMock.transaction ?? vi.fn(),
      };
    });

    const dbModule = await import('../../server/db');
    query = dbModule.query as QueryFn;

    const routerModule = await import('../../server/routes/reallocation');
    reallocationRouter = routerModule.default;

    // Setup Express app after dynamic imports
    app = express();
    app.use(express.json());
    app.use(reallocationRouter);

    // Create test fund
    const fundResult = await query<TestFund>(
      `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, size`,
      ['Test Reallocation Fund', '100000000', '0.02', '0.20', 2024]
    );
    testFundId = fundResult.rows[0].id;

    // Create test companies
    const companies = [
      { name: 'Alpha Corp', sector: 'fintech', stage: 'seed', investment: '1000000' },
      { name: 'Beta Inc', sector: 'healthtech', stage: 'series_a', investment: '2000000' },
      { name: 'Gamma Ltd', sector: 'saas', stage: 'seed', investment: '500000' },
      { name: 'Delta Systems', sector: 'ai', stage: 'series_a', investment: '3000000' },
      { name: 'Epsilon Tech', sector: 'fintech', stage: 'seed', investment: '750000' },
    ];

    for (const company of companies) {
      const result = await query<TestCompany>(
        `INSERT INTO portfoliocompanies (
         fund_id, name, sector, stage, investment_amount,
         planned_reserves_cents, allocation_cap_cents, allocation_version, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, fund_id, name, planned_reserves_cents, allocation_cap_cents, allocation_version`,
        [
          testFundId,
          company.name,
          company.sector,
          company.stage,
          company.investment,
          dollarsToCents(parseFloat(company.investment)),
          dollarsToCents(parseFloat(company.investment) * 3), // 3x cap
          1,
          'active',
        ]
      );
      testCompanies.push(result.rows[0]);
    }
  });

  /**
   * Reset company allocations between tests
   */
  beforeEach(async () => {
    await query(
      `UPDATE portfoliocompanies
       SET
         planned_reserves_cents = CASE id
           ${testCompanies.map((c, i) => `WHEN $${i + 2} THEN $${i + 2 + testCompanies.length}`).join(' ')}
         END,
         allocation_version = 1,
         last_allocation_at = NULL
       WHERE fund_id = $1`,
      [
        testFundId,
        ...testCompanies.map((c) => c.id),
        ...testCompanies.map((c) => c.planned_reserves_cents),
      ]
    );
  });

  /**
   * Cleanup test data
   */
  afterAll(async () => {
    // NOTE: Pool cleanup handled by globalTeardown, not here
    await query(`DELETE FROM portfoliocompanies WHERE fund_id = $1`, [testFundId]);
    await query(`DELETE FROM reallocation_audit WHERE fund_id = $1`, [testFundId]);
    await query(`DELETE FROM funds WHERE id = $1`, [testFundId]);
  });

  // ============================================================================
  // PREVIEW ENDPOINT TESTS
  // ============================================================================

  describe('POST /api/funds/:fundId/reallocation/preview', () => {
    it('should preview reallocation with no changes', async () => {
      const response = await request(app)
        .post(`/api/funds/${testFundId}/reallocation/preview`)
        .send({
          current_version: 1,
          proposed_allocations: testCompanies.map((c) => ({
            company_id: c.id,
            planned_reserves_cents: c.planned_reserves_cents,
          })),
        });

      expect(response.status).toBe(200);
      expect(response.body.deltas).toHaveLength(testCompanies.length);
      expect(response.body.deltas.every((d: any) => d.status === 'unchanged')).toBe(true);
      expect(response.body.totals.delta_cents).toBe(0);
      expect(response.body.validation.is_valid).toBe(true);
      expect(response.body.warnings).toHaveLength(0);
    });

    it('should preview reallocation with increases and decreases', async () => {
      const proposed = [
        { company_id: testCompanies[0].id, planned_reserves_cents: dollarsToCents(1_500_000) }, // +50%
        { company_id: testCompanies[1].id, planned_reserves_cents: dollarsToCents(1_500_000) }, // -25%
        { company_id: testCompanies[2].id, planned_reserves_cents: dollarsToCents(500_000) }, // unchanged
      ];

      const response = await request(app)
        .post(`/api/funds/${testFundId}/reallocation/preview`)
        .send({
          current_version: 1,
          proposed_allocations: proposed,
        });

      expect(response.status).toBe(200);

      const alphaDeltas = response.body.deltas.find(
        (d: any) => d.company_id === testCompanies[0].id
      );
      expect(alphaDeltas.status).toBe('increased');
      expect(alphaDeltas.delta_cents).toBe(dollarsToCents(500_000));

      const betaDeltas = response.body.deltas.find(
        (d: any) => d.company_id === testCompanies[1].id
      );
      expect(betaDeltas.status).toBe('decreased');
      expect(betaDeltas.delta_cents).toBe(dollarsToCents(-500_000));

      expect(response.body.validation.is_valid).toBe(true);
    });

    it('should detect cap exceeded warning', async () => {
      const proposed = [
        {
          company_id: testCompanies[0].id,
          planned_reserves_cents: dollarsToCents(10_000_000), // Exceeds 3x cap
        },
      ];

      const response = await request(app)
        .post(`/api/funds/${testFundId}/reallocation/preview`)
        .send({
          current_version: 1,
          proposed_allocations: proposed,
        });

      expect(response.status).toBe(200);
      expect(response.body.validation.is_valid).toBe(false);
      expect(response.body.warnings.some((w: any) => w.type === 'cap_exceeded')).toBe(true);
      expect(response.body.validation.errors).toContain(
        expect.stringContaining('exceeds allocation cap')
      );
    });

    it('should detect high concentration warning', async () => {
      const _totalReserves = dollarsToCents(10_000_000);
      const highConcentration = dollarsToCents(4_000_000); // 40% of total

      const proposed = [
        { company_id: testCompanies[0].id, planned_reserves_cents: highConcentration },
        { company_id: testCompanies[1].id, planned_reserves_cents: dollarsToCents(3_000_000) },
        { company_id: testCompanies[2].id, planned_reserves_cents: dollarsToCents(3_000_000) },
      ];

      const response = await request(app)
        .post(`/api/funds/${testFundId}/reallocation/preview`)
        .send({
          current_version: 1,
          proposed_allocations: proposed,
        });

      expect(response.status).toBe(200);
      expect(response.body.warnings.some((w: any) => w.type === 'high_concentration')).toBe(true);
      expect(response.body.validation.is_valid).toBe(true); // Warning, not error
    });

    it('should return 409 on version conflict', async () => {
      const response = await request(app)
        .post(`/api/funds/${testFundId}/reallocation/preview`)
        .send({
          current_version: 999, // Wrong version
          proposed_allocations: testCompanies.map((c) => ({
            company_id: c.id,
            planned_reserves_cents: c.planned_reserves_cents,
          })),
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('Version conflict');
    });

    it('should validate request body schema', async () => {
      const response = await request(app)
        .post(`/api/funds/${testFundId}/reallocation/preview`)
        .send({
          current_version: 'invalid', // Should be number
          proposed_allocations: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid request body');
    });

    it('should detect unrealistic MOIC warning', async () => {
      const fundSize = dollarsToCents(100_000_000);
      const hugeAllocation = fundSize * 0.6; // 60% of fund

      const proposed = [
        { company_id: testCompanies[0].id, planned_reserves_cents: hugeAllocation },
      ];

      const response = await request(app)
        .post(`/api/funds/${testFundId}/reallocation/preview`)
        .send({
          current_version: 1,
          proposed_allocations: proposed,
        });

      expect(response.status).toBe(200);
      expect(response.body.warnings.some((w: any) => w.type === 'unrealistic_moic')).toBe(true);
    });
  });

  // ============================================================================
  // COMMIT ENDPOINT TESTS
  // ============================================================================

  describe('POST /api/funds/:fundId/reallocation/commit', () => {
    it('should commit successful reallocation', async () => {
      const proposed = [
        { company_id: testCompanies[0].id, planned_reserves_cents: dollarsToCents(1_500_000) },
        { company_id: testCompanies[1].id, planned_reserves_cents: dollarsToCents(2_500_000) },
      ];

      const response = await request(app)
        .post(`/api/funds/${testFundId}/reallocation/commit`)
        .send({
          current_version: 1,
          proposed_allocations: proposed,
          reason: 'Performance-based reallocation',
          user_id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.new_version).toBe(2);
      expect(response.body.updated_count).toBeGreaterThan(0);
      expect(response.body.audit_id).toBeDefined();

      // Verify database updates
      const updatedCompanies = await query<TestCompany>(
        `SELECT id, planned_reserves_cents, allocation_version
       FROM portfoliocompanies
       WHERE fund_id = $1 AND id = ANY($2::int[])`,
        [testFundId, proposed.map((p) => p.company_id)]
      );

      for (const updated of updatedCompanies.rows) {
        const prop = proposed.find((p) => p.company_id === updated.id);
        expect(updated.planned_reserves_cents).toBe(prop!.planned_reserves_cents);
        expect(updated.allocation_version).toBe(2);
      }

      // Verify audit log
      const auditLog = await query(`SELECT * FROM reallocation_audit WHERE id = $1`, [
        response.body.audit_id,
      ]);
      expect(auditLog.rows).toHaveLength(1);
      expect(auditLog.rows[0].baseline_version).toBe(1);
      expect(auditLog.rows[0].new_version).toBe(2);
      expect(auditLog.rows[0].reason).toBe('Performance-based reallocation');
    });

    it('should rollback on version conflict', async () => {
      const proposed = [
        { company_id: testCompanies[0].id, planned_reserves_cents: dollarsToCents(1_500_000) },
      ];

      const response = await request(app)
        .post(`/api/funds/${testFundId}/reallocation/commit`)
        .send({
          current_version: 999, // Wrong version
          proposed_allocations: proposed,
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('Version conflict');

      // Verify no changes were made
      const unchanged = await query<TestCompany>(
        `SELECT planned_reserves_cents, allocation_version
       FROM portfoliocompanies
       WHERE id = $1`,
        [testCompanies[0].id]
      );
      expect(unchanged.rows[0].planned_reserves_cents).toBe(
        testCompanies[0].planned_reserves_cents
      );
      expect(unchanged.rows[0].allocation_version).toBe(1);
    });

    it('should rollback on cap exceeded error', async () => {
      const proposed = [
        {
          company_id: testCompanies[0].id,
          planned_reserves_cents: dollarsToCents(50_000_000), // Exceeds cap
        },
      ];

      const response = await request(app)
        .post(`/api/funds/${testFundId}/reallocation/commit`)
        .send({
          current_version: 1,
          proposed_allocations: proposed,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Validation failed');

      // Verify no changes were made
      const unchanged = await query<TestCompany>(
        `SELECT planned_reserves_cents, allocation_version
       FROM portfoliocompanies
       WHERE id = $1`,
        [testCompanies[0].id]
      );
      expect(unchanged.rows[0].planned_reserves_cents).toBe(
        testCompanies[0].planned_reserves_cents
      );
      expect(unchanged.rows[0].allocation_version).toBe(1);
    });

    it('should handle concurrent reallocation attempts', async () => {
      const proposed1 = [
        { company_id: testCompanies[0].id, planned_reserves_cents: dollarsToCents(1_500_000) },
      ];
      const proposed2 = [
        { company_id: testCompanies[0].id, planned_reserves_cents: dollarsToCents(2_000_000) },
      ];

      // Start both requests simultaneously
      const [response1, response2] = await Promise.all([
        request(app).post(`/api/funds/${testFundId}/reallocation/commit`).send({
          current_version: 1,
          proposed_allocations: proposed1,
        }),
        request(app).post(`/api/funds/${testFundId}/reallocation/commit`).send({
          current_version: 1,
          proposed_allocations: proposed2,
        }),
      ]);

      // One should succeed, one should fail with version conflict
      const statuses = [response1.status, response2.status].sort();
      expect(statuses).toEqual([200, 409]);

      // Verify final state
      const finalState = await query<TestCompany>(
        `SELECT planned_reserves_cents, allocation_version
       FROM portfoliocompanies
       WHERE id = $1`,
        [testCompanies[0].id]
      );
      expect(finalState.rows[0].allocation_version).toBe(2);
      // The value should be from the successful request
      expect([dollarsToCents(1_500_000), dollarsToCents(2_000_000)]).toContain(
        finalState.rows[0].planned_reserves_cents
      );
    });

    it('should create audit log with correct change details', async () => {
      const proposed = [
        { company_id: testCompanies[0].id, planned_reserves_cents: dollarsToCents(1_500_000) },
        { company_id: testCompanies[1].id, planned_reserves_cents: dollarsToCents(2_500_000) },
      ];

      const response = await request(app)
        .post(`/api/funds/${testFundId}/reallocation/commit`)
        .send({
          current_version: 1,
          proposed_allocations: proposed,
          reason: 'Q4 rebalancing',
        });

      expect(response.status).toBe(200);

      // Verify audit log details
      const auditLog = await query<{ changes_json: any }>(
        `SELECT changes_json FROM reallocation_audit WHERE id = $1`,
        [response.body.audit_id]
      );

      const changes = auditLog.rows[0].changes_json;
      expect(Array.isArray(changes)).toBe(true);
      expect(changes.length).toBeGreaterThanOrEqual(2);

      // Verify change structure
      const alphaChange = changes.find((c: any) => c.company_id === testCompanies[0].id);
      expect(alphaChange).toBeDefined();
      expect(alphaChange.company_name).toBe(testCompanies[0].name);
      expect(alphaChange.from_cents).toBe(testCompanies[0].planned_reserves_cents);
      expect(alphaChange.to_cents).toBe(dollarsToCents(1_500_000));
      expect(alphaChange.delta_cents).toBe(
        dollarsToCents(1_500_000) - testCompanies[0].planned_reserves_cents
      );
    });

    it('should increment version atomically', async () => {
      // Commit first reallocation
      const response1 = await request(app)
        .post(`/api/funds/${testFundId}/reallocation/commit`)
        .send({
          current_version: 1,
          proposed_allocations: [
            { company_id: testCompanies[0].id, planned_reserves_cents: dollarsToCents(1_500_000) },
          ],
        });

      expect(response1.status).toBe(200);
      expect(response1.body.new_version).toBe(2);

      // Commit second reallocation
      const response2 = await request(app)
        .post(`/api/funds/${testFundId}/reallocation/commit`)
        .send({
          current_version: 2,
          proposed_allocations: [
            { company_id: testCompanies[0].id, planned_reserves_cents: dollarsToCents(2_000_000) },
          ],
        });

      expect(response2.status).toBe(200);
      expect(response2.body.new_version).toBe(3);

      // Verify all companies have the same version
      const versions = await query<{ allocation_version: number }>(
        `SELECT DISTINCT allocation_version
       FROM portfoliocompanies
       WHERE fund_id = $1`,
        [testFundId]
      );
      expect(versions.rows).toHaveLength(1);
      expect(versions.rows[0].allocation_version).toBe(3);
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe('Reallocation API Integration', () => {
    it('should complete full preview-commit workflow', async () => {
      const proposed = [
        { company_id: testCompanies[0].id, planned_reserves_cents: dollarsToCents(1_500_000) },
        { company_id: testCompanies[1].id, planned_reserves_cents: dollarsToCents(2_500_000) },
      ];

      // Step 1: Preview
      const previewResponse = await request(app)
        .post(`/api/funds/${testFundId}/reallocation/preview`)
        .send({
          current_version: 1,
          proposed_allocations: proposed,
        });

      expect(previewResponse.status).toBe(200);
      expect(previewResponse.body.validation.is_valid).toBe(true);

      // Step 2: Commit
      const commitResponse = await request(app)
        .post(`/api/funds/${testFundId}/reallocation/commit`)
        .send({
          current_version: 1,
          proposed_allocations: proposed,
          reason: 'Approved after preview',
        });

      expect(commitResponse.status).toBe(200);
      expect(commitResponse.body.success).toBe(true);

      // Step 3: Verify changes
      const verification = await query<TestCompany>(
        `SELECT id, planned_reserves_cents, allocation_version, last_allocation_at
       FROM portfoliocompanies
       WHERE fund_id = $1 AND id = ANY($2::int[])`,
        [testFundId, proposed.map((p) => p.company_id)]
      );

      for (const verified of verification.rows) {
        const prop = proposed.find((p) => p.company_id === verified.id);
        expect(verified.planned_reserves_cents).toBe(prop!.planned_reserves_cents);
        expect(verified.allocation_version).toBe(2);
        expect(verified.last_allocation_at).not.toBeNull();
      }
    });
  });
}); // End describeMaybe('Reallocation API')
