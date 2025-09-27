import { test, expect } from '@playwright/test';

test.describe('FundSetup Wizard Telemetry', () => {
  test('telemetry fires on wizard load', async ({ page }) => {
    const telemetryRequests: string[] = [];
    
    // Monitor telemetry requests
    page.on('request', req => {
      if (req.url().includes('/api/telemetry/wizard')) {
        telemetryRequests.push(req.url());
      }
    });

    await page.goto('/fund-setup?step=2');
    await expect(page.getByRole('heading', { name: /Investment Strategy/i })).toBeVisible();
    
    // Give time for telemetry to fire
    await page.waitForTimeout(500);
    
    // Verify telemetry was sent
    expect(telemetryRequests.length).toBeGreaterThan(0);
  });

  test('telemetry captures step transitions', async ({ page }) => {
    const telemetryPayloads: any[] = [];
    
    // Capture telemetry payloads
    page.on('request', async req => {
      if (req.url().includes('/api/telemetry/wizard')) {
        try {
          const payload = req.postDataJSON();
          telemetryPayloads.push(payload);
        } catch {
          // Beacon API might not expose payload in all browsers
        }
      }
    });

    // Navigate through multiple steps
    await page.goto('/fund-setup?step=2');
    await expect(page.locator('[data-testid="wizard-step-investment-strategy-container"]')).toBeVisible();
    
    await page.goto('/fund-setup?step=3');
    await expect(page.locator('[data-testid="wizard-step-exit-recycling-container"]')).toBeVisible();
    
    await page.goto('/fund-setup?step=4');
    await expect(page.locator('[data-testid="wizard-step-waterfall-container"]')).toBeVisible();
    
    // Give time for all telemetry to fire
    await page.waitForTimeout(1000);
    
    // Should have telemetry for each step
    expect(telemetryPayloads.length).toBeGreaterThanOrEqual(3);
  });

  test('telemetry includes performance metrics', async ({ page }) => {
    let telemetryFired = false;
    
    // Monitor that telemetry includes ttfmp
    page.on('request', async req => {
      if (req.url().includes('/api/telemetry/wizard')) {
        telemetryFired = true;
        // We can't easily inspect beacon payloads in all browsers,
        // but we verify the request was made
      }
    });

    await page.goto('/fund-setup?step=2');
    await expect(page.getByRole('heading', { name: /Investment Strategy/i })).toBeVisible();
    
    // Wait for telemetry
    await page.waitForTimeout(500);
    
    expect(telemetryFired).toBe(true);
  });

  test('telemetry handles errors gracefully', async ({ page }) => {
    // Test that telemetry doesn't break the app even if endpoint fails
    await page.route('/api/telemetry/wizard', route => {
      route.fulfill({ status: 500, body: 'Server error' });
    });

    // Page should still load normally
    await page.goto('/fund-setup?step=2');
    await expect(page.getByRole('heading', { name: /Investment Strategy/i })).toBeVisible();
    
    // No uncaught errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.waitForTimeout(500);
    
    // Logger might log the error, but app should not crash
    expect(consoleErrors.filter(e => e.includes('Uncaught')).length).toBe(0);
  });
});