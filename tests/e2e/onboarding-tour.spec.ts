/**
 * Onboarding Tour E2E Tests
 *
 * Tests the GP onboarding tour flow:
 * - 5-step guided tour
 * - Skip functionality
 * - Persistence (localStorage)
 * - Telemetry events
 */

import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'onboarding_seen_gp_v1';
const TELEMETRY_KEY = 'telemetry_buffer_v1';

test.describe('Onboarding Tour', () => {
  test.beforeEach(async ({ page }) => {
    // Clear tour state before each test
    await page.addInitScript(() => {
      localStorage.removeItem('onboarding_seen_gp_v1');
    });
  });

  test('completes 5-step tour successfully', async ({ page }) => {
    // Enable tour flag and navigate
    await page.addInitScript(() => {
      localStorage.setItem('FF_ONBOARDING_TOUR', 'true');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Tour should appear
    const tour = page.getByTestId('guided-tour');
    await expect(tour).toBeVisible({ timeout: 10000 });

    // Step 1: Welcome to Your Dashboard
    await expect(page.getByTestId('tour-step-title')).toContainText('Welcome to Your Dashboard');
    await expect(page.getByTestId('tour-step-counter')).toContainText('Step 1 of 5');

    // Navigate through all 5 steps
    for (let step = 1; step <= 4; step++) {
      await page.getByTestId('tour-next').click();
      await expect(page.getByTestId('tour-step-counter')).toContainText(`Step ${step + 1} of 5`);
    }

    // Final step should show "Get Started" button
    await expect(page.getByTestId('tour-next')).toContainText('Get Started');

    // Complete tour
    await page.getByTestId('tour-next').click();

    // Tour should be dismissed
    await expect(tour).not.toBeVisible();

    // Verify localStorage was set
    const hasSeenTour = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(hasSeenTour).toBe('true');
  });

  test('can skip tour at any point', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('FF_ONBOARDING_TOUR', 'true');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Tour should appear
    await expect(page.getByTestId('guided-tour')).toBeVisible({ timeout: 10000 });

    // Click skip button
    await page.getByTestId('tour-skip').click();

    // Tour should be dismissed
    await expect(page.getByTestId('guided-tour')).not.toBeVisible();

    // Verify localStorage was set (tour marked as seen)
    const hasSeenTour = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(hasSeenTour).toBe('true');
  });

  test('does not show tour if already completed', async ({ page }) => {
    // Mark tour as already seen
    await page.addInitScript(() => {
      localStorage.setItem('FF_ONBOARDING_TOUR', 'true');
      localStorage.setItem('onboarding_seen_gp_v1', 'true');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Tour should NOT appear
    await expect(page.getByTestId('guided-tour')).not.toBeVisible();
  });

  test('does not show tour when flag is disabled', async ({ page }) => {
    // Ensure flag is off
    await page.addInitScript(() => {
      localStorage.removeItem('FF_ONBOARDING_TOUR');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait a bit to ensure tour doesn't appear
    await page.waitForTimeout(2000);

    // Tour should NOT appear
    await expect(page.getByTestId('guided-tour')).not.toBeVisible();
  });

  test('tracks telemetry events', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('FF_ONBOARDING_TOUR', 'true');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for tour to appear
    await expect(page.getByTestId('guided-tour')).toBeVisible({ timeout: 10000 });

    // Navigate a couple steps
    await page.getByTestId('tour-next').click();
    await page.getByTestId('tour-next').click();

    // Check telemetry buffer
    const telemetryBuffer = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    }, TELEMETRY_KEY);

    // Should have tour_started and tour_step_viewed events
    const eventTypes = telemetryBuffer.map((e: { event: string }) => e.event);
    expect(eventTypes).toContain('tour_started');
    expect(eventTypes).toContain('tour_step_viewed');
  });

  test('progress indicators update correctly', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('FF_ONBOARDING_TOUR', 'true');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('guided-tour')).toBeVisible({ timeout: 10000 });

    // Check initial progress (step 0 active)
    const progress = page.getByTestId('tour-progress');
    await expect(progress).toBeVisible();

    // Step indicators should exist
    await expect(page.getByTestId('tour-step-indicator-0')).toBeVisible();
    await expect(page.getByTestId('tour-step-indicator-4')).toBeVisible();

    // Navigate and verify progress updates
    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour-step-counter')).toContainText('Step 2 of 5');
  });
});
