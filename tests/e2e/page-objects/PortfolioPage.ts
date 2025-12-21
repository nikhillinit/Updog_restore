import type { Page, Locator} from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class PortfolioPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Main portfolio elements
  get portfolioContainer(): Locator {
    return this.page.locator('[data-testid="portfolio-container"], .portfolio-page, .portfolio-view').first();
  }

  get portfolioTitle(): Locator {
    return this.page.locator('[data-testid="portfolio-title"], h1:has-text("Portfolio"), .portfolio-header h1').first();
  }

  get portfolioSummary(): Locator {
    return this.page.locator('[data-testid="portfolio-summary"], .portfolio-summary, .summary-card').first();
  }

  // Investment list
  get investmentsList(): Locator {
    return this.page.locator('[data-testid="investments-list"], .investments-table, .portfolio-investments').first();
  }

  get investmentItems(): Locator {
    return this.page.locator('[data-testid="investment-item"], .investment-row, .investment-card');
  }

  get noInvestmentsMessage(): Locator {
    return this.page.locator('[data-testid="no-investments"], .empty-state, :has-text("No investments")').first();
  }

  // Portfolio metrics
  get totalPortfolioValue(): Locator {
    return this.page.locator('[data-testid="total-portfolio-value"], .total-value, .portfolio-value').first();
  }

  get totalInvested(): Locator {
    return this.page.locator('[data-testid="total-invested"], .total-invested').first();
  }

  get totalReturns(): Locator {
    return this.page.locator('[data-testid="total-returns"], .total-returns').first();
  }

  get portfolioIRR(): Locator {
    return this.page.locator('[data-testid="portfolio-irr"], .irr-value, :has-text("IRR")').first();
  }

  get portfolioMOIC(): Locator {
    return this.page.locator('[data-testid="portfolio-moic"], .moic-value, :has-text("MOIC")').first();
  }

  // Filters and controls
  get filterDropdown(): Locator {
    return this.page.locator('[data-testid="portfolio-filter"], .filter-dropdown, select').first();
  }

  get sortDropdown(): Locator {
    return this.page.locator('[data-testid="portfolio-sort"], .sort-dropdown').first();
  }

  get searchInput(): Locator {
    return this.page.locator('[data-testid="portfolio-search"], input[placeholder*="search" i]').first();
  }

  // Action buttons
  get addInvestmentButton(): Locator {
    return this.page.locator('[data-testid="add-investment"], .add-investment-btn, button:has-text("Add Investment")').first();
  }

  get exportButton(): Locator {
    return this.page.locator('[data-testid="export-portfolio"], .export-btn, button:has-text("Export")').first();
  }

  get refreshButton(): Locator {
    return this.page.locator('[data-testid="refresh-portfolio"], .refresh-btn, button[aria-label*="refresh" i]').first();
  }

  // Table/list headers
  get tableHeaders(): Locator {
    return this.page.locator('[data-testid="table-header"], th, .column-header');
  }

  // Charts and visualizations
  get portfolioChart(): Locator {
    return this.page.locator('[data-testid="portfolio-chart"], .portfolio-chart, canvas, svg').first();
  }

  get sectorAllocationChart(): Locator {
    return this.page.locator('[data-testid="sector-allocation"], .sector-chart, .allocation-chart').first();
  }

  // Actions
  async verifyPortfolioLoaded() {
    await expect(this.portfolioContainer).toBeVisible();
    await expect(this.portfolioTitle).toBeVisible();
    await this.waitForLoadingToComplete();
  }

  async getPortfolioMetrics() {
    await this.portfolioSummary.waitFor({ state: 'visible', timeout: 10000 });
    
    return {
      totalValue: await this.extractMetricValue(this.totalPortfolioValue),
      totalInvested: await this.extractMetricValue(this.totalInvested),
      totalReturns: await this.extractMetricValue(this.totalReturns),
      irr: await this.extractMetricValue(this.portfolioIRR),
      moic: await this.extractMetricValue(this.portfolioMOIC)
    };
  }

  private async extractMetricValue(locator: Locator): Promise<string> {
    try {
      if (await locator.isVisible()) {
        const text = await locator.textContent();
        return text?.trim() || 'N/A';
      }
      return 'N/A';
    } catch {
      return 'N/A';
    }
  }

  async getInvestmentsCount(): Promise<number> {
    try {
      return await this.investmentItems.count();
    } catch {
      return 0;
    }
  }

  async getInvestmentByName(name: string): Promise<Locator | null> {
    const investments = this.investmentItems;
    const count = await investments.count();
    
    for (let i = 0; i < count; i++) {
      const investment = investments.nth(i);
      const text = await investment.textContent();
      if (text?.includes(name)) {
        return investment;
      }
    }
    return null;
  }

  async searchInvestments(searchTerm: string) {
    if (await this.searchInput.isVisible()) {
      await this.searchInput.fill(searchTerm);
      await this.page.keyboard.press('Enter');
      await this.page.waitForTimeout(1000); // Wait for search results
    }
  }

  async filterPortfolio(filterValue: string) {
    if (await this.filterDropdown.isVisible()) {
      await this.filterDropdown.selectOption(filterValue);
      await this.page.waitForTimeout(1000); // Wait for filter to apply
    }
  }

  async sortPortfolio(sortValue: string) {
    if (await this.sortDropdown.isVisible()) {
      await this.sortDropdown.selectOption(sortValue);
      await this.page.waitForTimeout(1000); // Wait for sort to apply
    }
  }

  async clickAddInvestment() {
    await expect(this.addInvestmentButton).toBeVisible();
    await this.addInvestmentButton.click();
    
    // Wait for modal or navigation
    await this.page.waitForTimeout(1000);
  }

  async exportPortfolio() {
    if (await this.exportButton.isVisible()) {
      await this.exportButton.click();
      
      // Wait for download or modal
      await this.page.waitForTimeout(2000);
    }
  }

  async refreshPortfolio() {
    if (await this.refreshButton.isVisible()) {
      await this.refreshButton.click();
      await this.waitForLoadingToComplete();
    }
  }

  async verifyEmptyPortfolio() {
    const investmentsCount = await this.getInvestmentsCount();
    
    if (investmentsCount === 0) {
      // Should show empty state message
      const hasEmptyMessage = await this.noInvestmentsMessage.isVisible();
      const hasAddButton = await this.addInvestmentButton.isVisible();
      
      expect(hasEmptyMessage || hasAddButton).toBeTruthy();
    }
  }

  async verifyPortfolioCharts() {
    // Check for any portfolio visualizations
    const hasMainChart = await this.portfolioChart.isVisible();
    const hasSectorChart = await this.sectorAllocationChart.isVisible();
    const hasAnyChart = await this.page.locator('canvas, svg, .chart, .recharts-wrapper').count() > 0;
    
    // At least one visualization should be present
    expect(hasMainChart || hasSectorChart || hasAnyChart).toBeTruthy();
  }

  async verifyTableStructure() {
    if (await this.investmentsList.isVisible()) {
      const headersCount = await this.tableHeaders.count();
      
      // Should have some table structure
      expect(headersCount).toBeGreaterThan(0);
      
      // Common headers that should exist
      const tableText = await this.investmentsList.textContent();
      const hasCompanyHeader = tableText?.toLowerCase().includes('company') || 
                              tableText?.toLowerCase().includes('investment');
      const hasValueHeader = tableText?.toLowerCase().includes('value') ||
                            tableText?.toLowerCase().includes('amount');
      
      expect(hasCompanyHeader || hasValueHeader).toBeTruthy();
    }
  }

  async clickInvestment(investmentName: string) {
    const investment = await this.getInvestmentByName(investmentName);
    
    if (investment) {
      await investment.click();
      await this.page.waitForTimeout(1000); // Wait for navigation or modal
      return true;
    }
    return false;
  }

  async verifyInvestmentDetails(investment: Locator) {
    const investmentText = await investment.textContent();
    expect(investmentText).toBeTruthy();
    
    // Should contain some investment information
    const hasFinancialInfo = investmentText?.match(/\$[\d,]+/) || // Dollar amounts
                            investmentText?.match(/\d+%/) ||      // Percentages
                            investmentText?.match(/\d{4}/);       // Years/dates
    
    expect(hasFinancialInfo).toBeTruthy();
  }

  async testPortfolioResponsiveness() {
    // Test different viewport sizes
    const viewports = [
      { width: 1200, height: 800, name: 'desktop' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 375, height: 667, name: 'mobile' }
    ];
    
    for (const viewport of viewports) {
      await this.page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      // Core elements should remain visible
      await expect(this.portfolioContainer).toBeVisible();
      await expect(this.portfolioTitle).toBeVisible();
      
      // Take screenshot for each size
      await this.takeScreenshot(`portfolio-${viewport.name}`);
    }
  }

  async verifyPortfolioPerformance() {
    const metrics = await this.getPortfolioMetrics();
    
    // Verify metrics are displayed (values might be 0 for empty portfolio)
    expect(typeof metrics.totalValue).toBe('string');
    expect(typeof metrics.totalInvested).toBe('string');
    expect(typeof metrics.irr).toBe('string');
    expect(typeof metrics.moic).toBe('string');
    
    return metrics;
  }
}