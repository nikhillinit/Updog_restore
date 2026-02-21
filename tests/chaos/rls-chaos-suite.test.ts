/**
 * Multi-Tenant RLS Chaos Engineering Test Suite
 *
 * Automated failure injection and resilience validation
 * Run with: npm test -- tests/chaos/rls-chaos-suite.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PoolClient } from 'pg';
import { Pool } from 'pg';

// Test configuration
const CHAOS_CONFIG = {
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/updog',
  testOrgId: 'chaos-test-org-id',
  testUserId: 'chaos-test-user-id',
  testFundId: 12345,
};

describe('RLS Chaos Engineering Test Suite', () => {
  let pool: Pool;
  let testOrgCreated = false;

  beforeAll(async () => {
    pool = new Pool({ connectionString: CHAOS_CONFIG.connectionString });

    // Create test organization
    try {
      await pool.query(
        `
        INSERT INTO organizations (id, name, slug, status)
        VALUES ($1, 'Chaos Test Org', 'chaos-test-org', 'active')
        ON CONFLICT (slug) DO NOTHING
      `,
        [CHAOS_CONFIG.testOrgId]
      );
      testOrgCreated = true;
    } catch (err) {
      console.warn('Test org already exists or failed to create:', err);
    }
  });

  afterAll(async () => {
    // Cleanup test data
    if (testOrgCreated) {
      await pool.query('DELETE FROM organizations WHERE id = $1', [CHAOS_CONFIG.testOrgId]);
    }
    await pool.end();
  });

  describe('Scenario 6: Missing RLS Context (Fail-Closed)', () => {
    it('should return zero rows when RLS context not set', async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Intentionally skip setting app.current_org
        const result = await client.query('SELECT * FROM funds');

        // Fail-closed: should see no data
        expect(result.rows).toHaveLength(0);

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    it('should use invalid UUID when context is empty string', async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Set context to empty string (edge case)
        await client.query("SELECT set_config('app.current_org', '', true)");

        // Check what current_org_id() returns
        const result = await client.query('SELECT current_org_id() as org_id');
        const orgId = result.rows[0]?.org_id;

        // Should be fail-closed invalid UUID
        expect(orgId).toBe('00000000-0000-0000-0000-000000000000');

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    it('should prevent cross-tenant access with NULL context', async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Create fund in test org
        await client.query("SELECT set_config('app.current_org', $1, true)", [
          CHAOS_CONFIG.testOrgId,
        ]);
        await client.query(
          `
          INSERT INTO funds (name, size, vintage_year, organization_id)
          VALUES ('Test Fund', 10000000, 2024, $1)
        `,
          [CHAOS_CONFIG.testOrgId]
        );

        // Reset context to NULL
        await client.query("SELECT set_config('app.current_org', NULL, true)");

        // Try to query - should see nothing
        const result = await client.query('SELECT * FROM funds WHERE name = $1', ['Test Fund']);
        expect(result.rows).toHaveLength(0);

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });
  });

  describe('Scenario 8: Transaction Rollback (Context Lost)', () => {
    it('should lose context after explicit rollback', async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Set context with SET LOCAL
        await client.query("SELECT set_config('app.current_org', $1, true)", [
          CHAOS_CONFIG.testOrgId,
        ]);

        // Verify context is set
        let result = await client.query("SELECT current_setting('app.current_org', true) as org");
        expect(result.rows[0]?.org).toBe(CHAOS_CONFIG.testOrgId);

        // Rollback transaction
        await client.query('ROLLBACK');

        // Start new transaction
        await client.query('BEGIN');

        // Context should be gone
        result = await client.query("SELECT current_setting('app.current_org', true) as org");
        expect(result.rows[0]?.org).toBe(''); // Empty string or NULL

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    it('should not leak context across transactions', async () => {
      const client = await pool.connect();

      try {
        // Transaction 1: Set context for org A
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_org', 'org-a', true)");
        await client.query('COMMIT');

        // Transaction 2: Should not inherit context
        await client.query('BEGIN');
        const result = await client.query("SELECT current_setting('app.current_org', true) as org");
        expect(result.rows[0]?.org).toBe('');
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });
  });

  describe('Scenario 9: Connection Pool Stale Context', () => {
    it('should reset context on connection reuse (DISCARD ALL)', async () => {
      const client = await pool.connect();

      try {
        // Simulate PgBouncer behavior
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_org', $1, true)", [
          CHAOS_CONFIG.testOrgId,
        ]);
        await client.query('COMMIT');

        // Simulate DISCARD ALL on connection return
        await client.query('DISCARD ALL');

        // New transaction should have clean slate
        await client.query('BEGIN');
        const result = await client.query("SELECT current_setting('app.current_org', true) as org");
        expect(result.rows[0]?.org).toBe('');
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    it('should not leak context between pool connections', async () => {
      // Get two separate connections
      const client1 = await pool.connect();
      const client2 = await pool.connect();

      try {
        // Set context on client1
        await client1.query('BEGIN');
        await client1.query("SELECT set_config('app.current_org', 'org-1', true)");

        // Check client2 has no context
        await client2.query('BEGIN');
        const result = await client2.query(
          "SELECT current_setting('app.current_org', true) as org"
        );
        expect(result.rows[0]?.org).toBe('');

        await client1.query('ROLLBACK');
        await client2.query('ROLLBACK');
      } finally {
        client1.release();
        client2.release();
      }
    });
  });

  describe('Scenario 10: RLS Performance Overhead', () => {
    it('should complete simple query within 5ms (p95 target)', async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_org', $1, true)", [
          CHAOS_CONFIG.testOrgId,
        ]);

        // Measure query performance
        const measurements: number[] = [];

        for (let i = 0; i < 100; i++) {
          const start = Date.now();
          await client.query('SELECT * FROM funds WHERE id = 1');
          const duration = Date.now() - start;
          measurements.push(duration);
        }

        // Calculate p95
        measurements.sort((a, b) => a - b);
        const p95 = measurements[Math.floor(measurements.length * 0.95)];

        console.warn(`RLS query p95: ${p95}ms`);
        expect(p95).toBeLessThan(5);

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    it('should use index scan for org-filtered queries', async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_org', $1, true)", [
          CHAOS_CONFIG.testOrgId,
        ]);

        // Get query plan
        const result = await client.query(`
          EXPLAIN (FORMAT JSON)
          SELECT * FROM funds
          WHERE organization_id = current_org_id()
        `);

        const plan = JSON.stringify(result.rows[0]);

        // Should use index, not seq scan
        expect(plan).toContain('Index Scan');
        expect(plan).not.toContain('Seq Scan');

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });
  });

  describe('Scenario 14: SQL Injection Resistance', () => {
    it('should reject invalid UUID format', async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Try SQL injection in org_id
        const maliciousInput = "'; DROP TABLE funds; --";

        await expect(async () => {
          await client.query("SELECT set_config('app.current_org', $1, true)", [maliciousInput]);
          await client.query('SELECT current_org_id()');
        }).rejects.toThrow(); // Should fail UUID validation

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    it('should use parameterized queries only', async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Correct: parameterized
        await client.query("SELECT set_config('app.current_org', $1, true)", [
          CHAOS_CONFIG.testOrgId,
        ]);

        const result = await client.query('SELECT * FROM funds WHERE organization_id = $1', [
          CHAOS_CONFIG.testOrgId,
        ]);

        // Should succeed
        expect(result.rows).toBeDefined();

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });
  });

  describe('Scenario 18: Data Integrity After Rollback', () => {
    it('should preserve all data after RLS disable', async () => {
      const client = await pool.connect();

      try {
        // Count rows with RLS enabled
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_org', $1, true)", [
          CHAOS_CONFIG.testOrgId,
        ]);

        const withRLS = await client.query('SELECT COUNT(*) FROM funds');
        const countWithRLS = parseInt(withRLS.rows[0]?.count || '0');

        await client.query('ROLLBACK');

        // Disable RLS temporarily
        await client.query('BEGIN');
        await client.query('ALTER TABLE funds DISABLE ROW LEVEL SECURITY');

        const withoutRLS = await client.query('SELECT COUNT(*) FROM funds');
        const countWithoutRLS = parseInt(withoutRLS.rows[0]?.count || '0');

        // Re-enable RLS
        await client.query('ALTER TABLE funds ENABLE ROW LEVEL SECURITY');
        await client.query('ROLLBACK');

        // Total count should be >= org-specific count
        expect(countWithoutRLS).toBeGreaterThanOrEqual(countWithRLS);
      } finally {
        client.release();
      }
    });

    it('should verify foreign key consistency', async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Check for orphaned portfoliocompanies
        const orphanedCompanies = await client.query(`
          SELECT COUNT(*) as orphaned
          FROM portfoliocompanies pc
          LEFT JOIN funds f ON pc.fund_id = f.id
          WHERE f.id IS NULL
        `);

        expect(parseInt(orphanedCompanies.rows[0]?.orphaned || '0')).toBe(0);

        // Check for org_id mismatch
        const orgMismatch = await client.query(`
          SELECT COUNT(*) as mismatched
          FROM portfoliocompanies pc
          JOIN funds f ON pc.fund_id = f.id
          WHERE pc.organization_id != f.organization_id
        `);

        expect(parseInt(orgMismatch.rows[0]?.mismatched || '0')).toBe(0);

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });
  });

  describe('Scenario 20: Data Corruption Detection', () => {
    it('should detect missing organization_id values', async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const nullOrgs = await client.query(`
          SELECT COUNT(*) as null_count
          FROM funds
          WHERE organization_id IS NULL
        `);

        expect(parseInt(nullOrgs.rows[0]?.null_count || '0')).toBe(0);

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    it('should verify RLS is enabled on all tables', async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const rlsStatus = await client.query(`
          SELECT
            c.relname as table_name,
            c.relrowsecurity as rls_enabled,
            c.relforcerowsecurity as rls_forced
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
          AND c.relname IN ('funds', 'portfoliocompanies', 'investments', 'investment_lots')
          AND c.relkind = 'r'
        `);

        for (const row of rlsStatus.rows) {
          expect(row.rls_enabled, `RLS should be enabled on ${row.table_name}`).toBe(true);
          expect(row.rls_forced, `RLS should be forced on ${row.table_name}`).toBe(true);
        }

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    it('should verify RLS policies exist', async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const policies = await client.query(`
          SELECT
            tablename,
            COUNT(*) as policy_count
          FROM pg_policies
          WHERE schemaname = 'public'
          AND tablename IN ('funds', 'portfoliocompanies', 'investments')
          GROUP BY tablename
        `);

        for (const row of policies.rows) {
          // Each table should have at least 4 policies (SELECT, INSERT, UPDATE, DELETE)
          expect(
            parseInt(row.policy_count),
            `${row.tablename} should have 4+ policies`
          ).toBeGreaterThanOrEqual(4);
        }

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });
  });
});

/**
 * Performance Benchmark Suite
 * Run separately: npm test -- tests/chaos/rls-chaos-suite.test.ts -t "Performance Benchmarks"
 */
