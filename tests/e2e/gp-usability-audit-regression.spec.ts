import { expect, test } from '@playwright/test';
import {
  captureMainPageState,
  expectNoUnexpectedApiRequests,
  installQaAuditApi,
  readMainText,
} from './fixtures/qa-audit-api';

/**
 * GP Usability Audit Regression Test
 * Based on: "GP Usability Audit Updog Fund Manag.md"
 * Validates fixes for routing, data consistency, and feature availability.
 */

test.afterEach(async ({ page }) => {
  await expectNoUnexpectedApiRequests(page);
});

test.describe('GP Usability Audit - Broken Routes Regression', () => {
  const formerlyBrokenRoutes = [
    { path: '/forecasting', mustContain: /financial modeling|forecasting|scenario modeling/i },
    { path: '/model-results', mustContain: /model results|select a fund/i },
    { path: '/allocation-manager', mustContain: /allocation|capital allocation/i },
    { path: '/cash-management', mustContain: /cash|liquidity/i },
    { path: '/portfolio-analytics', mustContain: /analytics|portfolio analysis/i },
    { path: '/cap-tables', mustContain: /cap table|capitalization|ownership/i },
  ];

  for (const { path, mustContain } of formerlyBrokenRoutes) {
    test(`${path} should load and not 404`, async ({ page }) => {
      await installQaAuditApi(page);
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      const state = await captureMainPageState(page, path);
      expect(state.has404).toBe(false);
      expect(state.pageText).toMatch(mustContain);
    });
  }
});

test.describe('GP Usability Audit - Route Component Accuracy', () => {
  const routeMatrix = [
    { path: '/portfolio', mustContain: /portfolio|companies/i, mustNotContain: /pipeline|deals/i },
    {
      path: '/fund-model-results/1',
      mustContain: /fund model|results|lifecycle|reserve|deployment/i,
      mustNotContain: /variance tracking/i,
    },
    {
      path: '/settings',
      mustContain: /settings|profile|preferences|account/i,
      mustNotContain: /help.*support|documentation|faq/i,
    },
    {
      path: '/performance',
      mustContain: /performance|time series|metrics/i,
      mustNotContain: /allocation manager|capital allocation/i,
    },
    {
      path: '/financial-modeling',
      mustContain: /financial|modeling|forecasting/i,
      mustNotContain: /cap table|capitalization/i,
    },
    {
      path: '/help',
      mustContain: /help|support|documentation/i,
      mustNotContain: /settings|profile.*preferences/i,
    },
    { path: '/pipeline', mustContain: /pipeline|deals/i },
    { path: '/variance-tracking', mustContain: /variance|tracking|baseline/i },
  ];

  for (const { path, mustContain, mustNotContain } of routeMatrix) {
    test(`${path} renders correct page`, async ({ page }) => {
      await installQaAuditApi(page);
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      const state = await captureMainPageState(page, path);
      expect(state.has404).toBe(false);
      expect(state.pageText).toMatch(mustContain);
      if (mustNotContain) {
        expect(state.pageText).not.toMatch(mustNotContain);
      }
    });
  }
});

