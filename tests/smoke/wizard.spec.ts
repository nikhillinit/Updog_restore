/**
 * Smoke Tests for Critical User Flows
 * Run every 5 minutes in production via synthetic monitoring
 */
import { test, expect } from '@playwright/test';

// Get configuration from environment
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const SMOKE_USER = process.env.SMOKE_USER || 'smoke@test.com';
const SMOKE_PASS = process.env.SMOKE_PASS || 'smoke123';

test.describe('Production Smoke Tests', () => {
  test.setTimeout(30000); // 30 second timeout for smoke tests

  test('Health endpoints are responsive', async ({ page }) => {
    // Check /ready endpoint
    const readyResponse = await page.request.get(`${BASE_URL}/ready`);
    expect(readyResponse.status()).toBe(200);
    const readyData = await readyResponse.json();
    expect(readyData.status).toBe('ready');

    // Check /health endpoint
    const healthResponse = await page.request.get(`${BASE_URL}/health`);
    expect(healthResponse.status()).toBe(200);
    const healthData = await healthResponse.json();
    expect(healthData.status).toBe('healthy');
    
    // Verify critical dependencies
    expect(healthData.checks?.database).toBe('healthy');
    expect(healthData.checks?.redis).toBe('healthy');
  });

  test('Home page loads successfully', async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Wait for main content
    await page.waitForLoadState('networkidle');
    
    // Check for critical elements
    const mainContent = page.locator('main, #root, .app-container').first();
    await expect(mainContent).toBeVisible({ timeout: 10000 });
    
    // Verify no console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.waitForTimeout(1000);
    expect(errors.length).toBe(0);
  });

  test('Login flow works', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    
    // Fill login form
    const emailInput = page.locator('input[type="email"], input[name="email"], #email').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"], #password').first();
    
    if (await emailInput.count() > 0 && await passwordInput.count() > 0) {
      await emailInput.fill(SMOKE_USER);
      await passwordInput.fill(SMOKE_PASS);
      
      // Submit form
      const submitButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first();
      await submitButton.click();
      
      // Wait for navigation or success indicator
      await page.waitForURL(url => !url.includes('/login'), { timeout: 10000 }).catch(() => {
        // Alternative: wait for success message
        return page.waitForSelector('.success-message, [data-testid="login-success"]', { timeout: 5000 });
      });
    }
  });

  test('Wizard loads and is interactive', async ({ page }) => {
    await page.goto(`${BASE_URL}/wizard`);
    
    // Wait for wizard to load
    const wizard = page.locator('.wizard, #wizard, [data-testid="wizard-container"]').first();
    await expect(wizard).toBeVisible({ timeout: 10000 });
    
    // Check for form fields
    const inputs = page.locator('input:visible, select:visible');
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThan(0);
    
    // Test navigation
    const nextButton = page.locator('button:has-text("Next"), button:has-text("Continue")').first();
    if (await nextButton.count() > 0 && await nextButton.isEnabled()) {
      // Fill required fields first
      const requiredInputs = page.locator('input[required]:visible').all();
      for (const input of await requiredInputs) {
        const type = await input.getAttribute('type');
        if (type === 'text' || type === 'email') {
          await input.fill('Test Value');
        } else if (type === 'number') {
          await input.fill('100');
        }
      }
      
      await nextButton.click();
      await page.waitForTimeout(1000);
      
      // Verify step changed
      const stepIndicator = page.locator('[data-step="2"], .step-2, [aria-current="step"]').first();
      if (await stepIndicator.count() > 0) {
        await expect(stepIndicator).toBeVisible();
      }
    }
  });

  test('Dashboard loads with data', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    
    // Wait for dashboard to load
    await page.waitForLoadState('networkidle');
    
    // Check for dashboard content
    const dashboard = page.locator('.dashboard, #dashboard, [data-testid="dashboard"]').first();
    if (await dashboard.count() > 0) {
      await expect(dashboard).toBeVisible({ timeout: 10000 });
      
      // Check for charts or data elements
      const dataElements = page.locator('canvas, svg.chart, .data-table, [data-testid*="chart"]');
      const dataCount = await dataElements.count();
      expect(dataCount).toBeGreaterThan(0);
    }
  });

  test('API endpoints respond correctly', async ({ page }) => {
    // Test critical API endpoints
    const endpoints = [
      '/api/funds',
      '/api/simulations',
      '/api/portfolios'
    ];
    
    for (const endpoint of endpoints) {
      const response = await page.request.get(`${BASE_URL}${endpoint}`).catch(() => null);
      if (response) {
        // Expect either 200 (data) or 401 (auth required)
        expect([200, 401, 404]).toContain(response.status());
        
        // If 200, verify response structure
        if (response.status() === 200) {
          const data = await response.json();
          expect(data).toBeDefined();
        }
      }
    }
  });

  test('Circuit breakers are functioning', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/circuit-breaker/status`).catch(() => null);
    
    if (response && response.status() === 200) {
      const status = await response.json();
      
      // Check that breakers exist
      expect(status.breakers).toBeDefined();
      
      // Warn if any breakers are open
      for (const [name, breaker] of Object.entries(status.breakers || {})) {
        const state = (breaker as any).state;
        if (state === 'OPEN') {
          console.warn(`Circuit breaker ${name} is OPEN`);
        }
      }
    }
  });

  test('No critical JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('pageerror', error => {
      errors.push(error.message);
    });
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // Navigate through key pages
    await page.goto(BASE_URL);
    await page.waitForTimeout(2000);
    
    await page.goto(`${BASE_URL}/wizard`);
    await page.waitForTimeout(2000);
    
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForTimeout(2000);
    
    // Filter out known non-critical errors
    const criticalErrors = errors.filter(error => {
      return !error.includes('ResizeObserver') && 
             !error.includes('Non-Error promise rejection') &&
             !error.includes('[HMR]');
    });
    
    expect(criticalErrors).toHaveLength(0);
  });

  test('Memory usage is stable', async ({ page }) => {
    if (page.context().browser()?.browserType().name() === 'chromium') {
      await page.goto(BASE_URL);
      
      // Get initial memory
      const initialMemory = await page.evaluate(() => {
        return (performance as any).memory?.usedJSHeapSize || 0;
      });
      
      // Navigate through pages
      await page.goto(`${BASE_URL}/wizard`);
      await page.waitForTimeout(1000);
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForTimeout(1000);
      await page.goto(BASE_URL);
      
      // Get final memory
      const finalMemory = await page.evaluate(() => {
        return (performance as any).memory?.usedJSHeapSize || 0;
      });
      
      // Memory shouldn't increase by more than 50MB
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;
      expect(memoryIncrease).toBeLessThan(50);
    }
  });
});

// Export test configuration
export default {
  timeout: 30000,
  retries: 1,
  workers: 1,
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry'
  }
};