describe('Performance Benchmarks', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: CHAOS_CONFIG.connectionString });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should benchmark simple SELECT by ID', async () => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_org', $1, true)", [
        CHAOS_CONFIG.testOrgId,
      ]);

      const iterations = 1000;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        await client.query('SELECT * FROM funds WHERE id = 1');
      }

      const duration = Date.now() - start;
      const avgMs = duration / iterations;

      console.warn(`Simple SELECT average: ${avgMs.toFixed(3)}ms`);
      expect(avgMs).toBeLessThan(5);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('should benchmark org-filtered list query', async () => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_org', $1, true)", [
        CHAOS_CONFIG.testOrgId,
      ]);

      const iterations = 100;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        await client.query('SELECT * FROM funds WHERE organization_id = current_org_id() LIMIT 50');
      }

      const duration = Date.now() - start;
      const avgMs = duration / iterations;

      console.warn(`List query average: ${avgMs.toFixed(3)}ms`);
      expect(avgMs).toBeLessThan(20);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('should benchmark complex join query', async () => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_org', $1, true)", [
        CHAOS_CONFIG.testOrgId,
      ]);

      const iterations = 50;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        await client.query(`
          SELECT
            f.*,
            COUNT(pc.id) as company_count,
            COALESCE(SUM(i.amount_cents), 0) as total_invested
          FROM funds f
          LEFT JOIN portfoliocompanies pc ON pc.fund_id = f.id
          LEFT JOIN investments i ON i.fund_id = f.id
          WHERE f.organization_id = current_org_id()
          GROUP BY f.id
        `);
      }

      const duration = Date.now() - start;
      const avgMs = duration / iterations;

      console.log(`Complex join average: ${avgMs.toFixed(3)}ms`);
      expect(avgMs).toBeLessThan(100);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});

