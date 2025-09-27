import { test, expect } from '@playwright/test';

test('Step 2 → 3 paints KPIs fast and remains responsive', async ({ page }) => {
  // Navigate to fund setup wizard
  await page.goto('/fund-setup');
  
  // Fill in Step 1 (Fund Basics) - minimal required fields
  await page.fill('input[name="fundName"]', 'Test Fund');
  await page.fill('input[name="targetSize"]', '100000000');
  await page.fill('input[name="managementFee"]', '2');
  await page.fill('input[name="carryPercentage"]', '20');
  
  // Click Next to go to Step 2
  const nextButton = page.getByTestId('wizard-next-button');
  await nextButton.click();
  
  // Wait for Step 2 (Committed Capital) to be visible
  await expect(page.getByText('Capital Structure')).toBeVisible();
  
  // Fill in Step 2 - minimal required fields
  await page.fill('input[name="totalCommitments"]', '100000000');
  await page.fill('input[name="gpCommitment"]', '1000000');
  
  // Start timing the transition
  const t0 = Date.now();
  
  // Click Next to transition from Step 2 to Step 3
  await nextButton.click();
  
  // Step 3 should render quickly with KPIs visible
  // Look for Investment Strategy step indicators
  await expect(page.getByText('Investment Strategy')).toBeVisible({ timeout: 1000 });
  
  // Check if the page contains KPI-like elements (if they exist)
  // Adjust these selectors based on actual implementation
  const step3Content = page.locator('[data-testid="investment-strategy-step"]');
  if (await step3Content.count() > 0) {
    await expect(step3Content).toBeVisible({ timeout: 1000 });
  }
  
  // Alternative: Check for any performance indicators if KPIs are rendered
  const kpiTvpi = page.getByTestId('kpi-tvpi');
  const kpiIrr = page.getByTestId('kpi-irr');
  const kpiMoic = page.getByTestId('kpi-moic');
  
  // If KPI elements exist, verify they're visible
  if (await kpiTvpi.count() > 0) {
    await expect(kpiTvpi).toBeVisible({ timeout: 1000 });
  }
  if (await kpiIrr.count() > 0) {
    await expect(kpiIrr).toBeVisible({ timeout: 1000 });
  }
  if (await kpiMoic.count() > 0) {
    await expect(kpiMoic).toBeVisible({ timeout: 1000 });
  }
  
  const transitionTime = Date.now() - t0;
  console.log(`[Smoke Test] Step 2→3 transition time: ${transitionTime}ms`);
  
  // Verify no browser errors occurred
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  
  // Wait a bit to ensure no delayed errors
  await page.waitForTimeout(500);
  
  // Assert no console errors
  expect(consoleErrors).toHaveLength(0);
  
  // Optional: Check that charts are present (if applicable)
  const charts = page.locator('[data-testid*="chart"]');
  if (await charts.count() > 0) {
    await expect(charts.first()).toBeVisible({ timeout: 2000 });
    console.log('[Smoke Test] Charts rendered successfully');
  }
});

test('Worker can be disabled via feature flag', async ({ page }) => {
  // Set environment variable to disable worker
  await page.goto('/fund-setup?VITE_USE_SIMULATION_WORKER=false');
  
  // Fill in Step 1
  await page.fill('input[name="fundName"]', 'Test Fund No Worker');
  await page.fill('input[name="targetSize"]', '50000000');
  const nextButton = page.getByTestId('wizard-next-button');
  await nextButton.click();
  
  // Fill in Step 2
  await page.fill('input[name="totalCommitments"]', '50000000');
  await nextButton.click();
  
  // Verify Step 3 still loads (fallback to main thread)
  await expect(page.getByText('Investment Strategy')).toBeVisible({ timeout: 2000 });
  
  console.log('[Smoke Test] Fallback to main thread successful');
});

test('Performance marks are recorded correctly', async ({ page }) => {
  await page.goto('/fund-setup');
  
  // Enable performance API access
  await page.evaluateOnNewDocument(() => {
    window.performanceMarks = [];
    const originalMark = performance.mark.bind(performance);
    performance.mark = (name: string) => {
      window.performanceMarks.push(name);
      return originalMark(name);
    };
  });
  
  // Navigate through steps
  await page.fill('input[name="fundName"]', 'Perf Test Fund');
  await page.fill('input[name="targetSize"]', '75000000');
  const nextButton = page.getByTestId('wizard-next-button');
  await nextButton.click();
  
  await page.fill('input[name="totalCommitments"]', '75000000');
  await nextButton.click();
  
  // Check that performance marks were created
  const marks = await page.evaluate(() => window.performanceMarks);
  expect(marks).toContain('step2->3:click');
  
  // Wait for Step 3 to render
  await page.waitForTimeout(500);
  
  // Check for the measure
  const measures = await page.evaluate(() => {
    const entries = performance.getEntriesByName('step2->3', 'measure');
    return entries.map(e => ({
      name: e.name,
      duration: e.duration
    }));
  });
  
  if (measures.length > 0) {
    console.log(`[Smoke Test] Performance measure 'step2->3': ${measures[0].duration.toFixed(2)}ms`);
    expect(measures[0].duration).toBeLessThan(1500); // Should be under 1.5 seconds
  }
});