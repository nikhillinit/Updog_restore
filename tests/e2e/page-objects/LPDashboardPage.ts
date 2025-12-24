import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object for LP Reporting Dashboard
 *
 * Provides locators and actions for testing the LP portal pages:
 * - Dashboard
 * - Fund Detail
 * - Capital Account
 * - Performance
 * - Reports
 * - Settings
 */
export class LPDashboardPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // ============================================================================
  // COMMON NAVIGATION LOCATORS
  // ============================================================================

  /** Navigation link to LP Dashboard */
  get dashboardNavLink(): Locator {
    return this.page.locator('a[href="/lp/dashboard"], a:has-text("LP Dashboard")').first();
  }

  /** Quick action button to Capital Account */
  get capitalAccountQuickAction(): Locator {
    return this.page.locator('button:has-text("View Capital Account"), a:has-text("View Capital Account")').first();
  }

  /** Quick action button to Performance */
  get performanceQuickAction(): Locator {
    return this.page.locator('button:has-text("Performance Analytics"), a:has-text("Performance Analytics")').first();
  }

  /** Quick action button to Reports */
  get reportsQuickAction(): Locator {
    return this.page.locator('button:has-text("Generate Reports"), a:has-text("Generate Reports")').first();
  }

  // ============================================================================
  // DASHBOARD PAGE LOCATORS
  // ============================================================================

  /** Dashboard page title */
  get dashboardTitle(): Locator {
    return this.page.locator('h1:has-text("LP Dashboard"), h1:has-text("Portfolio overview")').first();
  }

  /** Fund selector dropdown */
  get fundSelector(): Locator {
    return this.page.locator('[data-testid="fund-selector"], button:has(svg[class*="Building2"])').first();
  }

  /** Summary metric cards */
  get summaryCards(): Locator {
    return this.page.locator('[data-testid="metric-card"], .card, div.grid div.rounded-xl');
  }

  /** Total Committed card */
  get committedCard(): Locator {
    return this.page.locator(':has-text("Total Committed")').first();
  }

  /** Total Called card */
  get calledCard(): Locator {
    return this.page.locator(':has-text("Total Called")').first();
  }

  /** Total Distributed card */
  get distributedCard(): Locator {
    return this.page.locator(':has-text("Total Distributed")').first();
  }

  /** Current NAV card */
  get navCard(): Locator {
    return this.page.locator(':has-text("Current NAV")').first();
  }

  /** Fund Performance section */
  get fundPerformanceSection(): Locator {
    return this.page.locator(':has-text("Fund Performance")').first();
  }

  /** Individual fund cards in the list */
  get fundCards(): Locator {
    return this.page.locator('[data-testid="fund-card"], div.border.rounded-lg.p-4.hover\\:shadow-md');
  }

  /** Quick Actions section */
  get quickActionsSection(): Locator {
    return this.page.locator(':has-text("Quick Actions")').first();
  }

  // ============================================================================
  // CAPITAL ACCOUNT PAGE LOCATORS
  // ============================================================================

  /** Capital Account page title */
  get capitalAccountTitle(): Locator {
    return this.page.locator('h1:has-text("Capital Account")').first();
  }

  /** Date range filter - start date */
  get startDateInput(): Locator {
    return this.page.locator('input[type="date"]#start-date, input[id="start-date"]').first();
  }

  /** Date range filter - end date */
  get endDateInput(): Locator {
    return this.page.locator('input[type="date"]#end-date, input[id="end-date"]').first();
  }

  /** Capital account summary cards (total called, distributed, NAV, transactions) */
  get capitalAccountSummaryCards(): Locator {
    return this.page.locator('.grid > .card, .grid > div.rounded-xl');
  }

  /** Transactions table */
  get transactionsTable(): Locator {
    return this.page.locator('table, [data-testid="transactions-table"]').first();
  }

  /** Table rows */
  get transactionRows(): Locator {
    return this.page.locator('tbody tr');
  }

  /** Filter by transaction type */
  get transactionTypeFilter(): Locator {
    return this.page.locator('button:has(svg[class*="Filter"]), [data-testid="type-filter"]').first();
  }

  /** Export button */
  get exportButton(): Locator {
    return this.page.locator('button:has-text("Export"), button:has(svg[class*="Download"])').first();
  }

  /** Load More button */
  get loadMoreButton(): Locator {
    return this.page.locator('button:has-text("Load More")').first();
  }

  /** Refresh button */
  get refreshButton(): Locator {
    return this.page.locator('button:has-text("Refresh"), button:has(svg[class*="RefreshCw"])').first();
  }

  // ============================================================================
  // PERFORMANCE PAGE LOCATORS
  // ============================================================================

  /** Performance page title */
  get performanceTitle(): Locator {
    return this.page.locator('h1:has-text("Performance"), h1:has-text("Analytics")').first();
  }

  /** Performance metrics card */
  get performanceMetricsCard(): Locator {
    return this.page.locator('[data-testid="performance-metrics"], .card:has-text("IRR")').first();
  }

  /** IRR trend chart */
  get irrTrendChart(): Locator {
    return this.page.locator('.recharts-wrapper, svg[class*="recharts"]').first();
  }

  /** Portfolio holdings table */
  get portfolioHoldingsTable(): Locator {
    return this.page.locator('table:has-text("Holdings"), [data-testid="holdings-table"]').first();
  }

  // ============================================================================
  // REPORTS PAGE LOCATORS
  // ============================================================================

  /** Reports page title */
  get reportsTitle(): Locator {
    return this.page.locator('h1:has-text("Reports")').first();
  }

  /** Report type selector buttons */
  get quarterlyReportButton(): Locator {
    return this.page.locator('button:has-text("Quarterly Statement")').first();
  }

  get annualReportButton(): Locator {
    return this.page.locator('button:has-text("Annual Statement")').first();
  }

  get k1TaxButton(): Locator {
    return this.page.locator('button:has-text("K-1 Tax Form")').first();
  }

  /** Generate Report button */
  get generateReportButton(): Locator {
    return this.page.locator('button:has-text("Generate Report")').first();
  }

  /** Report history section */
  get reportHistorySection(): Locator {
    return this.page.locator(':has-text("Report History")').first();
  }

  /** Report history items */
  get reportHistoryItems(): Locator {
    return this.page.locator('[data-testid="report-item"], div.border.rounded-lg:has(svg[class*="CheckCircle"])');
  }

  /** Download buttons in report history */
  get reportDownloadButtons(): Locator {
    return this.page.locator('button:has-text("Download"), a:has-text("Download")');
  }

  // ============================================================================
  // SETTINGS PAGE LOCATORS
  // ============================================================================

  /** Settings page title */
  get settingsTitle(): Locator {
    return this.page.locator('h1:has-text("Settings")').first();
  }

  /** Profile information card */
  get profileInfoCard(): Locator {
    return this.page.locator('[data-testid="profile-card"], div:has-text("Profile Information")').first();
  }

  /** Email notification switches */
  get capitalCallsSwitch(): Locator {
    return this.page.locator('button[role="switch"]#email-capital-calls, [id="email-capital-calls"]').first();
  }

  get distributionsSwitch(): Locator {
    return this.page.locator('button[role="switch"]#email-distributions, [id="email-distributions"]').first();
  }

  get quarterlyReportsSwitch(): Locator {
    return this.page.locator('button[role="switch"]#email-quarterly, [id="email-quarterly"]').first();
  }

  /** Display preferences selects */
  get currencySelect(): Locator {
    return this.page.locator('[id="currency"]').first();
  }

  get timezoneSelect(): Locator {
    return this.page.locator('[id="timezone"]').first();
  }

  /** Save Changes button */
  get saveSettingsButton(): Locator {
    return this.page.locator('button:has-text("Save Changes"), button:has(svg[class*="Save"])').first();
  }

  // ============================================================================
  // LOADING & ERROR STATES
  // ============================================================================

  /** Loading skeleton */
  get loadingSkeleton(): Locator {
    return this.page.locator('.animate-pulse, [data-testid="loading-skeleton"]');
  }

  /** Loading spinner */
  get loadingSpinner(): Locator {
    return this.page.locator('.animate-spin');
  }

  /** Error message */
  get errorMessage(): Locator {
    return this.page.locator('[data-testid="error-message"], .error, :has-text("Error"), :has-text("failed")').first();
  }

  /** Empty state message */
  get emptyStateMessage(): Locator {
    return this.page.locator(':has-text("No transactions found"), :has-text("No reports generated")').first();
  }

  /** Success toast */
  get successToast(): Locator {
    return this.page.locator('[data-testid="toast"], div:has-text("success")').first();
  }

  // ============================================================================
  // NAVIGATION ACTIONS
  // ============================================================================

  async navigateToLPDashboard(): Promise<void> {
    await this.goto('lp/dashboard');
    await this.safeWaitForLoadingToComplete();
  }

  async navigateToFundDetail(fundId: string): Promise<void> {
    await this.goto(`lp/fund-detail/${fundId}`);
    await this.safeWaitForLoadingToComplete();
  }

  async navigateToCapitalAccount(): Promise<void> {
    await this.goto('lp/capital-account');
    await this.safeWaitForLoadingToComplete();
  }

  async navigateToPerformance(): Promise<void> {
    await this.goto('lp/performance');
    await this.safeWaitForLoadingToComplete();
  }

  async navigateToReports(): Promise<void> {
    await this.goto('lp/reports');
    await this.safeWaitForLoadingToComplete();
  }

  async navigateToSettings(): Promise<void> {
    await this.goto('lp/settings');
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

  // ============================================================================
  // DASHBOARD ACTIONS
  // ============================================================================

  async selectFund(fundId: string): Promise<void> {
    await this.fundSelector.click();
    const option = this.page.locator(`[role="option"][value="${fundId}"], [data-value="${fundId}"]`).first();
    if (await option.isVisible()) {
      await option.click();
      await this.waitForLoadingToComplete();
    }
  }

  async selectAllFunds(): Promise<void> {
    await this.fundSelector.click();
    const allOption = this.page.locator('[role="option"]:has-text("All Funds"), [data-value="all"]').first();
    if (await allOption.isVisible()) {
      await allOption.click();
      await this.waitForLoadingToComplete();
    }
  }

  async clickFundCard(fundName: string): Promise<void> {
    const fundCard = this.page.locator(`div:has-text("${fundName}").cursor-pointer`).first();
    if (await fundCard.isVisible()) {
      await fundCard.click();
    }
  }

  async verifySummaryCardsDisplayed(): Promise<boolean> {
    const committedVisible = await this.committedCard.isVisible();
    const calledVisible = await this.calledCard.isVisible();
    const distributedVisible = await this.distributedCard.isVisible();
    const navVisible = await this.navCard.isVisible();

    return committedVisible && calledVisible && distributedVisible && navVisible;
  }

  async getSummaryCardValue(cardName: string): Promise<string | null> {
    const card = this.page.locator(`:has-text("${cardName}")`).first();
    if (await card.isVisible()) {
      return await card.textContent();
    }
    return null;
  }

  // ============================================================================
  // CAPITAL ACCOUNT ACTIONS
  // ============================================================================

  async setDateRange(startDate: string, endDate: string): Promise<void> {
    if (startDate) {
      await this.startDateInput.fill(startDate);
    }
    if (endDate) {
      await this.endDateInput.fill(endDate);
    }
    await this.waitForLoadingToComplete();
  }

  async filterByTransactionType(type: string): Promise<void> {
    await this.transactionTypeFilter.click();
    const option = this.page.locator(`[role="option"]:has-text("${type}")`).first();
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

  async clickLoadMore(): Promise<void> {
    if (await this.loadMoreButton.isVisible()) {
      await this.loadMoreButton.click();
      await this.waitForLoadingToComplete();
    }
  }

  async clickRefresh(): Promise<void> {
    if (await this.refreshButton.isVisible()) {
      await this.refreshButton.click();
      await this.waitForLoadingToComplete();
    }
  }

  async getTransactionCount(): Promise<number> {
    return await this.transactionRows.count();
  }

  // ============================================================================
  // REPORTS ACTIONS
  // ============================================================================

  async selectReportType(reportType: 'quarterly' | 'annual' | 'k1'): Promise<void> {
    let button: Locator;
    switch (reportType) {
      case 'quarterly':
        button = this.quarterlyReportButton;
        break;
      case 'annual':
        button = this.annualReportButton;
        break;
      case 'k1':
        button = this.k1TaxButton;
        break;
    }

    if (await button.isVisible()) {
      await button.click();
    }
  }

  async generateReport(): Promise<void> {
    if (await this.generateReportButton.isVisible()) {
      await this.generateReportButton.click();
      // Wait for generation to start
      await this.page.waitForTimeout(1000);
    }
  }

  async downloadReport(reportIndex: number = 0): Promise<void> {
    const downloadButton = this.reportDownloadButtons.nth(reportIndex);
    if (await downloadButton.isVisible()) {
      await downloadButton.click();
    }
  }

  async getReportHistoryCount(): Promise<number> {
    return await this.reportHistoryItems.count();
  }

  // ============================================================================
  // SETTINGS ACTIONS
  // ============================================================================

  async toggleNotificationSwitch(switchName: 'capitalCalls' | 'distributions' | 'quarterlyReports'): Promise<void> {
    let switchElement: Locator;
    switch (switchName) {
      case 'capitalCalls':
        switchElement = this.capitalCallsSwitch;
        break;
      case 'distributions':
        switchElement = this.distributionsSwitch;
        break;
      case 'quarterlyReports':
        switchElement = this.quarterlyReportsSwitch;
        break;
    }

    if (await switchElement.isVisible()) {
      await switchElement.click();
    }
  }

  async updateCurrency(currency: string): Promise<void> {
    await this.currencySelect.click();
    const option = this.page.locator(`[role="option"]:has-text("${currency}")`).first();
    if (await option.isVisible()) {
      await option.click();
    }
  }

  async updateTimezone(timezone: string): Promise<void> {
    await this.timezoneSelect.click();
    const option = this.page.locator(`[role="option"]:has-text("${timezone}")`).first();
    if (await option.isVisible()) {
      await option.click();
    }
  }

  async saveSettings(): Promise<void> {
    if (await this.saveSettingsButton.isVisible()) {
      await this.saveSettingsButton.click();
      // Wait for save to complete
      await this.page.waitForTimeout(500);
    }
  }

  // ============================================================================
  // ASSERTIONS
  // ============================================================================

  async verifyPageLoaded(pageType: 'dashboard' | 'capital-account' | 'performance' | 'reports' | 'settings'): Promise<void> {
    let titleLocator: Locator;
    switch (pageType) {
      case 'dashboard':
        titleLocator = this.dashboardTitle;
        break;
      case 'capital-account':
        titleLocator = this.capitalAccountTitle;
        break;
      case 'performance':
        titleLocator = this.performanceTitle;
        break;
      case 'reports':
        titleLocator = this.reportsTitle;
        break;
      case 'settings':
        titleLocator = this.settingsTitle;
        break;
    }

    await this.page.waitForSelector(`h1`, { timeout: 15000 });
    await this.waitForLoadingToComplete();
    expect(await titleLocator.isVisible()).toBeTruthy();
  }

  async hasError(): Promise<boolean> {
    const errorVisible = await this.errorMessage.isVisible();
    return errorVisible;
  }

  async verifySuccessToast(): Promise<boolean> {
    return await this.successToast.isVisible();
  }
}
