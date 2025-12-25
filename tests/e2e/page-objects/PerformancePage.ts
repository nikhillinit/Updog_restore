import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object for Performance Dashboard
 *
 * Provides locators and actions for testing the portfolio performance page.
 */
export class PerformancePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // ============================================================================
  // LOCATORS
  // ============================================================================

  /** Page header */
  get pageTitle(): Locator {
    return this.page.locator('h1:has-text("Fund Performance"), [data-testid="performance-title"]').first();
  }

  /** Loading skeleton */
  get loadingSkeleton(): Locator {
    return this.page.locator('.animate-pulse, [data-testid="loading-skeleton"]');
  }

  /** Empty state - no fund selected */
  get noFundMessage(): Locator {
    return this.page.locator(':has-text("Please select a fund")');
  }

  // Tab navigation
  get tabsList(): Locator {
    return this.page.locator('[role="tablist"]');
  }

  get timeseriesTab(): Locator {
    return this.page.locator('[role="tab"]:has-text("Timeseries"), button:has-text("Timeseries")').first();
  }

  get breakdownTab(): Locator {
    return this.page.locator('[role="tab"]:has-text("Breakdown"), button:has-text("Breakdown")').first();
  }

  get comparisonTab(): Locator {
    return this.page.locator('[role="tab"]:has-text("Comparison"), button:has-text("Comparison")').first();
  }

  // Time controls
  get timeframeSelect(): Locator {
    return this.page.locator('[data-testid="timeframe-select"], button:has-text("1y"), button:has-text("YTD")').first();
  }

  get granularitySelect(): Locator {
    return this.page.locator('[data-testid="granularity-select"], select:has-text("Monthly")').first();
  }

  // Charts
  get chartContainer(): Locator {
    return this.page.locator('.recharts-wrapper, [data-testid="chart-container"], svg').first();
  }

  get irrChart(): Locator {
    return this.page.locator(':has-text("IRR") .recharts-wrapper, [data-testid="irr-chart"]').first();
  }

  get tvpiChart(): Locator {
    return this.page.locator(':has-text("TVPI") .recharts-wrapper, [data-testid="tvpi-chart"]').first();
  }

  get dpiChart(): Locator {
    return this.page.locator(':has-text("DPI") .recharts-wrapper, [data-testid="dpi-chart"]').first();
  }

  // Metric cards
  get metricCards(): Locator {
    return this.page.locator('[data-testid="metric-card"], .metric-card, .card');
  }

  get irrValue(): Locator {
    return this.page.locator(':has-text("IRR") + *, [data-testid="irr-value"]').first();
  }

  get moicValue(): Locator {
    return this.page.locator(':has-text("MOIC") + *, [data-testid="moic-value"]').first();
  }

  get tvpiValue(): Locator {
    return this.page.locator(':has-text("TVPI") + *, [data-testid="tvpi-value"]').first();
  }

  // Breakdown section
  get groupBySelect(): Locator {
    return this.page.locator('[data-testid="groupby-select"], button:has-text("Sector")').first();
  }

  get breakdownTable(): Locator {
    return this.page.locator('[data-testid="breakdown-table"], table').first();
  }

  get breakdownChart(): Locator {
    return this.page.locator('[data-testid="breakdown-chart"], .recharts-bar-chart').first();
  }

  // Action buttons
  get exportButton(): Locator {
    return this.page.locator('[data-testid="export-button"], button:has-text("Export"), button:has-text("Download")').first();
  }

  get refreshButton(): Locator {
    return this.page.locator('[data-testid="refresh-button"], button:has-text("Refresh")').first();
  }

  // Error states
  get errorMessage(): Locator {
    return this.page.locator('[data-testid="error-message"], .error, :has-text("Error"), :has-text("failed")').first();
  }

  // Trend indicators
  get trendIndicators(): Locator {
    return this.page.locator('.lucide-trending-up, .lucide-trending-down, .text-green-600, .text-red-600');
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  async navigateToPerformance(): Promise<void> {
    await this.goto('performance');
    await this.safeWaitForLoadingToComplete();
  }

  /**
   * Wait for loading to complete, but don't fail if no spinner exists
   */
  private async safeWaitForLoadingToComplete(): Promise<void> {
    try {
      // Wait for spinners to disappear (if any)
      await this.page.waitForSelector('.animate-spin', { state: 'detached', timeout: 5000 });
    } catch {
      // No spinner found - that's fine, page may have loaded quickly
    }
    // Also wait for network to settle
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  }

  async verifyPageLoaded(): Promise<void> {
    // Wait for page title or main content
    await this.page.waitForSelector('h1:has-text("Fund Performance"), .recharts-wrapper, .card', {
      timeout: 15000,
    });
    await this.waitForLoadingToComplete();
  }

  async selectTimeframe(timeframe: '3m' | '6m' | '1y' | '2y' | 'ytd' | 'all'): Promise<void> {
    const timeframeButton = this.page.locator(`button:has-text("${timeframe}"), [data-value="${timeframe}"]`).first();
    if (await timeframeButton.isVisible()) {
      await timeframeButton.click();
      await this.waitForLoadingToComplete();
    }
  }

  async selectGranularity(granularity: 'daily' | 'weekly' | 'monthly' | 'quarterly'): Promise<void> {
    // Click the granularity select dropdown
    await this.granularitySelect.click();

    // Select the option
    const option = this.page.locator(`[role="option"]:has-text("${granularity}"), button:has-text("${granularity}")`).first();
    if (await option.isVisible()) {
      await option.click();
      await this.waitForLoadingToComplete();
    }
  }

  async switchToTab(tab: 'timeseries' | 'breakdown' | 'comparison'): Promise<void> {
    let tabLocator: Locator;
    switch (tab) {
      case 'timeseries':
        tabLocator = this.timeseriesTab;
        break;
      case 'breakdown':
        tabLocator = this.breakdownTab;
        break;
      case 'comparison':
        tabLocator = this.comparisonTab;
        break;
    }

    if (await tabLocator.isVisible()) {
      await tabLocator.click();
      await this.waitForLoadingToComplete();
    }
  }

  async selectGroupBy(dimension: 'sector' | 'stage' | 'company'): Promise<void> {
    await this.groupBySelect.click();

    const option = this.page.locator(`[role="option"]:has-text("${dimension}"), button:has-text("${dimension}")`).first();
    if (await option.isVisible()) {
      await option.click();
      await this.waitForLoadingToComplete();
    }
  }

  async clickExport(): Promise<void> {
    if (await this.exportButton.isVisible()) {
      await this.exportButton.click();
    }
  }

  async clickRefresh(): Promise<void> {
    if (await this.refreshButton.isVisible()) {
      await this.refreshButton.click();
      await this.waitForLoadingToComplete();
    }
  }

  // ============================================================================
  // ASSERTIONS
  // ============================================================================

  async verifyChartsVisible(): Promise<boolean> {
    const chartsVisible = await this.chartContainer.isVisible();
    return chartsVisible;
  }

  async verifyMetricsDisplayed(): Promise<boolean> {
    const irrVisible = await this.page.locator(':has-text("IRR")').first().isVisible();
    const moicVisible = await this.page.locator(':has-text("MOIC")').first().isVisible();
    const tvpiVisible = await this.page.locator(':has-text("TVPI")').first().isVisible();

    return irrVisible || moicVisible || tvpiVisible;
  }

  async verifyBreakdownTableVisible(): Promise<boolean> {
    const tableVisible = await this.breakdownTable.isVisible();
    const chartVisible = await this.breakdownChart.isVisible();
    return tableVisible || chartVisible;
  }

  async getDisplayedMetrics(): Promise<{ irr?: string; moic?: string; tvpi?: string; dpi?: string }> {
    const metrics: { irr?: string; moic?: string; tvpi?: string; dpi?: string } = {};

    try {
      const irrText = await this.page.locator(':has-text("IRR")').first().textContent();
      if (irrText) metrics.irr = irrText;
    } catch { /* metric not visible */ }

    try {
      const moicText = await this.page.locator(':has-text("MOIC")').first().textContent();
      if (moicText) metrics.moic = moicText;
    } catch { /* metric not visible */ }

    try {
      const tvpiText = await this.page.locator(':has-text("TVPI")').first().textContent();
      if (tvpiText) metrics.tvpi = tvpiText;
    } catch { /* metric not visible */ }

    try {
      const dpiText = await this.page.locator(':has-text("DPI")').first().textContent();
      if (dpiText) metrics.dpi = dpiText;
    } catch { /* metric not visible */ }

    return metrics;
  }

  async countCharts(): Promise<number> {
    const rechartsWrappers = await this.page.locator('.recharts-wrapper').count();
    return rechartsWrappers;
  }

  async hasError(): Promise<boolean> {
    const errorVisible = await this.errorMessage.isVisible();
    const errorText = await this.page.locator(':has-text("Error"), :has-text("failed"), :has-text("error")').first().isVisible();
    return errorVisible || errorText;
  }
}
