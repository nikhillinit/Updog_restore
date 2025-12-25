/**
 * LP Data Privacy & Isolation E2E Tests
 *
 * CRITICAL SECURITY TESTS for Limited Partner data privacy.
 * These tests verify that different LP accounts cannot access each other's data.
 *
 * Test Coverage:
 * - Authentication boundaries between LP accounts
 * - Capital account data isolation
 * - Distribution history privacy
 * - Performance metrics access control
 * - Report generation privacy
 * - Direct URL access prevention
 * - API endpoint authorization
 *
 * Data Requirements:
 * - Run `npm run db:seed:test` before executing these tests
 * - Creates 3 LP accounts: lp1@test.com, lp2@test.com, lp3@test.com
 */

import { test, expect } from '@playwright/test';

// Test data from db:seed:test script
const LP_ACCOUNTS = {
  lp1: {
    email: 'lp1@test.com',
    password: 'test-password-lp1', // TODO: Update with actual test password
    name: 'Institutional LP 1',
    commitment: '$10M',
  },
  lp2: {
    email: 'lp2@test.com',
    password: 'test-password-lp2',
    name: 'Institutional LP 2',
    commitment: '$20M',
  },
  lp3: {
    email: 'lp3@test.com',
    password: 'test-password-lp3',
    name: 'Family Office LP',
    commitment: '$5M',
  },
};

