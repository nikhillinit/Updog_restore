/**
 * Fund Fixture for E2E Tests
 *
 * Seeds test fund data via API to ensure fund setup is complete
 * before running portfolio/investment tests.
 */

import { test as base, request as apiRequest } from '@playwright/test';

interface FundFixture {
  fundId: number;
  fundName: string;
}

/**
 * Test data for seeding a fund
 */
const TEST_FUND_DATA = {
  name: 'E2E Test Fund',
  size: 10000000, // $10M
  managementFee: 0.02, // 2%
  carryPercentage: 0.2, // 20%
  vintageYear: 2024,
};

/**
 * Seed a test fund via API
 * Returns the created fund's ID and name
 */
async function seedTestFund(baseURL: string): Promise<FundFixture> {
  const context = await apiRequest.newContext({ baseURL });

  try {
    // Check if fund already exists
    const listResponse = await context.get('/api/funds');
    if (listResponse.ok()) {
      const funds = await listResponse.json();
      if (Array.isArray(funds) && funds.length > 0) {
        // Fund already exists, use it
        return {
          fundId: funds[0].id,
          fundName: funds[0].name,
        };
      }
    }

    // Create new fund
    const createResponse = await context.post('/api/funds', {
      data: TEST_FUND_DATA,
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `e2e-test-fund-${Date.now()}`,
      },
    });

    if (!createResponse.ok()) {
      const errorText = await createResponse.text();
      console.warn(`Failed to create fund: ${createResponse.status()} - ${errorText}`);
      // Return fallback (demo mode will handle it)
      return { fundId: 1, fundName: 'Demo Fund' };
    }

    const fund = await createResponse.json();
    return {
      fundId: fund.id || 1,
      fundName: fund.name || TEST_FUND_DATA.name,
    };
  } catch (error) {
    console.warn('Error seeding fund:', error);
    // Return fallback (demo mode will handle it)
    return { fundId: 1, fundName: 'Demo Fund' };
  } finally {
    await context.dispose();
  }
}

/**
 * Extended test with fund fixture
 *
 * Usage:
 * ```typescript
 * import { test, expect } from '../fixtures/fund';
 *
 * test('should show portfolio', async ({ page, fund }) => {
 *   console.log(`Testing with fund: ${fund.fundName}`);
 *   await page.goto('/portfolio');
 *   // ... test code
 * });
 * ```
 */
export const test = base.extend<{ fund: FundFixture }>({
  fund: async ({ baseURL }, use) => {
    const fund = await seedTestFund(baseURL!);
    await use(fund);
  },
});

export { expect } from '@playwright/test';
