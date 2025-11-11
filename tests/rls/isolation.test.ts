/**
 * RLS Isolation Tests
 *
 * Verify that Row-Level Security policies correctly isolate tenant data.
 * These tests ensure no data leakage between organizations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import {
  switchTenant,
  resetTenant,
  withTenantContext,
  getCurrentTenant,
  verifyRLS,
  listOrganizations,
} from '../../server/lib/tenant-context.js';
import { funds, portfolioCompanies, investments } from '../../shared/schema.js';

const { Pool } = pg;

describe('RLS Cross-Tenant Isolation', () => {
  let pool: pg.Pool;
  let db: ReturnType<typeof drizzle>;

  beforeEach(async () => {
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/povc_test';
    pool = new Pool({ connectionString });
    db = drizzle(pool);

    // Ensure clean state
    await resetTenant(db);
  });

  afterEach(async () => {
    await resetTenant(db);
    await pool.end();
  });

  describe('Organization Setup', () => {
    it('should have multiple test organizations', async () => {
      const orgs = await listOrganizations(db);

      expect(orgs.length).toBeGreaterThanOrEqual(2);
      expect(orgs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ slug: 'tech-ventures' }),
          expect.objectContaining({ slug: 'bio-capital' }),
        ])
      );
    });

    it('should switch tenant context correctly', async () => {
      await switchTenant(db, 'tech-ventures');
      let context = await getCurrentTenant(db);
      expect(context?.orgSlug).toBe('tech-ventures');

      await switchTenant(db, 'bio-capital');
      context = await getCurrentTenant(db);
      expect(context?.orgSlug).toBe('bio-capital');
    });

    it('should reset tenant context to admin mode', async () => {
      await switchTenant(db, 'tech-ventures');
      await resetTenant(db);

      const context = await getCurrentTenant(db);
      expect(context).toBeNull();
    });
  });

  describe('Funds Isolation', () => {
    it('should only see own organization funds', async () => {
      const techFunds = await withTenantContext(db, 'tech-ventures', async () => {
        return await db.select().from(funds);
      });

      const bioFunds = await withTenantContext(db, 'bio-capital', async () => {
        return await db.select().from(funds);
      });

      // Should have different fund counts
      expect(techFunds.length).toBeGreaterThan(0);
      expect(bioFunds.length).toBeGreaterThan(0);

      // No overlap in fund IDs
      const techIds = techFunds.map(f => f.id);
      const bioIds = bioFunds.map(f => f.id);
      const intersection = techIds.filter(id => bioIds.includes(id));
      expect(intersection).toHaveLength(0);

      // Verify org_id matches
      techFunds.forEach(fund => {
        expect(fund.orgId).toBeTruthy();
      });
      bioFunds.forEach(fund => {
        expect(fund.orgId).toBeTruthy();
      });

      // Cross-tenant funds should have different org_ids
      expect(techFunds[0].orgId).not.toBe(bioFunds[0].orgId);
    });

    it('should prevent cross-tenant fund updates', async () => {
      // Get a fund from tech-ventures
      await switchTenant(db, 'tech-ventures');
      const techFunds = await db.select().from(funds);
      expect(techFunds.length).toBeGreaterThan(0);
      const fundId = techFunds[0].id;

      // Try to update from bio-capital context (should fail)
      await switchTenant(db, 'bio-capital');
      const updateResult = await db
        .update(funds)
        .set({ size: '99999999' })
        .where(sql`id = ${fundId}`)
        .returning();

      // Should not update any rows
      expect(updateResult).toHaveLength(0);

      // Verify fund unchanged
      await switchTenant(db, 'tech-ventures');
      const [unchanged] = await db.select().from(funds).where(sql`id = ${fundId}`);
      expect(unchanged.size).toBe(techFunds[0].size); // Original value
    });

    it('should prevent cross-tenant fund deletion', async () => {
      // Get a fund from tech-ventures
      await switchTenant(db, 'tech-ventures');
      const techFunds = await db.select().from(funds);
      const fundId = techFunds[0].id;

      // Try to delete from bio-capital context (should fail)
      await switchTenant(db, 'bio-capital');
      const deleteResult = await db
        .delete(funds)
        .where(sql`id = ${fundId}`)
        .returning();

      // Should not delete any rows
      expect(deleteResult).toHaveLength(0);

      // Verify fund still exists
      await switchTenant(db, 'tech-ventures');
      const stillExists = await db.select().from(funds).where(sql`id = ${fundId}`);
      expect(stillExists).toHaveLength(1);
    });
  });

  describe('Portfolio Companies Isolation', () => {
    it('should only see own organization companies', async () => {
      const techCompanies = await withTenantContext(db, 'tech-ventures', async () => {
        return await db.select().from(portfolioCompanies);
      });

      const bioCompanies = await withTenantContext(db, 'bio-capital', async () => {
        return await db.select().from(portfolioCompanies);
      });

      expect(techCompanies.length).toBeGreaterThan(0);
      expect(bioCompanies.length).toBeGreaterThan(0);

      // Verify no overlap
      const techIds = techCompanies.map(c => c.id);
      const bioIds = bioCompanies.map(c => c.id);
      expect(techIds.filter(id => bioIds.includes(id))).toHaveLength(0);
    });

    it('should allow same company name across organizations', async () => {
      // Both orgs have "Alpha Innovations" (edge case in seed data)
      const techAlpha = await withTenantContext(db, 'tech-ventures', async () => {
        return await db.select().from(portfolioCompanies).where(sql`name = 'Alpha Innovations'`);
      });

      const bioAlpha = await withTenantContext(db, 'bio-capital', async () => {
        return await db.select().from(portfolioCompanies).where(sql`name = 'Alpha Innovations'`);
      });

      expect(techAlpha).toHaveLength(1);
      expect(bioAlpha).toHaveLength(1);

      // Same name but different records
      expect(techAlpha[0].id).not.toBe(bioAlpha[0].id);
      expect(techAlpha[0].orgId).not.toBe(bioAlpha[0].orgId);

      // Different sectors (Fintech vs Biotech)
      expect(techAlpha[0].sector).toBe('Fintech');
      expect(bioAlpha[0].sector).toBe('Biotech');
    });
  });

  describe('Investments Isolation', () => {
    it('should only see own organization investments', async () => {
      const techInvestments = await withTenantContext(db, 'tech-ventures', async () => {
        return await db.select().from(investments);
      });

      const bioInvestments = await withTenantContext(db, 'bio-capital', async () => {
        return await db.select().from(investments);
      });

      expect(techInvestments.length).toBeGreaterThan(0);
      expect(bioInvestments.length).toBeGreaterThan(0);

      // Verify isolation
      techInvestments.forEach(inv => {
        expect(inv.orgId).toBeTruthy();
      });
      bioInvestments.forEach(inv => {
        expect(inv.orgId).toBeTruthy();
      });

      expect(techInvestments[0].orgId).not.toBe(bioInvestments[0].orgId);
    });
  });

  describe('RLS Policy Verification', () => {
    it('should have RLS enabled on all tenant tables', async () => {
      const tables = ['funds', 'portfoliocompanies', 'investments', 'fundconfigs'];

      for (const table of tables) {
        const status = await verifyRLS(db, table);

        expect(status.enabled, `RLS should be enabled on ${table}`).toBe(true);
        expect(status.policyCount, `${table} should have policies`).toBeGreaterThan(0);

        console.log(`[RLS CHECK] ${table}: ${status.policyCount} policies`);
      }
    });

    it('should have standard CRUD policies', async () => {
      const status = await verifyRLS(db, 'funds');

      const policyNames = status.policies.map(p => p.name.toLowerCase());

      // Should have policies for all CRUD operations
      expect(policyNames.some(name => name.includes('select'))).toBe(true);
      expect(policyNames.some(name => name.includes('insert'))).toBe(true);
      expect(policyNames.some(name => name.includes('update'))).toBe(true);
      expect(policyNames.some(name => name.includes('delete'))).toBe(true);
    });
  });

  describe('Admin Mode (No Tenant Context)', () => {
    it('should see all records when no tenant set', async () => {
      // Reset to admin mode
      await resetTenant(db);

      const allFunds = await db.select().from(funds);

      // Should see funds from multiple organizations
      const uniqueOrgIds = new Set(allFunds.map(f => f.orgId));
      expect(uniqueOrgIds.size).toBeGreaterThanOrEqual(2);
    });
  });
});
