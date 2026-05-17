import { expect, test } from '@playwright/test';
import {
  captureMainPageState,
  expectNoUnexpectedApiRequests,
  installQaAuditApi,
} from './fixtures/qa-audit-api';

test.afterEach(async ({ page }) => {
  await expectNoUnexpectedApiRequests(page);
});

const routes = [
  { path: '/dashboard', name: 'dashboard' },
  { path: '/portfolio', name: 'portfolio' },
  { path: '/pipeline', name: 'pipeline' },
  { path: '/fund-setup', name: 'fund-setup' },
  { path: '/sensitivity-analysis', name: 'sensitivity' },
  { path: '/forecasting', name: 'forecasting' },
  { path: '/model-results', name: 'model-results' },
  { path: '/financial-modeling', name: 'financial-modeling' },
  { path: '/fund-model-results/1', name: 'fund-model-results' },
  { path: '/performance', name: 'performance' },
  { path: '/allocation-manager', name: 'allocation' },
  { path: '/cash-management', name: 'cash' },
  { path: '/portfolio-analytics', name: 'portfolio-analytics' },
  { path: '/cap-tables', name: 'cap-tables' },
  { path: '/variance-tracking', name: 'variance' },
  { path: '/reports', name: 'reports' },
  { path: '/reserves-demo', name: 'reserves' },
  { path: '/settings', name: 'settings' },
  { path: '/help', name: 'help' },
];

for (const { path, name } of routes) {
  test(`screenshot ${name}`, async ({ page }, testInfo) => {
    await installQaAuditApi(page);
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const state = await captureMainPageState(page, path);
    expect(state.has404).toBe(false);
    expect(state.pageText.length).toBeGreaterThan(0);
    const screenshot = await page.screenshot({ fullPage: false });
    await testInfo.attach(`${name}.png`, { body: screenshot, contentType: 'image/png' });
  });
}