test.describe('LP Data Privacy & Isolation', () => {
  test.describe.configure({ mode: 'serial' }); // Run tests sequentially for clean state

  // ============================================================================
  // AUTHENTICATION BOUNDARY TESTS
  // ============================================================================

  test.describe('Authentication Boundaries', () => {
    test('LP1 cannot access LP2 capital account', async ({ page }) => {
      // Login as LP1
      await page.goto('/lp/login');
      await page.fill('[name=email]', LP_ACCOUNTS.lp1.email);
      await page.fill('[name=password]', LP_ACCOUNTS.lp1.password);
      await page.click('button[type=submit]');

      // Wait for redirect to LP1 dashboard
      await page.waitForURL(/\/lp\/dashboard/);

      // Verify LP1 name visible
      await expect(page.getByText(LP_ACCOUNTS.lp1.name)).toBeVisible();

      // Attempt to navigate to LP2 capital account (should be denied or redirected)
      // Assuming LP IDs are sequential: 1, 2, 3
      await page.goto('/lp/capital-account/2'); // LP2's account

      // Should either:
      // 1. Show access denied message
      // 2. Redirect to LP1's own capital account
      // 3. Show 403 error page
      const isAccessDenied =
        (await page.getByText(/access denied|forbidden|unauthorized/i).isVisible()) ||
        page.url().includes('/capital-account/1') || // Redirected to own account
        page.url().includes('/403'); // Forbidden page

      expect(isAccessDenied).toBeTruthy();

      // Verify LP2 name NOT visible
      await expect(page.getByText(LP_ACCOUNTS.lp2.name)).not.toBeVisible();
    });

    test('LP2 cannot access LP3 distribution history', async ({ page }) => {
      // Login as LP2
      await page.goto('/lp/login');
      await page.fill('[name=email]', LP_ACCOUNTS.lp2.email);
      await page.fill('[name=password]', LP_ACCOUNTS.lp2.password);
      await page.click('button[type=submit]');

      await page.waitForURL(/\/lp\/dashboard/);

      // Attempt to access LP3's distribution history
      await page.goto('/lp/distributions/3'); // LP3's distributions

      // Should deny access
      const isAccessDenied =
        (await page.getByText(/access denied|forbidden|unauthorized/i).isVisible()) ||
        page.url().includes('/distributions/2') || // Redirected to own
        page.url().includes('/403');

      expect(isAccessDenied).toBeTruthy();

      // Verify LP3 specific data NOT visible (Family Office commitment $5M)
      const hasLP3Data = await page.getByText('$5M').isVisible();
      expect(hasLP3Data).toBeFalsy();
    });

    test('unauthenticated user cannot access any LP data', async ({ page }) => {
      // Clear any existing sessions
      await page.context().clearCookies();

      // Attempt to access LP dashboard without login
      await page.goto('/lp/dashboard');

      // Should redirect to login
      await page.waitForURL(/\/lp\/login|\/login/);

      expect(page.url()).toMatch(/\/lp\/login|\/login/);
    });
  });

  // ============================================================================
  // CAPITAL ACCOUNT DATA ISOLATION
  // ============================================================================

  test.describe('Capital Account Data Isolation', () => {
    test('LP1 only sees their own capital calls and distributions', async ({ page }) => {
      // Login as LP1
      await page.goto('/lp/login');
      await page.fill('[name=email]', LP_ACCOUNTS.lp1.email);
      await page.fill('[name=password]', LP_ACCOUNTS.lp1.password);
      await page.click('button[type=submit]');

      await page.waitForURL(/\/lp\/dashboard/);

      // Navigate to capital account
      await page.click('a[href*="/lp/capital-account"]');

      // Verify LP1 commitment visible ($10M)
      await expect(page.getByText('$10M')).toBeVisible();

      // Verify LP2 commitment NOT visible ($20M)
      const hasLP2Commitment = await page.getByText('$20M').isVisible();
      expect(hasLP2Commitment).toBeFalsy();

      // Verify LP3 commitment NOT visible ($5M)
      const hasLP3Commitment = await page.getByText('$5M').isVisible();
      expect(hasLP3Commitment).toBeFalsy();

      // Verify only LP1 name appears
      await expect(page.getByText(LP_ACCOUNTS.lp1.name)).toBeVisible();
      await expect(page.getByText(LP_ACCOUNTS.lp2.name)).not.toBeVisible();
      await expect(page.getByText(LP_ACCOUNTS.lp3.name)).not.toBeVisible();
    });

    test('LP2 capital account shows different data than LP1', async ({ page, context }) => {
      // Login as LP2
      await page.goto('/lp/login');
      await page.fill('[name=email]', LP_ACCOUNTS.lp2.email);
      await page.fill('[name=password]', LP_ACCOUNTS.lp2.password);
      await page.click('button[type=submit]');

      await page.waitForURL(/\/lp\/dashboard/);
      await page.click('a[href*="/lp/capital-account"]');

      // Verify LP2 commitment visible ($20M)
      await expect(page.getByText('$20M')).toBeVisible();

      // Verify LP1 commitment NOT visible ($10M)
      const hasLP1Commitment = await page.getByText('$10M').isVisible();
      expect(hasLP1Commitment).toBeFalsy();

      // Verify LP2 name visible, LP1 name not visible
      await expect(page.getByText(LP_ACCOUNTS.lp2.name)).toBeVisible();
      await expect(page.getByText(LP_ACCOUNTS.lp1.name)).not.toBeVisible();
    });
  });

  // ============================================================================
  // API ENDPOINT AUTHORIZATION
  // ============================================================================

  test.describe('API Endpoint Authorization', () => {
    test('API call to other LP data returns 403', async ({ page, request }) => {
      // Login as LP1 to get auth token
      await page.goto('/lp/login');
      await page.fill('[name=email]', LP_ACCOUNTS.lp1.email);
      await page.fill('[name=password]', LP_ACCOUNTS.lp1.password);
      await page.click('button[type=submit]');

      await page.waitForURL(/\/lp\/dashboard/);

      // Get cookies for API request (auth token)
      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

      // Attempt to fetch LP2 summary via API (assuming LP ID 2)
      const response = await request.get('/api/lp/summary/2', {
        headers: {
          Cookie: cookieHeader,
        },
      });

      // Should return 403 Forbidden or 404 Not Found
      expect([403, 404]).toContain(response.status());
    });

    test('API call to own LP data returns 200', async ({ page, request }) => {
      // Login as LP1
      await page.goto('/lp/login');
      await page.fill('[name=email]', LP_ACCOUNTS.lp1.email);
      await page.fill('[name=password]', LP_ACCOUNTS.lp1.password);
      await page.click('button[type=submit]');

      await page.waitForURL(/\/lp\/dashboard/);

      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

      // Fetch LP1 summary via API (assuming LP ID 1)
      const response = await request.get('/api/lp/summary/1', {
        headers: {
          Cookie: cookieHeader,
        },
      });

      // Should return 200 OK
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify returned data matches LP1
      expect(data.data.lpName).toBe(LP_ACCOUNTS.lp1.name);
    });

    test('unauthenticated API call to LP data returns 401', async ({ request }) => {
      // Attempt to fetch LP data without authentication
      const response = await request.get('/api/lp/summary/1');

      // Should return 401 Unauthorized
      expect(response.status()).toBe(401);
    });
  });

  // ============================================================================
  // PERFORMANCE METRICS ISOLATION
  // ============================================================================

  test.describe('Performance Metrics Isolation', () => {
    test('LP1 performance page shows only their metrics', async ({ page }) => {
      // Login as LP1
      await page.goto('/lp/login');
      await page.fill('[name=email]', LP_ACCOUNTS.lp1.email);
      await page.fill('[name=password]', LP_ACCOUNTS.lp1.password);
      await page.click('button[type=submit]');

      await page.waitForURL(/\/lp\/dashboard/);

      // Navigate to performance page
      await page.click('a[href*="/lp/performance"]');

      // Wait for performance data to load
      await page.waitForSelector('[data-testid="performance-metrics"]', { timeout: 5000 });

      // Verify page shows LP1 name
      await expect(page.getByText(LP_ACCOUNTS.lp1.name)).toBeVisible();

      // Verify other LP names NOT visible
      await expect(page.getByText(LP_ACCOUNTS.lp2.name)).not.toBeVisible();
      await expect(page.getByText(LP_ACCOUNTS.lp3.name)).not.toBeVisible();
    });
  });

  // ============================================================================
  // REPORT GENERATION PRIVACY
  // ============================================================================

  test.describe('Report Generation Privacy', () => {
    test('generated reports only include LP1 data', async ({ page }) => {
      // Login as LP1
      await page.goto('/lp/login');
      await page.fill('[name=email]', LP_ACCOUNTS.lp1.email);
      await page.fill('[name=password]', LP_ACCOUNTS.lp1.password);
      await page.click('button[type=submit]');

      await page.waitForURL(/\/lp\/dashboard/);

      // Navigate to reports page
      await page.click('a[href*="/lp/reports"]');

      // Generate a quarterly report
      await page.click('button[data-testid="generate-report"]');

      // Wait for report generation
      await page.waitForSelector('[data-testid="report-preview"]', { timeout: 10000 });

      // Verify report contains LP1 name
      const reportContent = await page.textContent('[data-testid="report-preview"]');
      expect(reportContent).toContain(LP_ACCOUNTS.lp1.name);

      // Verify report does NOT contain other LP names
      expect(reportContent).not.toContain(LP_ACCOUNTS.lp2.name);
      expect(reportContent).not.toContain(LP_ACCOUNTS.lp3.name);
    });

    test('LP2 cannot access LP1 generated reports', async ({ page }) => {
      // Login as LP2
      await page.goto('/lp/login');
      await page.fill('[name=email]', LP_ACCOUNTS.lp2.email);
      await page.fill('[name=password]', LP_ACCOUNTS.lp2.password);
      await page.click('button[type=submit]');

      await page.waitForURL(/\/lp\/dashboard/);

      // Attempt to access LP1's report (assuming report ID 1)
      await page.goto('/api/lp/reports/download/1');

      // Should deny access (403) or return 404
      const statusText = await page.textContent('body');
      const isAccessDenied =
        statusText?.includes('403') ||
        statusText?.includes('Forbidden') ||
        statusText?.includes('404') ||
        statusText?.includes('Not Found');

      expect(isAccessDenied).toBeTruthy();
    });
  });

  // ============================================================================
  // SESSION ISOLATION
  // ============================================================================

  test.describe('Session Isolation', () => {
    test('logging out as LP1 and logging in as LP2 shows different data', async ({ page }) => {
      // Login as LP1
      await page.goto('/lp/login');
      await page.fill('[name=email]', LP_ACCOUNTS.lp1.email);
      await page.fill('[name=password]', LP_ACCOUNTS.lp1.password);
      await page.click('button[type=submit]');

      await page.waitForURL(/\/lp\/dashboard/);

      // Verify LP1 data visible
      await expect(page.getByText(LP_ACCOUNTS.lp1.name)).toBeVisible();

      // Logout
      await page.click('[data-testid="logout-button"]');
      await page.waitForURL(/\/lp\/login|\/login/);

      // Login as LP2
      await page.fill('[name=email]', LP_ACCOUNTS.lp2.email);
      await page.fill('[name=password]', LP_ACCOUNTS.lp2.password);
      await page.click('button[type=submit]');

      await page.waitForURL(/\/lp\/dashboard/);

      // Verify LP2 data visible, LP1 data not visible
      await expect(page.getByText(LP_ACCOUNTS.lp2.name)).toBeVisible();
      await expect(page.getByText(LP_ACCOUNTS.lp1.name)).not.toBeVisible();
    });
  });

  // ============================================================================
  // DIRECT URL ACCESS PREVENTION
  // ============================================================================

  test.describe('Direct URL Access Prevention', () => {
    test('cannot access other LP fund detail page', async ({ page }) => {
      // Login as LP1
      await page.goto('/lp/login');
      await page.fill('[name=email]', LP_ACCOUNTS.lp1.email);
      await page.fill('[name=password]', LP_ACCOUNTS.lp1.password);
      await page.click('button[type=submit]');

      await page.waitForURL(/\/lp\/dashboard/);

      // Attempt to access LP2's fund detail page (if LP-specific)
      // This assumes fund detail pages are LP-scoped: /lp/fund-detail/:lpId
      await page.goto('/lp/fund-detail/2');

      // Should deny access or redirect
      const isAccessDenied =
        (await page.getByText(/access denied|forbidden|unauthorized/i).isVisible()) ||
        page.url().includes('/fund-detail/1') ||
        page.url().includes('/403');

      expect(isAccessDenied).toBeTruthy();
    });

    test('cannot manipulate URL parameters to view other LP data', async ({ page }) => {
      // Login as LP3
      await page.goto('/lp/login');
      await page.fill('[name=email]', LP_ACCOUNTS.lp3.email);
      await page.fill('[name=password]', LP_ACCOUNTS.lp3.password);
      await page.click('button[type=submit]');

      await page.waitForURL(/\/lp\/dashboard/);

      // Attempt to access capital account with query param manipulation
      await page.goto('/lp/capital-account?lpId=1'); // Try to view LP1's data

      // Should still show LP3's data or deny access
      const hasLP3Data = await page.getByText(LP_ACCOUNTS.lp3.name).isVisible();
      const hasLP1Data = await page.getByText(LP_ACCOUNTS.lp1.name).isVisible();

      // Should either show LP3 data (ignoring param) OR show access denied
      expect(hasLP3Data || (await page.getByText(/access denied/i).isVisible())).toBeTruthy();
      expect(hasLP1Data).toBeFalsy();
    });
  });
});
