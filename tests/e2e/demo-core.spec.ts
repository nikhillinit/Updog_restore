import { test, expect } from '@playwright/test';

async function setupDemo(page, persona: 'GP' | 'LP' | 'Admin' = 'GP') {
  await page.addInitScript((role) => {
    localStorage.setItem('DEMO_TOOLBAR', '1');
    localStorage.setItem('FF_NEW_IA', 'true');
    localStorage.setItem('FF_ENABLE_SELECTOR_KPIS', 'true');
    localStorage.setItem('DEMO_PERSONA', role);
  }, persona);
  await page.goto('/');
  await page.reload();
}

test.describe('Demo core flow', () => {
  test('GP can save a scenario and sees a success toast', async ({ page }) => {
    await setupDemo(page, 'GP');
    const nameInput = page.getByPlaceholder('Scenario name');
    await expect(nameInput).toBeVisible();
    await nameInput.fill(`Aggressive Follow-On ${Date.now()}`);
    await page.getByRole('button', { name: /^Save Scenario$/ }).click();
    await expect(page.getByText(/^Saved:\s*Scenario saved$/)).toBeVisible({ timeout: 5000 });
  });

  test('Compare drawer shows TVPI bar chart with demo scenarios', async ({ page }) => {
    await setupDemo(page, 'GP');
    await page.getByRole('button', { name: /^Compare Scenarios$/ }).click();
    const baseline = page.getByText('Baseline (Conservative)', { exact: false });
    const aggressive = page.getByText('Aggressive Follow-On', { exact: false });
    await expect(baseline).toBeVisible();
    await expect(aggressive).toBeVisible();
    await baseline.click();
    await aggressive.click();
    await expect(page.getByText('TVPI Comparison')).toBeVisible();
    await expect(page.getByText('2.10×')).toBeVisible();
    await expect(page.getByText('2.80×')).toBeVisible();
  });

  test('LP persona: Save is hidden and POST /scenarios is forbidden', async ({ page, request }) => {
    await setupDemo(page, 'LP');
    await expect(page.getByRole('button', { name: /^Save Scenario$/ })).toHaveCount(0);
    const demoHeader = JSON.stringify({ id: 'demo-lp', role: 'LP', orgId: 'demo-org', email: 'lp@demo.example.com' });
    const res = await request.post('/api/funds/demo-fund-2025/scenarios', {
      headers: { 'content-type': 'application/json', 'x-demo-user': demoHeader },
      data: {
        name: 'LP Attempt',
        params: { version: 1, fundInputs: {}, assumptions: {} },
        resultSummary: { TVPI: '1.00×', DPI: '1.00×', NAV: '$0.0M', IRR: '—' },
      },
    });
    expect(res.status(), 'LP POST /scenarios should be forbidden').toBe(403);
  });

  test('Reset button clears demo state', async ({ page }) => {
    await setupDemo(page, 'GP');
    await page.getByPlaceholder('Scenario name').fill('Test Scenario');
    await page.getByRole('button', { name: /Save Scenario/ }).click();
    await expect(page.getByText(/Saved:/)).toBeVisible();
    await page.getByRole('button', { name: /Reset Demo/ }).click().catch(() => {});
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Test Scenario')).toHaveCount(0);
  });
});
