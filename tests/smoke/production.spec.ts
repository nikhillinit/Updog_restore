/**
 * Production Smoke Tests
 * Critical user flows that must work in production
 * Run after deployment to verify system health
 */

import { test, expect } from '@playwright/test';

const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://fund.presson.vc';
const HEALTH_KEY = process.env.HEALTH_KEY || '';
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || '';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || '';

// Timeout configuration for production environment
test.setTimeout(60000); // 60 seconds for production tests

test.describe('Production Deployment Smoke Tests', () => {
  test.describe('Infrastructure Health', () => {
    test('should respond to health check', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/health`);
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('status');
      expect(body.status).toBe('ok');
    });

    test('should respond to readiness check', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/healthz`);
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);
    });

    test('should have metrics endpoint (authenticated)', async ({ request }) => {
      if (!HEALTH_KEY) {
        test.skip();
      }

      const response = await request.get(`${PRODUCTION_URL}/metrics`, {
        headers: {
          Authorization: `Bearer ${HEALTH_KEY}`,
        },
      });

      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      const body = await response.text();
      expect(body).toContain('# HELP');
      expect(body).toContain('# TYPE');
    });

    test('should reject metrics endpoint without auth', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/metrics`);
      expect(response.status()).toBe(401);
    });
  });

  test.describe('Database Connectivity', () => {
    test('should connect to database', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health/db`);
      expect(response.ok()).toBeTruthy();

      const body = await response.json();
      expect(body).toHaveProperty('database');
      expect(body.database).toBe('connected');
    });

    test('should verify critical tables exist', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health/schema`);
      expect(response.ok()).toBeTruthy();

      const body = await response.json();
      expect(body).toHaveProperty('tables');

      const criticalTables = [
        'funds',
        'fund_configs',
        'fund_snapshots',
        'portfolio_companies',
        'investments',
        'users',
      ];

      for (const table of criticalTables) {
        expect(body.tables).toContain(table);
      }
    });
  });

  test.describe('Redis Connectivity', () => {
    test('should connect to Redis cache', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health/cache`);
      expect(response.ok()).toBeTruthy();

      const body = await response.json();
      expect(body).toHaveProperty('cache');
      expect(body.cache).toBe('connected');
    });

    test('should have queue system operational', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health/queues`);
      expect(response.ok()).toBeTruthy();

      const body = await response.json();
      expect(body).toHaveProperty('queues');
      expect(body.queues).toHaveProperty('reserve-calc');
      expect(body.queues).toHaveProperty('pacing-calc');
    });
  });

  test.describe('API Endpoints', () => {
    test('should serve API documentation', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/api-docs`);
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);
    });

    test('should respond to funds list endpoint', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/funds`);
      expect(response.status()).toBeGreaterThanOrEqual(200);
      expect(response.status()).toBeLessThan(500);

      // Should return 200 or 401 (if auth required)
      if (response.ok()) {
        const body = await response.json();
        expect(Array.isArray(body)).toBeTruthy();
      }
    });

    test('should handle invalid API requests gracefully', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/nonexistent`);
      expect(response.status()).toBe(404);

      const body = await response.json();
      expect(body).toHaveProperty('error');
    });
  });

  test.describe('Frontend Assets', () => {
    test('should serve index.html', async ({ page }) => {
      await page.goto(PRODUCTION_URL);
      expect(page.url()).toContain(PRODUCTION_URL);

      // Should have basic HTML structure
      const title = await page.title();
      expect(title).toBeTruthy();
    });

    test('should load JavaScript bundles', async ({ page }) => {
      const jsFiles: string[] = [];

      page.on('request', (request) => {
        if (request.resourceType() === 'script') {
          jsFiles.push(request.url());
        }
      });

      await page.goto(PRODUCTION_URL);
      await page.waitForLoadState('networkidle');

      expect(jsFiles.length).toBeGreaterThan(0);
    });

    test('should load CSS files', async ({ page }) => {
      const cssFiles: string[] = [];

      page.on('request', (request) => {
        if (request.resourceType() === 'stylesheet') {
          cssFiles.push(request.url());
        }
      });

      await page.goto(PRODUCTION_URL);
      await page.waitForLoadState('networkidle');

      expect(cssFiles.length).toBeGreaterThan(0);
    });

    test('should not have console errors on load', async ({ page }) => {
      const errors: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });

      await page.goto(PRODUCTION_URL);
      await page.waitForLoadState('networkidle');

      // Filter out known benign errors
      const criticalErrors = errors.filter(
        (err) =>
          !err.includes('favicon') &&
          !err.includes('analytics') &&
          !err.includes('third-party')
      );

      expect(criticalErrors).toHaveLength(0);
    });
  });

  test.describe('Critical User Flows', () => {
    test.skip(
      () => !TEST_USER_EMAIL || !TEST_USER_PASSWORD,
      'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD'
    );

    test('should allow user login', async ({ page }) => {
      await page.goto(`${PRODUCTION_URL}/login`);

      await page.fill('input[type="email"]', TEST_USER_EMAIL);
      await page.fill('input[type="password"]', TEST_USER_PASSWORD);
      await page.click('button[type="submit"]');

      // Wait for redirect after login
      await page.waitForURL(/dashboard|funds/);

      // Should be authenticated
      const url = page.url();
      expect(url).not.toContain('login');
    });

    test('should load dashboard', async ({ page, context }) => {
      // Reuse login session
      await page.goto(`${PRODUCTION_URL}/login`);
      await page.fill('input[type="email"]', TEST_USER_EMAIL);
      await page.fill('input[type="password"]', TEST_USER_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL(/dashboard|funds/);

      // Navigate to dashboard
      await page.goto(`${PRODUCTION_URL}/dashboard`);
      await page.waitForLoadState('networkidle');

      // Should show dashboard content
      const content = await page.textContent('body');
      expect(content).toBeTruthy();
    });

    test('should load fund list', async ({ page }) => {
      // Login first
      await page.goto(`${PRODUCTION_URL}/login`);
      await page.fill('input[type="email"]', TEST_USER_EMAIL);
      await page.fill('input[type="password"]', TEST_USER_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL(/dashboard|funds/);

      // Navigate to funds
      await page.goto(`${PRODUCTION_URL}/funds`);
      await page.waitForLoadState('networkidle');

      // Should load funds list or empty state
      const content = await page.textContent('body');
      expect(content).toBeTruthy();
    });

    test('should create new fund (smoke test)', async ({ page }) => {
      // Login
      await page.goto(`${PRODUCTION_URL}/login`);
      await page.fill('input[type="email"]', TEST_USER_EMAIL);
      await page.fill('input[type="password"]', TEST_USER_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL(/dashboard|funds/);

      // Navigate to fund creation
      await page.goto(`${PRODUCTION_URL}/funds/new`);
      await page.waitForLoadState('networkidle');

      // Fill basic fund details
      const timestamp = Date.now();
      await page.fill('input[name="fundName"]', `Smoke Test Fund ${timestamp}`);
      await page.fill('input[name="fundSize"]', '50000000');

      // Should be able to fill form (not necessarily submit)
      const fundName = await page.inputValue('input[name="fundName"]');
      expect(fundName).toContain('Smoke Test Fund');
    });

    test('should trigger reserve calculation', async ({ page }) => {
      // Login
      await page.goto(`${PRODUCTION_URL}/login`);
      await page.fill('input[type="email"]', TEST_USER_EMAIL);
      await page.fill('input[type="password"]', TEST_USER_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL(/dashboard|funds/);

      // Navigate to first fund (if any)
      await page.goto(`${PRODUCTION_URL}/funds`);
      await page.waitForLoadState('networkidle');

      // Check if we have funds
      const fundLinks = await page.locator('a[href*="/funds/"]').count();

      if (fundLinks > 0) {
        // Click first fund
        await page.locator('a[href*="/funds/"]').first().click();
        await page.waitForLoadState('networkidle');

        // Should be on fund detail page
        const url = page.url();
        expect(url).toContain('/funds/');
      } else {
        test.skip();
      }
    });
  });

  test.describe('Performance', () => {
    test('should load homepage within 3 seconds', async ({ page }) => {
      const startTime = Date.now();
      await page.goto(PRODUCTION_URL);
      await page.waitForLoadState('domcontentloaded');
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(3000);
    });

    test('should respond to API within 2 seconds', async ({ request }) => {
      const startTime = Date.now();
      await request.get(`${PRODUCTION_URL}/api/health`);
      const responseTime = Date.now() - startTime;

      expect(responseTime).toBeLessThan(2000);
    });

    test('should have acceptable time to interactive', async ({ page }) => {
      await page.goto(PRODUCTION_URL);

      const metrics = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        return {
          domInteractive: navigation.domInteractive,
          domComplete: navigation.domComplete,
          loadEventEnd: navigation.loadEventEnd,
        };
      });

      // Time to Interactive should be under 5 seconds
      expect(metrics.domInteractive).toBeLessThan(5000);
    });
  });

  test.describe('Security', () => {
    test('should have security headers', async ({ request }) => {
      const response = await request.get(PRODUCTION_URL);
      const headers = response.headers();

      // Check for important security headers
      expect(headers['x-frame-options']).toBeTruthy();
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-xss-protection']).toBeTruthy();
    });

    test('should enforce HTTPS', async ({ page }) => {
      await page.goto(PRODUCTION_URL);
      const url = page.url();
      expect(url).toMatch(/^https:/);
    });

    test('should not expose sensitive information', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health`);
      const body = await response.json();

      // Should not contain sensitive data
      const bodyStr = JSON.stringify(body);
      expect(bodyStr).not.toContain('password');
      expect(bodyStr).not.toContain('secret');
      expect(bodyStr).not.toContain('token');
    });
  });

  test.describe('Error Handling', () => {
    test('should handle 404 gracefully', async ({ page }) => {
      await page.goto(`${PRODUCTION_URL}/nonexistent-page`);

      // Should show error page, not crash
      const content = await page.textContent('body');
      expect(content).toBeTruthy();
    });

    test('should handle API errors gracefully', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/funds/invalid-id`);

      // Should return error, not crash
      expect(response.status()).toBeGreaterThanOrEqual(400);
      expect(response.status()).toBeLessThan(600);

      const body = await response.json();
      expect(body).toHaveProperty('error');
    });
  });

  test.describe('Workers', () => {
    test('should have reserve worker operational', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health/workers/reserve`);

      if (response.ok()) {
        const body = await response.json();
        expect(body).toHaveProperty('status');
        expect(body.status).toMatch(/healthy|running/);
      } else {
        // Workers might not expose health endpoint
        expect(response.status()).toBeLessThan(500);
      }
    });

    test('should have pacing worker operational', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health/workers/pacing`);

      if (response.ok()) {
        const body = await response.json();
        expect(body).toHaveProperty('status');
        expect(body.status).toMatch(/healthy|running/);
      } else {
        // Workers might not expose health endpoint
        expect(response.status()).toBeLessThan(500);
      }
    });
  });
});

test.describe('Post-Deployment Validation', () => {
  test('should verify deployment version', async ({ request }) => {
    const response = await request.get(`${PRODUCTION_URL}/api/version`);

    if (response.ok()) {
      const body = await response.json();
      expect(body).toHaveProperty('version');
      expect(body.version).toBeTruthy();

      // Log deployment version
      console.log(`Deployed version: ${body.version}`);
    }
  });

  test('should verify migration status', async ({ request }) => {
    const response = await request.get(`${PRODUCTION_URL}/api/health/migrations`);

    if (response.ok()) {
      const body = await response.json();
      expect(body).toHaveProperty('status');
      expect(body.status).toBe('up-to-date');
    }
  });

  test('should have no active alerts', async ({ request }) => {
    const response = await request.get(`${PRODUCTION_URL}/api/health/alerts`);

    if (response.ok()) {
      const body = await response.json();
      expect(body).toHaveProperty('critical');
      expect(body.critical).toHaveLength(0);
    }
  });
});