test.describe('GP Usability Audit - Sidebar Navigation', () => {
  test('Performance is discoverable in sidebar and navigates correctly', async ({ page }) => {
    await installQaAuditApi(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('aside')).toBeVisible();
    const perfLink = page.getByRole('link', { name: /performance/i });
    await expect(perfLink).toBeVisible();
    await perfLink.click();
    await expect(page).toHaveURL(/\/performance\b/);
    const state = await captureMainPageState(page, '/performance');
    expect(state.pageText).toMatch(/performance|fund performance|metrics/i);
    expect(state.pageText).not.toMatch(/allocation manager/i);
  });

  test('Forecasting is discoverable in sidebar and navigates correctly', async ({ page }) => {
    await installQaAuditApi(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('aside')).toBeVisible();
    const forecastLink = page.getByRole('link', { name: /forecasting/i });
    await expect(forecastLink).toBeVisible();
    await forecastLink.click();
    await expect(page).toHaveURL(/\/forecasting/i);
    const state = await captureMainPageState(page, '/forecasting');
    expect(state.pageText).toMatch(/financial|modeling|forecasting/i);
  });

  test('Settings navigates to Settings, not Help', async ({ page }) => {
    await installQaAuditApi(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    const settingsLink = page.locator('aside a[href="/settings"]').first();
    await expect(settingsLink).toBeVisible();
    await settingsLink.click();
    await expect(page).toHaveURL(/\/settings\b/);
    const state = await captureMainPageState(page, '/settings');
    expect(state.pageText).toMatch(/settings|profile|preferences/i);
    expect(state.pageText).not.toMatch(/help.*support|documentation/i);
  });
});

test.describe('GP Usability Audit - Data Consistency', () => {
  test('Top KPI bar shows non-zero values when portfolio data exists', async ({ page }) => {
    await installQaAuditApi(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const pageText = await readMainText(page);

    // Should not show all metrics as $0 / 0.00x / 0 when portfolio has $46.1M value
    // Relaxed assertion: at least one of Current Value, TVPI, or Active should be non-zero
    const hasSomePortfolioData =
      /\$[1-9][\d,.]+[MBK]?/.test(pageText) && // has a non-zero dollar amount
      (!pageText.includes('$0') || /46\.1|12\.5|15\.6|16\.7/.test(pageText)); // has real portfolio numbers

    expect(hasSomePortfolioData).toBe(true);
  });

  test('Companies vs Target does not show contradictory On Track when severely behind', async ({
    page,
  }) => {
    await installQaAuditApi(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const pageText = await readMainText(page);

    const hasBehindPlan = /behind plan/i.test(pageText);
    const hasOnTrack = /on track/i.test(pageText);

    if (hasBehindPlan && hasOnTrack) {
      // Check if both appear in proximity to company count context
      const cards = await page.locator('[class*="card"]').all();
      for (const card of cards) {
        const cardText = (await card.textContent()) ?? '';
        const cardHasCompanies = /companies|company count/i.test(cardText);
        const cardHasBehind = /behind plan/i.test(cardText);
        const cardHasOnTrack = /on track/i.test(cardText);
        if (cardHasCompanies && cardHasBehind && cardHasOnTrack) {
          const match =
            cardText.match(/(\d+)\s*\/\s*(\d+)/) ||
            cardText.match(/(\d+)\s*actual.*?(\d+)\s*target/);
          if (match) {
            const actual = parseInt(match[1], 10);
            const target = parseInt(match[2], 10);
            if (actual / target < 0.5) {
              expect(cardHasOnTrack).toBe(false);
            }
          }
        }
      }
    }
  });
});

test.describe('GP Usability Audit - Reserve Planning', () => {
  test('Reserve Planning tab does not throw JSON parse error', async ({ page }) => {
    await installQaAuditApi(page);
    await page.goto('/portfolio?tab=reserve-planning', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const state = await captureMainPageState(page, '/portfolio?tab=reserve-planning');
    expect(state.has404).toBe(false);
    expect(state.pageText).not.toContain('Unexpected token');
    expect(state.pageText).not.toContain('is not valid JSON');
  });
});

test.describe('GP Usability Audit - Fund Context Detection', () => {
  test('Forecasting recognizes active fund context', async ({ page }) => {
    await installQaAuditApi(page);
    await page.goto('/forecasting?fundId=1', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const pageText = await readMainText(page);
    expect(pageText).not.toContain(
      'Forecasting stays unavailable until an active fund context exists'
    );
    expect(pageText).not.toContain('no active fund');
    expect(pageText).toMatch(/financial|modeling|forecasting|scenario/i);
  });

  test('Financial Modeling recognizes active fund context', async ({ page }) => {
    await installQaAuditApi(page);
    await page.goto('/financial-modeling?fundId=1', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const pageText = await readMainText(page);
    expect(pageText).not.toContain(
      'Forecasting stays unavailable until an active fund context exists'
    );
    expect(pageText).not.toContain('no active fund');
  });
});

test.describe('GP Usability Audit - Cap Tables Loading', () => {
  test('Cap Tables does not infinite-load', async ({ page }) => {
    await installQaAuditApi(page);
    await page.goto('/cap-tables', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const state = await captureMainPageState(page, '/cap-tables');
    expect(state.has404).toBe(false);
    // After 3 seconds, should not still be showing only a loading spinner
    // We accept either loaded content or an empty-state message
    expect(state.pageText).toMatch(/cap table|ownership|shareholder|no data|empty/i);
  });
});

test.describe('GP Usability Audit - Core Workspaces', () => {
  const coreWorkspaces = [
    { path: '/dashboard', mustContain: /dashboard|overview|metrics/i },
    { path: '/fund-setup', mustContain: /fund setup|fund basics|construction|wizard/i },
    { path: '/sensitivity-analysis', mustContain: /sensitivity|monte carlo|backtest/i },
    { path: '/reports', mustContain: /reports|tear sheets|fund reporting/i },
    { path: '/reserves-demo', mustContain: /reserves|reserve allocation|graduation/i },
    { path: '/variance-tracking', mustContain: /variance|tracking|baseline/i },
    { path: '/pipeline', mustContain: /pipeline|deals/i },
    { path: '/help', mustContain: /help|support|documentation/i },
  ];

  for (const { path, mustContain } of coreWorkspaces) {
    test(`${path} loads without 404`, async ({ page }) => {
      await installQaAuditApi(page);
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      const state = await captureMainPageState(page, path);
      expect(state.has404).toBe(false);
      expect(state.pageText).toMatch(mustContain);
    });
  }
});
