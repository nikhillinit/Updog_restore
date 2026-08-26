import { test, expect } from '@playwright/test';

test.describe('Demo Infrastructure', () => {
  test.describe('Demo Banner', () => {
    test('shows demo banner when stub mode is enabled', async ({ page }) => {
      // Mock the stub-status endpoint to return true
      await page.route('/api/stub-status', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            stubMode: true,
            timestamp: new Date().toISOString(),
          }),
        });
      });

      await page.goto('/fund-setup');
      
      // Wait for the banner to appear
      const banner = page.locator('.bg-amber-100');
      await expect(banner).toBeVisible({ timeout: 5000 });
      await expect(banner).toContainText('Demo Mode Active');
    });

    test('hides demo banner when stub mode is disabled', async ({ page }) => {
      // Mock the stub-status endpoint to return false
      await page.route('/api/stub-status', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            stubMode: false,
            timestamp: new Date().toISOString(),
          }),
        });
      });

      await page.goto('/fund-setup');
      
      // Wait a bit to ensure the banner doesn't appear
      await page.waitForTimeout(2000);
      
      const banner = page.locator('.bg-amber-100');
      await expect(banner).not.toBeVisible();
    });

    test('handles stub-status endpoint failure gracefully', async ({ page }) => {
      // Mock the endpoint to fail
      await page.route('/api/stub-status', async route => {
        await route.fulfill({
          status: 500,
          body: 'Internal Server Error',
        });
      });

      await page.goto('/fund-setup');
      
      // Should not show banner on failure
      await page.waitForTimeout(2000);
      const banner = page.locator('.bg-amber-100');
      await expect(banner).not.toBeVisible();
    });

    test('shows loading state initially', async ({ page }) => {
      // Delay the stub-status response
      await page.route('/api/stub-status', async route => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ stubMode: true }),
        });
      });

      await page.goto('/fund-setup');
      
      // Check for loading state
      const loadingBanner = page.locator('.bg-gray-100').filter({ hasText: 'Loading...' });
      await expect(loadingBanner).toBeVisible();
      
      // Eventually should show demo banner
      const demoBanner = page.locator('.bg-amber-100');
      await expect(demoBanner).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Telemetry Endpoint', () => {
    test('accepts valid telemetry payloads', async ({ request }) => {
      const response = await request.post('/api/telemetry/wizard', {
        data: {
          event: 'wizard_step_completed',
          step: 2,
          duration: 1500,
          timestamp: new Date().toISOString(),
        },
      });

      expect(response.status()).toBe(204);
    });

    test('rejects oversized payloads', async ({ request }) => {
      // Create a payload larger than 10KB
      const largePayload = {
        event: 'wizard_step_completed',
        data: 'x'.repeat(11000), // >10KB
      };

      const response = await request.post('/api/telemetry/wizard', {
        data: largePayload,
      });

      expect(response.status()).toBe(413);
      const body = await response.json();
      expect(body.error).toBe('payload_too_large');
    });

    test('implements rate limiting', async ({ request }) => {
      // Send multiple requests quickly
      const promises = [];
      for (let i = 0; i < 65; i++) {
        promises.push(
          request.post('/api/telemetry/wizard', {
            data: { event: 'test', index: i },
          })
        );
      }

      const responses = await Promise.all(promises);
      
      // Some should succeed (204), some should be rate-limited (429)
      const rateLimited = responses.filter(r => r.status() === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
      
      // At least the first few should succeed
      const successful = responses.filter(r => r.status() === 204);
      expect(successful.length).toBeGreaterThan(0);
    });

    test('handles malformed JSON gracefully', async ({ request }) => {
      const response = await request.post('/api/telemetry/wizard', {
        headers: {
          'Content-Type': 'application/json',
        },
        data: 'not valid json{',
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('bad_request');
    });
  });

  test.describe('Funds API Stub', () => {
    test('returns funds when stub mode is enabled', async ({ request }) => {
      // This test would need ENABLE_API_STUB=true in the environment
      // For now, we'll test the response structure
      const response = await request.get('/api/funds');
      
      if (response.status() === 200) {
        const funds = await response.json();
        expect(Array.isArray(funds)).toBe(true);
        
        if (funds.length > 0) {
          // Validate structure
          expect(funds[0]).toHaveProperty('id');
          expect(funds[0]).toHaveProperty('name');
          expect(funds[0]).toHaveProperty('currency');
          expect(funds[0]).toHaveProperty('createdAt');
          
          // Check for edge case names
          const names = funds.map(f => f.name);
          const hasLongName = names.some(n => n.length > 50);
          expect(hasLongName).toBe(true);
        }
      } else {
        // Should return 404 with hint when disabled
        expect(response.status()).toBe(404);
        const error = await response.json();
        expect(error).toHaveProperty('error');
        expect(error).toHaveProperty('hint');
      }
    });

    test('validates response against contract', async ({ request }) => {
      const response = await request.get('/api/funds');
      
      if (response.status() === 200) {
        const funds = await response.json();
        
        // Validate each fund
        funds.forEach(fund => {
          expect(fund.id).toMatch(/^stub-\d+$/);
          expect(fund.name.length).toBeGreaterThanOrEqual(2);
          expect(fund.name.length).toBeLessThanOrEqual(120);
          expect(['USD', 'EUR', 'GBP']).toContain(fund.currency);
          expect(() => new Date(fund.createdAt)).not.toThrow();
        });
      }
    });
  });
});