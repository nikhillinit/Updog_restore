/**
 * Test Data Seed Script
 *
 * Creates comprehensive test data for QA testing and E2E test runs.
 * Includes:
 * - Test fund with complete 7-step wizard data
 * - Portfolio companies at various stages
 * - Investment transactions with cap table data
 * - LP accounts with capital calls and distributions
 * - Scenarios for comparison testing
 *
 * Usage:
 *   npm run db:seed:test                     # Seed with defaults
 *   npm run db:seed:test -- --reset          # Drop and recreate test data
 *   npm run db:seed:test -- --minimal        # Minimal dataset for quick tests
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import {
  funds,
  portfolioCompanies,
  investments,
  users,
  fundDistributions,
  scenarios
} from '../shared/schema.js';
import {
  limitedPartners,
  lpFundCommitments,
  capitalActivities
} from '../shared/schema-lp-reporting.js';
import { eq, sql } from 'drizzle-orm';

const { Pool } = pg;

interface SeedOptions {
  reset?: boolean;
  minimal?: boolean;
}

const TEST_DATA = {
  fund: {
    name: 'Test Venture Fund I',
    size: '100000000', // $100M
    vintage: 2023,
    managementFeeRate: 2.0,
    carriedInterestRate: 20.0,
    gpCommitment: 2.0, // 2% GP commitment
  },
  companies: [
    {
      name: 'Alpha SaaS Corp',
      sector: 'SaaS',
      stage: 'Series A',
      initialValuation: 10000000, // $10M
      initialInvestment: 1000000,  // $1M (10% ownership)
    },
    {
      name: 'Beta AI Labs',
      sector: 'AI/ML',
      stage: 'Seed',
      initialValuation: 5000000,   // $5M
      initialInvestment: 500000,   // $500K (10% ownership)
    },
    {
      name: 'Gamma Fintech Inc',
      sector: 'Fintech',
      stage: 'Series B',
      initialValuation: 50000000,  // $50M
      initialInvestment: 5000000,  // $5M (10% ownership)
    },
    {
      name: 'Delta Biotech',
      sector: 'Biotech',
      stage: 'Series A',
      initialValuation: 20000000,  // $20M
      initialInvestment: 2000000,  // $2M (10% ownership)
      status: 'exited',
      exitValue: 30000000,         // $30M exit (1.5x MOIC)
    },
  ],
  lpAccounts: [
    {
      name: 'Institutional LP 1',
      email: 'lp1@test.com',
      commitment: 10000000,        // $10M commitment
      capitalCalled: 5000000,      // $5M called
      distributionsReceived: 2000000, // $2M distributed
    },
    {
      name: 'Institutional LP 2',
      email: 'lp2@test.com',
      commitment: 20000000,        // $20M commitment
      capitalCalled: 10000000,     // $10M called
      distributionsReceived: 4000000, // $4M distributed
    },
    {
      name: 'Family Office LP',
      email: 'lp3@test.com',
      commitment: 5000000,         // $5M commitment
      capitalCalled: 2500000,      // $2.5M called
      distributionsReceived: 1000000, // $1M distributed
    },
  ],
  scenarios: [
    {
      name: 'Base Case',
      description: 'Conservative assumptions with historical market returns',
      assumptions: {
        successRate: 0.25,
        avgMultiple: 3.0,
        deploymentPace: 'steady',
      },
    },
    {
      name: 'Bull Case',
      description: 'Optimistic assumptions with above-market returns',
      assumptions: {
        successRate: 0.40,
        avgMultiple: 5.0,
        deploymentPace: 'aggressive',
      },
    },
    {
      name: 'Bear Case',
      description: 'Conservative assumptions with below-market returns',
      assumptions: {
        successRate: 0.15,
        avgMultiple: 2.0,
        deploymentPace: 'cautious',
      },
    },
  ],
};

async function seedTestData(options: SeedOptions = {}) {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/povc_dev';

  console.log('[INFO] Connecting to database...');
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  try {
    // Reset database if requested
    if (options.reset) {
      console.log('[INFO] Resetting test data...');

      // Delete in reverse dependency order to avoid FK constraint violations
      await db.delete(capitalActivities);     // Delete LP capital activities first
      await db.delete(lpFundCommitments);     // Delete LP commitments
      await db.delete(fundDistributions);     // Delete fund distributions
      await db.delete(investments);           // Delete investments
      await db.delete(portfolioCompanies);    // Delete companies
      await db.delete(limitedPartners);       // Delete LPs
      await db.delete(scenarios);             // Delete scenarios
      await db.delete(funds).where(eq(funds.name, TEST_DATA.fund.name));  // Delete test fund

      console.log('[SUCCESS] Test data reset complete');
    }

    // Create test fund
    console.log('\n[INFO] Creating test fund...');
    const [fund] = await db.insert(funds).values({
      name: TEST_DATA.fund.name,
      size: TEST_DATA.fund.size,
      vintageYear: TEST_DATA.fund.vintage,
      status: 'active',
      managementFee: (TEST_DATA.fund.managementFeeRate / 100).toString(),  // Convert percentage to decimal (2% -> 0.02)
      carryPercentage: (TEST_DATA.fund.carriedInterestRate / 100).toString(),  // Convert percentage to decimal (20% -> 0.20)
      createdAt: new Date(),
    } as any).returning();

    console.log(`[SUCCESS] Created fund: ${fund.name} (ID: ${fund.id})`);

    // Create portfolio companies
    console.log('\n[INFO] Creating portfolio companies...');
    const companies = await Promise.all(
      TEST_DATA.companies.map(async (companyData) => {
        const [company] = await db.insert(portfolioCompanies).values({
          fundId: fund.id,
          name: companyData.name,
          sector: companyData.sector,
          stage: companyData.stage as any,
          status: (companyData.status || 'active') as any,
          valuation: companyData.initialValuation.toString(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any).returning();

        console.log(`  - Created company: ${company.name} (${company.sector})`);

        // Create initial investment
        const [investment] = await db.insert(investments).values({
          fundId: fund.id,
          companyId: company.id,
          amount: companyData.initialInvestment.toString(),
          investmentDate: new Date('2023-01-15'),
          round: companyData.stage,
          valuation: companyData.initialValuation.toString(),
          ownership: (companyData.initialInvestment / companyData.initialValuation * 100).toFixed(2),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any).returning();

        console.log(`    - Initial investment: $${(companyData.initialInvestment / 1000000).toFixed(1)}M at $${(companyData.initialValuation / 1000000).toFixed(0)}M valuation`);

        // Add follow-on investment for Series A+ companies (not minimal mode)
        if (!options.minimal && companyData.stage !== 'Seed') {
          await db.insert(investments).values({
            fundId: fund.id,
            companyId: company.id,
            amount: (companyData.initialInvestment * 0.5).toString(),
            investmentDate: new Date('2023-06-15'),
            round: 'Follow-on',
            valuation: (companyData.initialValuation * 2).toString(),
            ownership: ((companyData.initialInvestment * 0.5) / (companyData.initialValuation * 2) * 100).toFixed(2),
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any);

          console.log(`    - Follow-on investment: $${(companyData.initialInvestment * 0.5 / 1000000).toFixed(1)}M`);
        }

        // Add exit data if company has exited
        if (companyData.status === 'exited' && companyData.exitValue) {
          const moic = companyData.exitValue / companyData.initialInvestment;
          console.log(`    - Exit: $${(companyData.exitValue / 1000000).toFixed(1)}M (${moic.toFixed(2)}x MOIC)`);
        }

        return company;
      })
    );

    console.log(`[SUCCESS] Created ${companies.length} portfolio companies`);

    // Create LP accounts (skip in minimal mode)
    if (!options.minimal) {
      console.log('\n[INFO] Creating LP accounts...');
      const lpAccounts = await Promise.all(
        TEST_DATA.lpAccounts.map(async (lpData) => {
          // Create LP entity (contact/identity information only)
          const [lp] = await db.insert(limitedPartners).values({
            name: lpData.name,
            email: lpData.email,
            entityType: 'institution', // Required field - 'individual', 'institution', or 'fund_of_funds'
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any).returning();

          console.log(`  - Created LP: ${lp.name}`);

          // Create fund commitment record (separate table)
          await db.insert(lpFundCommitments).values({
            lpId: lp.id,
            fundId: fund.id,
            commitmentAmountCents: BigInt(lpData.commitment * 100), // Convert dollars to cents
            commitmentDate: new Date('2023-01-01'),
            commitmentPercentage: ((lpData.commitment / parseInt(TEST_DATA.fund.size)) * 100).toFixed(4),
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any);

          console.log(`    - Commitment: $${(lpData.commitment / 1000000).toFixed(1)}M (${((lpData.commitment / parseInt(TEST_DATA.fund.size)) * 100).toFixed(2)}%)`);

          // Create capital call activity record
          if (lpData.capitalCalled > 0) {
            await db.insert(capitalActivities).values({
              lpId: lp.id,
              fundId: fund.id,
              activityType: 'capital_call',
              amountCents: BigInt(lpData.capitalCalled * 100), // Convert dollars to cents
              activityDate: new Date('2023-02-01'),
              createdAt: new Date(),
              updatedAt: new Date(),
            } as any);

            console.log(`    - Capital called: $${(lpData.capitalCalled / 1000000).toFixed(1)}M`);
          }

          // Create distribution activity record
          if (lpData.distributionsReceived > 0) {
            await db.insert(capitalActivities).values({
              lpId: lp.id,
              fundId: fund.id,
              activityType: 'distribution',
              amountCents: BigInt(lpData.distributionsReceived * 100), // Convert dollars to cents
              activityDate: new Date('2023-12-15'),
              distributionType: 'return_of_capital',
              createdAt: new Date(),
              updatedAt: new Date(),
            } as any);

            console.log(`    - Distributed: $${(lpData.distributionsReceived / 1000000).toFixed(2)}M`);
          }

          return lp;
        })
      );

      console.log(`[SUCCESS] Created ${lpAccounts.length} LP accounts with commitments and capital activity`);
    }

    // Create scenarios (skip in minimal mode)
    if (!options.minimal) {
      console.log('\n[INFO] Creating scenarios...');
      const scenarioRecords = await Promise.all(
        TEST_DATA.scenarios.map(async (scenarioData) => {
          const [scenario] = await db.insert(scenarios).values({
            fundId: fund.id,
            name: scenarioData.name,
            description: scenarioData.description,
            assumptions: scenarioData.assumptions,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any).returning();

          console.log(`  - Created scenario: ${scenario.name}`);
          return scenario;
        })
      );

      console.log(`[SUCCESS] Created ${scenarioRecords.length} scenarios`);
    }

    console.log('\n[SUCCESS] Test data seeding complete!');
    console.log('\nTest Data Summary:');
    console.log(`  - Fund: ${TEST_DATA.fund.name} ($${TEST_DATA.fund.size / 1000000}M)`);
    console.log(`  - Companies: ${TEST_DATA.companies.length}`);
    console.log(`  - Investments: ${TEST_DATA.companies.length + (options.minimal ? 0 : TEST_DATA.companies.filter(c => c.stage !== 'Seed').length)}`);
    if (!options.minimal) {
      console.log(`  - LP Accounts: ${TEST_DATA.lpAccounts.length}`);
      console.log(`  - Scenarios: ${TEST_DATA.scenarios.length}`);
    }

    console.log('\nNext Steps:');
    console.log('  1. Run npm run dev to start the development server');
    console.log('  2. Navigate to /funds to view the test fund');
    console.log('  3. Run npm test to execute the test suite');

  } catch (error) {
    console.error('[ERROR] Seeding failed:', error);
    throw error;
  } finally {
    await pool.end();
    console.log('\n[INFO] Database connection closed');
  }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const options: SeedOptions = {
  reset: args.includes('--reset'),
  minimal: args.includes('--minimal'),
};

// Run seeder
seedTestData(options).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
