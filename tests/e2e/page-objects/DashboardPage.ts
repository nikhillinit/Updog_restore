import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class DashboardPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Dashboard specific elements
  get dashboardTitle(): Locator {
    return this.page.locator('[data-testid="dashboard-title"], h1:has-text("Dashboard"), .dashboard-title').first();
  }

  get fundOverviewCard(): Locator {
    return this.page.locator('[data-testid="fund-overview"], .fund-overview-card, .overview-card').first();
  }

  get performanceMetrics(): Locator {
    return this.page.locator('[data-testid="performance-metrics"], .performance-section, .metrics-section').first();
  }

  get portfolioSummary(): Locator {
    return this.page.locator('[data-testid="portfolio-summary"], .portfolio-summary, .portfolio-section').first();
  }

  get recentInvestments(): Locator {
    return this.page.locator('[data-testid="recent-investments"], .recent-investments, .investments-section').first();
  }

  // Performance metrics
  get irr(): Locator {
    return this.page.locator('[data-testid="irr"], .irr-metric, :has-text("IRR")').first();
  }

  get moic(): Locator {
    return this.page.locator('[data-testid="moic"], .moic-metric, :has-text("MOIC")').first();
  }

  // Navigation buttons
  get portfolioNavButton(): Locator {
    return this.page.locator('[data-testid="nav-portfolio"], a[href*="portfolio"], :has-text("Portfolio")').first();
  }

  get investmentsNavButton(): Locator {
    return this.page.locator('[data-testid="nav-investments"], a[href*="investments"], :has-text("Investments")').first();
  }

  get analyticsNavButton(): Locator {
    return this.page.locator('[data-testid="nav-analytics"], a[href*="analytics"], :has-text("Analytics")').first();
  }

  get addInvestmentButton(): Locator {
    return this.page.locator('[data-testid="add-investment"], .add-investment-btn, button:has-text("Add Investment")').first();
  }

  // Actions
  async verifyDashboardLoaded() {
    await expect(this.dashboardTitle).toBeVisible({ timeout: 10000 });
    await this.waitForLoadingToComplete();
  }

  async getFundMetrics() {
    await this.fundOverviewCard.waitFor({ state: 'visible' });
    
    // Extract metrics with fallbacks
    const totalFundSize = await this.extractMetric('total-fund-size', 'Total Fund Size', '$0');
    const deployedCapital = await this.extractMetric('deployed-capital', 'Deployed Capital', '$0');
    const dryPowder = await this.extractMetric('dry-powder', 'Dry Powder', '$0');
    
    return {
      totalFundSize,
      deployedCapital,
      dryPowder
    };
  }

  private async extractMetric(testId: string, label: string, fallback: string): Promise<string> {
    try {
      // Try data-testid first
      const element = this.page.locator(`[data-testid="${testId}"]`);
      if (await element.isVisible()) {
        return await element.textContent() || fallback;
      }
      
      // Try label-based selection
      const labelElement = this.page.locator(`:has-text("${label}")`).first();
      if (await labelElement.isVisible()) {
        return await labelElement.textContent() || fallback;
      }
      
      return fallback;
    } catch {
      return fallback;
    }
  }

  async getRecentInvestmentsCount(): Promise<number> {
    try {
      const investments = this.page.locator('[data-testid="investment-item"], .investment-row, .investment-card');
      return await investments.count();
    } catch {
      return 0;
    }
  }

  async navigateToPortfolio() {
    await this.portfolioNavButton.click();
    await this.waitForNavigation();
  }

  async navigateToInvestments() {
    await this.investmentsNavButton.click();
    await this.waitForNavigation();
  }

  async navigateToAnalytics() {
    await this.analyticsNavButton.click();
    await this.waitForNavigation();
  }

  async clickAddInvestment() {
    await this.addInvestmentButton.click();
    await this.page.waitForTimeout(1000); // Wait for modal or navigation
  }

  async verifyChartsPresent() {
    // Look for common chart elements (canvas, svg, chart containers)
    const chartSelectors = [
      'canvas',
      'svg',
      '[data-testid*="chart"]',
      '.chart-container',
      '.recharts-wrapper',
      '.nivo-container'
    ];

    let chartsFound = false;
    for (const selector of chartSelectors) {
      const elements = this.page.locator(selector);
      if (await elements.count() > 0) {
        chartsFound = true;
        break;
      }
    }

    expect(chartsFound).toBeTruthy();
  }
}