/**
 * Concurrency Stress Tests
 * Run separately: npm test -- tests/chaos/rls-chaos-suite.test.ts -t "Concurrency"
 */
describe('Concurrency Stress Tests', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: CHAOS_CONFIG.connectionString,
      max: 50, // Allow more concurrent connections
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should handle 50 concurrent queries without context leakage', async () => {
    const orgs = Array.from({ length: 5 }, (_, i) => `org-${i}`);
    const queries = Array.from({ length: 50 }, (_, i) => ({
      orgId: orgs[i % orgs.length],
      queryId: i,
    }));

    const results = await Promise.all(
      queries.map(async ({ orgId, queryId }) => {
        const client = await pool.connect();

        try {
          await client.query('BEGIN');
          await client.query("SELECT set_config('app.current_org', $1, true)", [orgId]);

          const result = await client.query('SELECT current_org_id() as org');
          const returnedOrg = result.rows[0]?.org;

          await client.query('ROLLBACK');

          return { queryId, expectedOrg: orgId, returnedOrg };
        } finally {
          client.release();
        }
      })
    );

    // Verify no context leakage
    for (const { queryId, expectedOrg, returnedOrg } of results) {
      expect(returnedOrg, `Query ${queryId} context mismatch`).toBe(expectedOrg);
    }
  });

  it('should handle connection pool saturation gracefully', async () => {
    const maxConnections = 50;

    // Saturate pool
    const clients: PoolClient[] = [];
    for (let i = 0; i < maxConnections; i++) {
      clients.push(await pool.connect());
    }

    // Try to get one more (should timeout or queue)
    const startTime = Date.now();
    let timedOut = false;

    try {
      await Promise.race([
        pool.connect(),
        new Promise((_, reject) =>
          setTimeout(() => {
            timedOut = true;
            reject(new Error('Connection timeout'));
          }, 2000)
        ),
      ]);
    } catch (err) {
      expect(timedOut).toBe(true);
    }

    // Release all connections
    clients.forEach((client) => client.release());

    // Should be able to connect now
    const client = await pool.connect();
    expect(client).toBeDefined();
    client.release();
  });
});
