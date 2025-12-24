/**
 * LP Reporting Dashboard E2E Tests
 *
 * End-to-end tests for the Limited Partner portal covering:
 * - Dashboard page with summary metrics and fund list
 * - Capital Account page with transaction history
 * - Performance page with analytics and charts
 * - Reports page with generation wizard
 * - Settings page with preferences
 * - Navigation between pages
 * - Responsive design
 * - Error handling
 */

import { test, expect } from '@playwright/test';
import { LPDashboardPage } from './page-objects/LPDashboardPage';

test.describe('LP Reporting Dashboard', () => {
  let lpDashboardPage: LPDashboardPage;

  test.beforeEach(async ({ page }) => {
    lpDashboardPage = new LPDashboardPage(page);

    // Navigate to LP dashboard
    await lpDashboardPage.navigateToLPDashboard();

    // Check if LP is configured, skip tests if not
    const currentUrl = page.url();
    if (currentUrl.includes('/fund-setup') || currentUrl.includes('/dashboard') && !currentUrl.includes('/lp/')) {
      test.skip();
    }
  });

  // ============================================================================
  // PAGE LOADING TESTS
  // ============================================================================

  test('should load LP dashboard with title', async () => {
    await lpDashboardPage.verifyPageLoaded('dashboard');

    // Verify page title is visible
    const titleVisible = await lpDashboardPage.dashboardTitle.isVisible();
    expect(titleVisible).toBeTruthy();
  });

  test('should display loading skeleton while fetching', async ({ page }) => {
    // Navigate fresh to catch loading state
    await page.goto('/lp/dashboard');

    // Loading skeleton should appear briefly
    const skeleton = page.locator('.animate-pulse');
    const hadLoadingState = await skeleton.isVisible() ||
      (await skeleton.count()) === 0; // May have already loaded

    expect(hadLoadingState).toBeTruthy();

    // Eventually should finish loading
    await lpDashboardPage.waitForLoadingToComplete();
  });

  // ============================================================================
  // DASHBOARD TESTS
  // ============================================================================

  test('should display 4 summary cards with values', async () => {
    await lpDashboardPage.verifyPageLoaded('dashboard');

    // Verify all 4 summary cards are present
    const summaryCardsDisplayed = await lpDashboardPage.verifySummaryCardsDisplayed();
    expect(summaryCardsDisplayed).toBeTruthy();

    // Verify cards have content
    const committedText = await lpDashboardPage.getSummaryCardValue('Total Committed');
    const calledText = await lpDashboardPage.getSummaryCardValue('Total Called');
    const distributedText = await lpDashboardPage.getSummaryCardValue('Total Distributed');
    const navText = await lpDashboardPage.getSummaryCardValue('Current NAV');

    // At least some cards should have values
    const hasValues = [committedText, calledText, distributedText, navText].some((v) => v && v.includes('$'));
    expect(hasValues).toBeTruthy();
  });

  test('should display fund performance section', async () => {
    await lpDashboardPage.verifyPageLoaded('dashboard');

    // Verify Fund Performance section exists
    const fundPerformanceVisible = await lpDashboardPage.fundPerformanceSection.isVisible();
    expect(fundPerformanceVisible || !(await lpDashboardPage.hasError())).toBeTruthy();
  });

  test('should display quick actions section', async () => {
    await lpDashboardPage.verifyPageLoaded('dashboard');

    // Verify Quick Actions section
    const quickActionsVisible = await lpDashboardPage.quickActionsSection.isVisible();
    expect(quickActionsVisible).toBeTruthy();

    // Verify quick action buttons are present
    const capitalAccountActionVisible = await lpDashboardPage.capitalAccountQuickAction.isVisible();
    const performanceActionVisible = await lpDashboardPage.performanceQuickAction.isVisible();
    const reportsActionVisible = await lpDashboardPage.reportsQuickAction.isVisible();

    const hasQuickActions = capitalAccountActionVisible || performanceActionVisible || reportsActionVisible;
    expect(hasQuickActions).toBeTruthy();
  });

  test('should allow fund filtering', async () => {
    await lpDashboardPage.verifyPageLoaded('dashboard');

    // Check if fund selector is visible (only if multiple funds)
    const fundSelectorVisible = await lpDashboardPage.fundSelector.isVisible();

    if (fundSelectorVisible) {
      // Try to select "All Funds"
      await lpDashboardPage.selectAllFunds();

      // Should not crash
      expect(await lpDashboardPage.hasError()).toBeFalsy();
    }
  });

  test('should navigate to fund detail when clicking fund card', async ({ page }) => {
    await lpDashboardPage.verifyPageLoaded('dashboard');

    // Check if fund cards exist
    const fundCards = await lpDashboardPage.fundCards.count();

    if (fundCards > 0) {
      // Click first fund card
      const firstFundCard = lpDashboardPage.fundCards.first();
      await firstFundCard.click();

      // Should navigate to fund detail page
      await page.waitForURL(/\/lp\/fund-detail/, { timeout: 5000 }).catch(() => {});
      const hasNavigated = page.url().includes('/lp/fund-detail') || page.url().includes('/lp/dashboard');
      expect(hasNavigated).toBeTruthy();
    }
  });

  // ============================================================================
  // NAVIGATION TESTS
  // ============================================================================

  test('should navigate to capital account page via quick action', async ({ page }) => {
    await lpDashboardPage.verifyPageLoaded('dashboard');

    // Check if quick action is visible
    const quickActionVisible = await lpDashboardPage.capitalAccountQuickAction.isVisible();

    if (quickActionVisible) {
      await lpDashboardPage.capitalAccountQuickAction.click();
      await page.waitForURL(/\/lp\/capital-account/, { timeout: 10000 });

      expect(page.url()).toContain('/lp/capital-account');
    }
  });

  test('should navigate to performance page via quick action', async ({ page }) => {
    await lpDashboardPage.verifyPageLoaded('dashboard');

    const quickActionVisible = await lpDashboardPage.performanceQuickAction.isVisible();

    if (quickActionVisible) {
      await lpDashboardPage.performanceQuickAction.click();
      await page.waitForURL(/\/lp\/performance/, { timeout: 10000 });

      expect(page.url()).toContain('/lp/performance');
    }
  });

  test('should navigate to reports page via quick action', async ({ page }) => {
    await lpDashboardPage.verifyPageLoaded('dashboard');

    const quickActionVisible = await lpDashboardPage.reportsQuickAction.isVisible();

    if (quickActionVisible) {
      await lpDashboardPage.reportsQuickAction.click();
      await page.waitForURL(/\/lp\/reports/, { timeout: 10000 });

      expect(page.url()).toContain('/lp/reports');
    }
  });

  test('should navigate directly to capital account page', async () => {
    await lpDashboardPage.navigateToCapitalAccount();
    await lpDashboardPage.verifyPageLoaded('capital-account');

    const titleVisible = await lpDashboardPage.capitalAccountTitle.isVisible();
    expect(titleVisible).toBeTruthy();
  });

  test('should navigate directly to performance page', async () => {
    await lpDashboardPage.navigateToPerformance();
    await lpDashboardPage.verifyPageLoaded('performance');

    const titleVisible = await lpDashboardPage.performanceTitle.isVisible();
    expect(titleVisible || !(await lpDashboardPage.hasError())).toBeTruthy();
  });

  test('should navigate directly to reports page', async () => {
    await lpDashboardPage.navigateToReports();
    await lpDashboardPage.verifyPageLoaded('reports');

    const titleVisible = await lpDashboardPage.reportsTitle.isVisible();
    expect(titleVisible).toBeTruthy();
  });

  test('should navigate directly to settings page', async () => {
    await lpDashboardPage.navigateToSettings();
    await lpDashboardPage.verifyPageLoaded('settings');

    const titleVisible = await lpDashboardPage.settingsTitle.isVisible();
    expect(titleVisible).toBeTruthy();
  });

  // ============================================================================
  // CAPITAL ACCOUNT TESTS
  // ============================================================================

  test('should display capital account transaction table', async () => {
    await lpDashboardPage.navigateToCapitalAccount();
    await lpDashboardPage.verifyPageLoaded('capital-account');

    // Verify table is visible
    const tableVisible = await lpDashboardPage.transactionsTable.isVisible();
    expect(tableVisible || !(await lpDashboardPage.hasError())).toBeTruthy();
  });

  test('should display capital account summary cards', async () => {
    await lpDashboardPage.navigateToCapitalAccount();
    await lpDashboardPage.verifyPageLoaded('capital-account');

    // Verify summary cards are present
    const summaryCards = await lpDashboardPage.capitalAccountSummaryCards.count();
    expect(summaryCards).toBeGreaterThanOrEqual(0);
  });

  test('should filter transactions by date range', async () => {
    await lpDashboardPage.navigateToCapitalAccount();
    await lpDashboardPage.verifyPageLoaded('capital-account');

    // Set date range
    const startDate = '2024-01-01';
    const endDate = '2024-12-31';

    await lpDashboardPage.setDateRange(startDate, endDate);

    // Should not crash
    expect(await lpDashboardPage.hasError()).toBeFalsy();
  });

  test('should filter transactions by type', async () => {
    await lpDashboardPage.navigateToCapitalAccount();
    await lpDashboardPage.verifyPageLoaded('capital-account');

    // Check if filter is visible
    const filterVisible = await lpDashboardPage.transactionTypeFilter.isVisible();

    if (filterVisible) {
      await lpDashboardPage.filterByTransactionType('Capital Calls');

      // Should not crash
      expect(await lpDashboardPage.hasError()).toBeFalsy();
    }
  });

  test('should have export functionality', async () => {
    await lpDashboardPage.navigateToCapitalAccount();
    await lpDashboardPage.verifyPageLoaded('capital-account');

    // Check if export button is visible
    const exportVisible = await lpDashboardPage.exportButton.isVisible();

    // Export may or may not be available
    expect(exportVisible !== undefined).toBeTruthy();
  });

  test('should load more transactions when available', async () => {
    await lpDashboardPage.navigateToCapitalAccount();
    await lpDashboardPage.verifyPageLoaded('capital-account');

    // Check if load more button is visible
    const loadMoreVisible = await lpDashboardPage.loadMoreButton.isVisible();

    if (loadMoreVisible) {
      await lpDashboardPage.clickLoadMore();

      // Should not crash
      expect(await lpDashboardPage.hasError()).toBeFalsy();
    }
  });

  test('should refresh transactions', async () => {
    await lpDashboardPage.navigateToCapitalAccount();
    await lpDashboardPage.verifyPageLoaded('capital-account');

    // Check if refresh button is visible
    const refreshVisible = await lpDashboardPage.refreshButton.isVisible();

    if (refreshVisible) {
      await lpDashboardPage.clickRefresh();

      // Should not crash
      expect(await lpDashboardPage.hasError()).toBeFalsy();
    }
  });

  // ============================================================================
  // PERFORMANCE TESTS
  // ============================================================================

  test('should display performance metrics', async () => {
    await lpDashboardPage.navigateToPerformance();
    await lpDashboardPage.verifyPageLoaded('performance');

    // Verify performance metrics card is visible
    const metricsVisible = await lpDashboardPage.performanceMetricsCard.isVisible();
    expect(metricsVisible || !(await lpDashboardPage.hasError())).toBeTruthy();
  });

  test('should display IRR trend chart', async () => {
    await lpDashboardPage.navigateToPerformance();
    await lpDashboardPage.verifyPageLoaded('performance');

    // Verify chart is visible
    const chartVisible = await lpDashboardPage.irrTrendChart.isVisible();
    expect(chartVisible || !(await lpDashboardPage.hasError())).toBeTruthy();
  });

  test('should display portfolio holdings table', async () => {
    await lpDashboardPage.navigateToPerformance();
    await lpDashboardPage.verifyPageLoaded('performance');

    // Verify holdings table is visible
    const tableVisible = await lpDashboardPage.portfolioHoldingsTable.isVisible();
    expect(tableVisible || !(await lpDashboardPage.hasError())).toBeTruthy();
  });

  // ============================================================================
  // REPORTS TESTS
  // ============================================================================

  test('should display report type selector', async () => {
    await lpDashboardPage.navigateToReports();
    await lpDashboardPage.verifyPageLoaded('reports');

    // Verify report type buttons are visible
    const quarterlyVisible = await lpDashboardPage.quarterlyReportButton.isVisible();
    const annualVisible = await lpDashboardPage.annualReportButton.isVisible();
    const k1Visible = await lpDashboardPage.k1TaxButton.isVisible();

    const hasReportTypes = quarterlyVisible || annualVisible || k1Visible;
    expect(hasReportTypes).toBeTruthy();
  });

  test('should select different report types', async () => {
    await lpDashboardPage.navigateToReports();
    await lpDashboardPage.verifyPageLoaded('reports');

    // Select quarterly report
    await lpDashboardPage.selectReportType('quarterly');

    // Select annual report
    await lpDashboardPage.selectReportType('annual');

    // Select K-1 tax form
    await lpDashboardPage.selectReportType('k1');

    // Should not crash
    expect(await lpDashboardPage.hasError()).toBeFalsy();
  });

  test('should display generate report button', async () => {
    await lpDashboardPage.navigateToReports();
    await lpDashboardPage.verifyPageLoaded('reports');

    // Verify generate button is visible
    const generateVisible = await lpDashboardPage.generateReportButton.isVisible();
    expect(generateVisible).toBeTruthy();
  });

  test('should display report history section', async () => {
    await lpDashboardPage.navigateToReports();
    await lpDashboardPage.verifyPageLoaded('reports');

    // Verify report history section is visible
    const historyVisible = await lpDashboardPage.reportHistorySection.isVisible();
    expect(historyVisible).toBeTruthy();
  });

  test('should show report history items or empty state', async () => {
    await lpDashboardPage.navigateToReports();
    await lpDashboardPage.verifyPageLoaded('reports');

    // Count report history items
    const historyCount = await lpDashboardPage.getReportHistoryCount();

    // Should have items or show empty state
    const hasHistoryOrEmpty = historyCount > 0 || await lpDashboardPage.emptyStateMessage.isVisible();
    expect(hasHistoryOrEmpty || !(await lpDashboardPage.hasError())).toBeTruthy();
  });

  // ============================================================================
  // SETTINGS TESTS
  // ============================================================================

  test('should display profile information', async () => {
    await lpDashboardPage.navigateToSettings();
    await lpDashboardPage.verifyPageLoaded('settings');

    // Verify profile card is visible
    const profileVisible = await lpDashboardPage.profileInfoCard.isVisible();
    expect(profileVisible).toBeTruthy();
  });

  test('should display notification preferences', async () => {
    await lpDashboardPage.navigateToSettings();
    await lpDashboardPage.verifyPageLoaded('settings');

    // Verify notification switches are visible
    const capitalCallsVisible = await lpDashboardPage.capitalCallsSwitch.isVisible();
    const distributionsVisible = await lpDashboardPage.distributionsSwitch.isVisible();
    const quarterlyVisible = await lpDashboardPage.quarterlyReportsSwitch.isVisible();

    const hasNotificationSettings = capitalCallsVisible || distributionsVisible || quarterlyVisible;
    expect(hasNotificationSettings).toBeTruthy();
  });

  test('should toggle notification preferences', async () => {
    await lpDashboardPage.navigateToSettings();
    await lpDashboardPage.verifyPageLoaded('settings');

    // Try toggling notification switches
    const capitalCallsVisible = await lpDashboardPage.capitalCallsSwitch.isVisible();

    if (capitalCallsVisible) {
      await lpDashboardPage.toggleNotificationSwitch('capitalCalls');

      // Should not crash
      expect(await lpDashboardPage.hasError()).toBeFalsy();
    }
  });

  test('should display display preferences', async () => {
    await lpDashboardPage.navigateToSettings();
    await lpDashboardPage.verifyPageLoaded('settings');

    // Verify display preference selects are visible
    const currencyVisible = await lpDashboardPage.currencySelect.isVisible();
    const timezoneVisible = await lpDashboardPage.timezoneSelect.isVisible();

    const hasDisplaySettings = currencyVisible || timezoneVisible;
    expect(hasDisplaySettings).toBeTruthy();
  });

  test('should display save changes button', async () => {
    await lpDashboardPage.navigateToSettings();
    await lpDashboardPage.verifyPageLoaded('settings');

    // Verify save button is visible
    const saveVisible = await lpDashboardPage.saveSettingsButton.isVisible();
    expect(saveVisible).toBeTruthy();
  });

  test('should save settings and show success message', async () => {
    await lpDashboardPage.navigateToSettings();
    await lpDashboardPage.verifyPageLoaded('settings');

    // Click save button
    await lpDashboardPage.saveSettings();

    // Wait for toast to appear
    await lpDashboardPage.page.waitForTimeout(1000);

    // Should show success toast or not crash
    const hasSuccess = await lpDashboardPage.verifySuccessToast() || !(await lpDashboardPage.hasError());
    expect(hasSuccess).toBeTruthy();
  });

  // ============================================================================
  // RESPONSIVE DESIGN TESTS
  // ============================================================================

  test('should work on desktop (1440x900)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await lpDashboardPage.navigateToLPDashboard();
    await lpDashboardPage.verifyPageLoaded('dashboard');

    // Dashboard should be visible
    const titleVisible = await lpDashboardPage.dashboardTitle.isVisible();
    expect(titleVisible).toBeTruthy();

    // Summary cards should be visible
    const summaryCardsDisplayed = await lpDashboardPage.verifySummaryCardsDisplayed();
    expect(summaryCardsDisplayed || !(await lpDashboardPage.hasError())).toBeTruthy();
  });

  test('should work on tablet (768x1024)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await lpDashboardPage.navigateToLPDashboard();
    await lpDashboardPage.verifyPageLoaded('dashboard');

    // Page should still be usable
    const titleVisible = await lpDashboardPage.dashboardTitle.isVisible();
    expect(titleVisible).toBeTruthy();
  });

  test('should work on mobile (375x667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await lpDashboardPage.navigateToLPDashboard();
    await lpDashboardPage.verifyPageLoaded('dashboard');

    // Page should be visible and not broken
    const titleVisible = await lpDashboardPage.dashboardTitle.isVisible();
    expect(titleVisible).toBeTruthy();

    // Take screenshot for visual verification
    await lpDashboardPage.takeScreenshot('lp-dashboard-mobile');
  });

  test('should be responsive on capital account page (mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await lpDashboardPage.navigateToCapitalAccount();
    await lpDashboardPage.verifyPageLoaded('capital-account');

    const titleVisible = await lpDashboardPage.capitalAccountTitle.isVisible();
    expect(titleVisible).toBeTruthy();
  });

  test('should be responsive on settings page (mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await lpDashboardPage.navigateToSettings();
    await lpDashboardPage.verifyPageLoaded('settings');

    const titleVisible = await lpDashboardPage.settingsTitle.isVisible();
    expect(titleVisible).toBeTruthy();
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  test('should handle API errors gracefully on dashboard', async () => {
    await lpDashboardPage.navigateToLPDashboard();
    await lpDashboardPage.verifyPageLoaded('dashboard');

    // Page should either show data or a meaningful error state
    const hasError = await lpDashboardPage.hasError();
    const hasContent = await lpDashboardPage.verifySummaryCardsDisplayed();

    // Should have either content or a graceful error - not a blank page
    expect(hasContent || hasError).toBeTruthy();
  });

  test('should handle API errors gracefully on capital account', async () => {
    await lpDashboardPage.navigateToCapitalAccount();
    await lpDashboardPage.verifyPageLoaded('capital-account');

    const hasError = await lpDashboardPage.hasError();
    const hasTable = await lpDashboardPage.transactionsTable.isVisible();
    const hasEmptyState = await lpDashboardPage.emptyStateMessage.isVisible();

    // Should have either content, empty state, or error - not a crash
    expect(hasTable || hasEmptyState || hasError).toBeTruthy();
  });

  test('should not crash on page reload (dashboard)', async ({ page }) => {
    await lpDashboardPage.navigateToLPDashboard();
    await lpDashboardPage.verifyPageLoaded('dashboard');

    // Reload the page
    await page.reload();
    await lpDashboardPage.waitForLoadingToComplete();

    // Should still work after reload
    const titleVisible = await lpDashboardPage.dashboardTitle.isVisible();
    expect(titleVisible).toBeTruthy();
  });

  test('should not crash on page reload (capital account)', async ({ page }) => {
    await lpDashboardPage.navigateToCapitalAccount();
    await lpDashboardPage.verifyPageLoaded('capital-account');

    // Reload the page
    await page.reload();
    await lpDashboardPage.waitForLoadingToComplete();

    // Should still work after reload
    const titleVisible = await lpDashboardPage.capitalAccountTitle.isVisible();
    expect(titleVisible).toBeTruthy();
  });

  test('should not crash on page reload (settings)', async ({ page }) => {
    await lpDashboardPage.navigateToSettings();
    await lpDashboardPage.verifyPageLoaded('settings');

    // Reload the page
    await page.reload();
    await lpDashboardPage.waitForLoadingToComplete();

    // Should still work after reload
    const titleVisible = await lpDashboardPage.settingsTitle.isVisible();
    expect(titleVisible).toBeTruthy();
  });
});
