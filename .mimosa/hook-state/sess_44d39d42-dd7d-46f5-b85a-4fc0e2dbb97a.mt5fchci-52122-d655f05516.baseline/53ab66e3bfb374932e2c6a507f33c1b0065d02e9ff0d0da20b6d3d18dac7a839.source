/**
 * Fixture Template
 *
 * Use this template when creating new test fixture files.
 * Follow these guidelines for consistency:
 *
 * 1. DEPENDENCIES: List all fixture files this depends on
 * 2. PURPOSE: Clearly state what tests use this fixture
 * 3. CLEANUP: Document any cleanup requirements (usually none with transaction rollback)
 * 4. VERSIONING: Tag with schema version if tied to database schema
 */

/**
 * DEPENDENCIES:
 * - None (or list other fixture files)
 *
 * PURPOSE:
 * - Describe what feature/tests this fixture supports
 *
 * SCHEMA VERSION:
 * - v1.0 (update when schema changes)
 *
 * CLEANUP:
 * - Transaction rollback (automatic)
 * - OR: Manual cleanup if using testcontainers
 */

// Import types from shared schema
import type {} from /* Add types here */ '@shared/schema';

/**
 * Example: Fund Setup Fixture
 *
 * Provides test data for fund creation and management tests.
 */
export const exampleFund = {
  id: 1,
  name: 'Test Fund Alpha',
  fundSize: 100000000, // $100M
  vintage: 2024,
  strategy: 'Seed & Series A',
  managementFee: 0.02, // 2%
  carriedInterest: 0.2, // 20%
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
} as const;

/**
 * Example: Multiple Scenarios
 *
 * Provide variations for different test cases.
 */
export const scenarios = {
  baseline: {
    // Default scenario
    fund: exampleFund,
    companies: [
      /* company data */
    ],
  },

  aggressive: {
    // High-risk scenario
    fund: { ...exampleFund, name: 'Aggressive Fund', carriedInterest: 0.25 },
    companies: [
      /* aggressive company data */
    ],
  },

  conservative: {
    // Low-risk scenario
    fund: { ...exampleFund, name: 'Conservative Fund', carriedInterest: 0.15 },
    companies: [
      /* conservative company data */
    ],
  },
} as const;

/**
 * Example: Dynamic Fixture Generator
 *
 * Use for tests requiring customized data.
 */
export function createTestFund(overrides: Partial<typeof exampleFund>) {
  return {
    ...exampleFund,
    ...overrides,
    // Ensure timestamps are fresh
    updated_at: new Date().toISOString(),
  };
}

/**
 * Example: Fixture with Dependencies
 *
 * Reference other fixtures to build complex test scenarios.
 */
export function createFundWithCompanies(fundOverrides = {}, companyCount = 5) {
  const fund = createTestFund(fundOverrides);

  const companies = Array.from({ length: companyCount }, (_, i) => ({
    id: i + 1,
    fundId: fund.id,
    name: `Company ${String.fromCharCode(65 + i)}`, // A, B, C...
    sector: 'Technology',
    stage: 'Series A',
    valuation: 10000000 * (i + 1),
    investmentAmount: 1000000 * (i + 1),
    ownership: 0.1,
    investmentDate: '2024-06-01T00:00:00Z',
    status: 'active' as const,
  }));

  return { fund, companies };
}

/**
 * USAGE EXAMPLES:
 *
 * 1. Simple import:
 *    import { exampleFund } from './path/to/fixture';
 *    test('fund creation', () => {
 *      const result = createFund(exampleFund);
 *      expect(result.id).toBe(1);
 *    });
 *
 * 2. Scenario testing:
 *    import { scenarios } from './path/to/fixture';
 *    test.each(Object.entries(scenarios))('scenario %s', (name, data) => {
 *      // Test with different scenarios
 *    });
 *
 * 3. Custom data:
 *    import { createTestFund } from './path/to/fixture';
 *    test('custom fund', () => {
 *      const fund = createTestFund({ fundSize: 200000000 });
 *      expect(fund.fundSize).toBe(200000000);
 *    });
 *
 * 4. Complex setup:
 *    import { createFundWithCompanies } from './path/to/fixture';
 *    test('fund with portfolio', () => {
 *      const { fund, companies } = createFundWithCompanies({}, 10);
 *      expect(companies).toHaveLength(10);
 *    });
 */

/**
 * BEST PRACTICES:
 *
 * 1. Use `as const` for read-only fixtures to prevent accidental mutations
 * 2. Provide factory functions for dynamic data generation
 * 3. Use meaningful IDs (1, 2, 3) not random UUIDs for easier debugging
 * 4. Document dependencies clearly at top of file
 * 5. Keep fixtures focused on one feature/domain
 * 6. Provide usage examples in comments
 * 7. Use TypeScript types from shared schema for type safety
 * 8. Avoid magic numbers - use named constants
 */

/**
 * CLEANUP STRATEGY:
 *
 * Transaction Rollback (Recommended for 70% of tests):
 * - Wrap test in `withTransaction()` helper (Phase 4)
 * - Automatic cleanup - no manual cleanup needed
 * - Fast (~200ms per test)
 *
 * Testcontainers (Required for 30% of tests):
 * - Use for multi-connection tests, RLS, time-series
 * - Manual cleanup via container.stop()
 * - Slower (~2-5s per suite) but full isolation
 */

export default {
  exampleFund,
  scenarios,
  createTestFund,
  createFundWithCompanies,
};
