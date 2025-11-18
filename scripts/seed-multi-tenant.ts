/**
 * Multi-Tenant Seed Data Script
 *
 * Creates realistic test data for 2 organizations to test cross-tenant isolation.
 * Includes edge cases like duplicate company names across organizations.
 *
 * Usage:
 *   npm run seed:multi-tenant                    # Seed with defaults
 *   npm run seed:multi-tenant -- --reset         # Drop and recreate data
 *   npm run seed:multi-tenant -- --org=tech      # Seed only tech-ventures
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { funds, portfolioCompanies, investments } from '../shared/schema.js';
import { eq, sql } from 'drizzle-orm';

const { Pool } = pg;

interface Organization {
  id: number;
  name: string;
  slug: string;
}

interface SeedData {
  organizations: Array<{ name: string; slug: string }>;
  funds: Record<string, Array<{ name: string; size: string; vintage: number }>>;
  companies: Record<string, Array<{ name: string; sector: string }>>;
}

const SEED_DATA: SeedData = {
  organizations: [
    { name: 'Tech Ventures LLC', slug: 'tech-ventures' },
    { name: 'Bio Capital Partners', slug: 'bio-capital' },
  ],
  funds: {
    'tech-ventures': [
      { name: 'Tech Ventures Fund I', size: '50000000', vintage: 2020 },
      { name: 'Tech Ventures Fund II', size: '100000000', vintage: 2022 },
      { name: 'Tech Ventures Opportunity Fund', size: '25000000', vintage: 2023 },
    ],
    'bio-capital': [
      { name: 'Bio Capital Fund I', size: '75000000', vintage: 2019 },
      { name: 'Bio Capital Growth Fund', size: '150000000', vintage: 2021 },
    ],
  },
  companies: {
    'tech-ventures': [
      { name: 'CloudScale Inc', sector: 'SaaS' },
      { name: 'DataPipe AI', sector: 'AI/ML' },
      { name: 'SecureAuth Corp', sector: 'Security' },
      { name: 'DevOps Pro', sector: 'DevTools' },
      { name: 'QuantumDB', sector: 'Database' },
      // Edge case: Same name exists in bio-capital
      { name: 'Alpha Innovations', sector: 'Fintech' },
    ],
    'bio-capital': [
      { name: 'GenomeTech Solutions', sector: 'Genomics' },
      { name: 'BioSynth Labs', sector: 'Synthetic Biology' },
      { name: 'MediAI Diagnostics', sector: 'Medical Devices' },
      { name: 'CellCure Therapeutics', sector: 'Cell Therapy' },
      // Edge case: Same name as in tech-ventures (different sector)
      { name: 'Alpha Innovations', sector: 'Biotech' },
    ],
  },
};

async function seedDatabase(options: { reset?: boolean; org?: string } = {}) {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/povc_dev';

  console.log('[INFO] Connecting to database...');
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  try {
    // Reset database if requested
    if (options.reset) {
      console.log('[INFO] Resetting database...');
      await pool.query('TRUNCATE TABLE organizations CASCADE');
      console.log('[SUCCESS] Database reset complete');
    }

    // Filter organizations if specific org requested
    const orgsToSeed = options.org
      ? SEED_DATA.organizations.filter(o => o.slug === options.org)
      : SEED_DATA.organizations;

    if (orgsToSeed.length === 0) {
      console.error(`[ERROR] No organization found with slug: ${options.org}`);
      process.exit(1);
    }

    for (const orgData of orgsToSeed) {
      console.log(`\n[INFO] Seeding organization: ${orgData.name}`);

      // Create organization
      const [org] = await pool.query<Organization>(
        'INSERT INTO organizations (name, slug, settings) VALUES ($1, $2, $3) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, name, slug',
        [orgData.name, orgData.slug, JSON.stringify({ max_funds: 10 })]
      );

      const orgId = org.rows[0].id;
      console.log(`[SUCCESS] Created organization (ID: ${orgId})`);

      // Set tenant context for RLS
      await pool.query('SELECT switch_tenant($1)', [orgId]);

      // Seed funds
      const fundRecords = SEED_DATA.funds[orgData.slug] || [];
      console.log(`[INFO] Creating ${fundRecords.length} funds...`);

      const createdFunds: number[] = [];
      for (const fundData of fundRecords) {
        const result = await pool.query(
          `INSERT INTO funds (org_id, name, size, vintage, inception_date, term_years, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'active')
           RETURNING id`,
          [
            orgId,
            fundData.name,
            fundData.size,
            fundData.vintage,
            `${fundData.vintage}-01-01`,
            10,
          ]
        );
        createdFunds.push(result.rows[0].id);
      }
      console.log(`[SUCCESS] Created ${createdFunds.length} funds`);

      // Seed companies
      const companyRecords = SEED_DATA.companies[orgData.slug] || [];
      console.log(`[INFO] Creating ${companyRecords.length} companies...`);

      const createdCompanies: number[] = [];
      for (const companyData of companyRecords) {
        const result = await pool.query(
          `INSERT INTO portfoliocompanies (org_id, fund_id, name, sector, stage, website, description)
           VALUES ($1, $2, $3, $4, 'Series A', $5, $6)
           RETURNING id`,
          [
            orgId,
            createdFunds[0], // Assign to first fund for simplicity
            companyData.name,
            companyData.sector,
            `https://${companyData.name.toLowerCase().replace(/\s+/g, '')}.com`,
            `Innovative ${companyData.sector} company`,
          ]
        );
        createdCompanies.push(result.rows[0].id);
      }
      console.log(`[SUCCESS] Created ${createdCompanies.length} companies`);

      // Seed investments (2-3 investments per company)
      console.log('[INFO] Creating investments...');
      let investmentCount = 0;

      for (let i = 0; i < createdCompanies.length; i++) {
        const companyId = createdCompanies[i];
        const numInvestments = Math.floor(Math.random() * 2) + 2; // 2-3 investments

        for (let j = 0; j < numInvestments; j++) {
          const fundId = createdFunds[j % createdFunds.length];
          const investmentDate = new Date(2020 + j, i % 12, 1);
          const amount = (Math.random() * 4 + 1) * 1000000; // $1M-$5M

          await pool.query(
            `INSERT INTO investments (org_id, fund_id, company_id, investment_date, amount, round, ownership_pct)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              orgId,
              fundId,
              companyId,
              investmentDate.toISOString().split('T')[0],
              amount.toFixed(2),
              j === 0 ? 'Seed' : `Series ${String.fromCharCode(65 + j - 1)}`,
              (Math.random() * 15 + 5).toFixed(2), // 5-20% ownership
            ]
          );
          investmentCount++;
        }
      }
      console.log(`[SUCCESS] Created ${investmentCount} investments`);

      // Reset tenant context
      await pool.query('SELECT reset_tenant()');

      // Verify isolation
      console.log('[INFO] Verifying cross-tenant isolation...');
      await pool.query('SELECT switch_tenant($1)', [orgId]);

      const fundCount = await pool.query('SELECT COUNT(*) FROM funds');
      const companyCount = await pool.query('SELECT COUNT(*) FROM portfoliocompanies');

      console.log(`[CHECK] Org ${orgData.slug} sees ${fundCount.rows[0].count} funds (expected: ${createdFunds.length})`);
      console.log(`[CHECK] Org ${orgData.slug} sees ${companyCount.rows[0].count} companies (expected: ${createdCompanies.length})`);

      await pool.query('SELECT reset_tenant()');
    }

    console.log('\n[SUCCESS] Multi-tenant seed complete!');
    console.log('\nNext steps:');
    console.log('  1. Test tenant switching: npm run dev:tenant -- --org=tech-ventures');
    console.log('  2. Run cross-tenant tests: npm run test:rls');
    console.log('  3. Verify isolation in pgAdmin: http://localhost:8080');

  } catch (error) {
    console.error('[ERROR] Seed failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// CLI argument parsing
const args = process.argv.slice(2);
const options = {
  reset: args.includes('--reset'),
  org: args.find(arg => arg.startsWith('--org='))?.split('=')[1],
};

seedDatabase(options).catch(error => {
  console.error('[FATAL] Unhandled error:', error);
  process.exit(1);
});
