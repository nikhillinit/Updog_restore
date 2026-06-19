import { expect, test, type Page, type TestInfo } from '@playwright/test';
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
  { path: '/fund-model-results/1/scenarios', name: 'fund-model-results-scenarios' },
  { path: '/performance', name: 'performance' },
  { path: '/variance-tracking', name: 'variance' },
  { path: '/reports', name: 'reports' },
  { path: '/shared/qa-share', name: 'shared-dashboard' },
  { path: '/settings', name: 'settings' },
  { path: '/help', name: 'help' },
];

const lpRoutes = [
  { path: '/lp/dashboard', name: 'lp-dashboard' },
  { path: '/lp/fund-detail/1', name: 'lp-fund-detail' },
  { path: '/lp/capital-account', name: 'lp-capital-account' },
  { path: '/lp/performance', name: 'lp-performance' },
  { path: '/lp/reports', name: 'lp-reports' },
  { path: '/lp/settings', name: 'lp-settings' },
];

const viewports = [
  { name: 'desktop', size: null },
  { name: 'mobile', size: { width: 390, height: 844 } },
] as const;

async function captureRouteScreenshot(
  page: Page,
  testInfo: TestInfo,
  path: string,
  name: string,
  viewportName: string
) {
  await installQaAuditApi(page);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const state = await captureMainPageState(page, path);
  expect(state.has404).toBe(false);
  expect(state.pageText.length).toBeGreaterThan(0);
  const screenshot = await page.screenshot({ fullPage: false });
  await testInfo.attach(`${name}-${viewportName}.png`, {
    body: screenshot,
    contentType: 'image/png',
  });
}

for (const { path, name } of routes) {
  for (const viewport of viewports) {
    test(`screenshot ${name} ${viewport.name}`, async ({ page }, testInfo) => {
      if (viewport.size) {
        await page.setViewportSize(viewport.size);
      }
      await captureRouteScreenshot(page, testInfo, path, name, viewport.name);
    });
  }
}

test.describe('LP route screenshots', () => {
  // SKIP: LP routes only mount when VITE_ENABLE_LP_REPORTING=true.
  test.skip(
    process.env.VITE_ENABLE_LP_REPORTING !== 'true',
    'LP routes only mount when VITE_ENABLE_LP_REPORTING=true'
  );

  for (const { path, name } of lpRoutes) {
    for (const viewport of viewports) {
      test(`screenshot ${name} ${viewport.name}`, async ({ page }, testInfo) => {
        if (viewport.size) {
          await page.setViewportSize(viewport.size);
        }
        await captureRouteScreenshot(page, testInfo, path, name, viewport.name);
      });
    }
  }
});
