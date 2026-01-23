/**
 * Telemetry System E2E Tests
 *
 * Tests the client-side telemetry ring buffer:
 * - Event tracking
 * - Ring buffer limits
 * - Event allowlist validation
 * - Event structure
 */

import { test, expect } from '@playwright/test';

const TELEMETRY_KEY = 'telemetry_buffer_v1';
const MAX_BUFFER_SIZE = 500;

test.describe('Telemetry System', () => {
  test.beforeEach(async ({ page }) => {
    // Clear telemetry buffer
    await page.addInitScript(() => {
      localStorage.removeItem('telemetry_buffer_v1');
    });

    // Enable feature flags
    await page.addInitScript(() => {
      localStorage.setItem('FF_NEW_IA', 'true');
      localStorage.setItem('FF_ONBOARDING_TOUR', 'true');
    });
  });

  test('tracks navigation events', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Navigate to different pages
    const navLinks = page.getByRole('link');
    const portfolioLink = navLinks.filter({ hasText: /portfolio/i }).first();

    if (await portfolioLink.isVisible()) {
      await portfolioLink.click();
      await page.waitForLoadState('networkidle');
    }

    // Check telemetry buffer for nav events
    const buffer = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    }, TELEMETRY_KEY);

    // Should have some events tracked
    expect(buffer.length).toBeGreaterThan(0);
  });

  test('events have correct structure', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Trigger some events
    await page.waitForTimeout(1000);

    const buffer = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    }, TELEMETRY_KEY);

    if (buffer.length > 0) {
      const event = buffer[0];

      // Verify event structure
      expect(event).toHaveProperty('event');
      expect(event).toHaveProperty('timestamp');
      expect(event).toHaveProperty('properties');

      // Event name should be a string
      expect(typeof event.event).toBe('string');

      // Timestamp should be ISO format
      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // Properties should be an object
      expect(typeof event.properties).toBe('object');
    }
  });

  test('respects ring buffer limit of 500', async ({ page }) => {
    // Pre-populate buffer with 500 events
    await page.addInitScript((maxSize) => {
      const events = [];
      for (let i = 0; i < maxSize; i++) {
        events.push({
          event: 'test_event',
          timestamp: new Date().toISOString(),
          properties: { index: i },
        });
      }
      localStorage.setItem('telemetry_buffer_v1', JSON.stringify(events));
    }, MAX_BUFFER_SIZE);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Trigger some new events by navigating
    await page.click('body'); // Simple interaction

    // Wait for potential events
    await page.waitForTimeout(500);

    const buffer = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    }, TELEMETRY_KEY);

    // Buffer should not exceed max size
    expect(buffer.length).toBeLessThanOrEqual(MAX_BUFFER_SIZE);
  });

  test('tracks tour events when tour is active', async ({ page }) => {
    // Clear tour completion state
    await page.addInitScript(() => {
      localStorage.removeItem('onboarding_seen_gp_v1');
      localStorage.setItem('FF_ONBOARDING_TOUR', 'true');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for tour to appear
    const tour = page.getByTestId('guided-tour');
    if (await tour.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Navigate through tour
      await page.getByTestId('tour-next').click();
    }

    const buffer = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    }, TELEMETRY_KEY);

    // Look for tour-related events
    const tourEvents = buffer.filter((e: { event: string }) =>
      e.event.startsWith('tour_')
    );

    if (await tour.isVisible({ timeout: 1000 }).catch(() => false)) {
      expect(tourEvents.length).toBeGreaterThan(0);
    }
  });

  test('tracks collapsible section toggle events', async ({ page }) => {
    await page.goto('/allocation-manager');
    await page.waitForLoadState('networkidle');

    const trigger = page.locator('[data-testid^="collapsible-trigger-"]').first();

    if (await trigger.isVisible()) {
      // Toggle section
      await trigger.click();
      await page.waitForTimeout(200);
      await trigger.click();

      const buffer = await page.evaluate((key) => {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
      }, TELEMETRY_KEY);

      // Look for toggle events
      const toggleEvents = buffer.filter((e: { event: string }) =>
        e.event === 'advanced_section_toggled'
      );

      expect(toggleEvents.length).toBeGreaterThan(0);
    }
  });

  test('only tracks allowed event types', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Interact with the page
    await page.waitForTimeout(1000);

    const buffer = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    }, TELEMETRY_KEY);

    // Allowed event types from telemetry.ts
    const allowedEvents = [
      'tour_started',
      'tour_step_viewed',
      'tour_completed',
      'nav_clicked',
      'portfolio_tab_changed',
      'empty_state_cta_clicked',
      'advanced_section_toggled',
      'fund_create_started',
      'fund_create_completed',
      'api_error',
    ];

    // All events should be in allowed list
    for (const event of buffer) {
      const eventType = (event as { event: string }).event;
      expect(allowedEvents).toContain(eventType);
    }
  });

  test('persists events across page reloads', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Get initial buffer
    const initialBuffer = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    }, TELEMETRY_KEY);

    const initialCount = initialBuffer.length;

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Buffer should persist
    const afterReloadBuffer = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    }, TELEMETRY_KEY);

    // Should have at least as many events (might have more from reload)
    expect(afterReloadBuffer.length).toBeGreaterThanOrEqual(initialCount);
  });
});
