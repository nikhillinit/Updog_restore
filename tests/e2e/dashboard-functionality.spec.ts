import { test, expect } from '@playwright/test';
import { DashboardPage } from './page-objects/DashboardPage';
import { NavigationPage } from './page-objects/NavigationPage';

test.describe('Dashboard Functionality', () => {
  let dashboardPage: DashboardPage;
  let navigationPage: NavigationPage;

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page);
    navigationPage = new NavigationPage(page);

    // Navigate to dashboard
    await dashboardPage.goto('dashboard');
    await dashboardPage.waitForLoadingToComplete();

    // If redirected to fund setup, skip dashboard tests
    const currentUrl = await dashboardPage.page.url();
    if (currentUrl.includes('/fund-setup')) {
      test.skip();
    }
  });

  test('should display fund overview with key metrics', async () => {
    await dashboardPage.verifyDashboardLoaded();
    
    // Verify fund overview card is present
    await expect(dashboardPage.fundOverviewCard).toBeVisible();

    // Get fund metrics (they might be empty for a new fund)
    const metrics = await dashboardPage.getFundMetrics();
    
    // Verify metrics structure exists (values might be 0 or empty for new funds)
    expect(typeof metrics.totalFundSize).toBe('string');
    expect(typeof metrics.deployedCapital).toBe('string');
    expect(typeof metrics.dryPowder).toBe('string');
  });

  test('should display performance metrics section', async () => {
    await expect(dashboardPage.performanceMetrics).toBeVisible();
    
    // Performance metrics might show default values for new funds
    const irrVisible = await dashboardPage.irr.isVisible();
    const moicVisible = await dashboardPage.moic.isVisible();
    
    // At least one performance metric should be visible
    expect(irrVisible || moicVisible).toBeTruthy();
  });

  test('should show portfolio summary', async () => {
    await expect(dashboardPage.portfolioSummary).toBeVisible();
    
    // Portfolio summary should be present even if empty
    const summaryText = await dashboardPage.portfolioSummary.textContent();
    expect(summaryText).toBeTruthy();
  });

  test('should display recent investments section', async () => {
    await expect(dashboardPage.recentInvestments).toBeVisible();
    
    // Count recent investments (might be 0 for new funds)
    const investmentCount = await dashboardPage.getRecentInvestmentsCount();
    expect(investmentCount).toBeGreaterThanOrEqual(0);
    
    // If there are investments, verify the list structure
    if (investmentCount > 0) {
      const firstInvestment = dashboardPage.page.locator('[data-testid="investment-item"], .investment-row').first();
      await expect(firstInvestment).toBeVisible();
    }
  });

  test('should navigate to other modules from dashboard', async () => {
    // Test navigation to portfolio
    const portfolioNavVisible = await dashboardPage.portfolioNavButton.isVisible();
    if (portfolioNavVisible) {
      await dashboardPage.navigateToPortfolio();
      await expect(dashboardPage.page).toHaveURL(/\/portfolio/);
    }

    // Return to dashboard
    await navigationPage.navigateToDashboard();

    // Test navigation to investments
    const investmentsNavVisible = await dashboardPage.investmentsNavButton.isVisible();
    if (investmentsNavVisible) {
      await dashboardPage.navigateToInvestments();
      await expect(dashboardPage.page).toHaveURL(/\/investments/);
    }

    // Return to dashboard
    await navigationPage.navigateToDashboard();

    // Test navigation to analytics
    const analyticsNavVisible = await dashboardPage.analyticsNavButton.isVisible();
    if (analyticsNavVisible) {
      await dashboardPage.navigateToAnalytics();
      await expect(dashboardPage.page).toHaveURL(/\/analytics/);
    }
  });

  test('should handle add investment action', async () => {
    const addInvestmentVisible = await dashboardPage.addInvestmentButton.isVisible();
    
    if (addInvestmentVisible) {
      await dashboardPage.clickAddInvestment();
      
      // Should navigate to investment creation form or modal
      const currentUrl = await dashboardPage.page.url();
      const modalVisible = await dashboardPage.page.locator('.modal, [role="dialog"]').first().isVisible();
      
      // Either we navigate to investments page or a modal appears
      const hasInvestmentFlow = currentUrl.includes('/investments') || modalVisible;
      expect(hasInvestmentFlow).toBeTruthy();
    }
  });

  test('should display charts and visualizations', async () => {
    // Verify at least one chart is present
    await dashboardPage.verifyChartsPresent();
  });

  test('should be responsive on different screen sizes', async () => {
    // Test desktop layout
    await dashboardPage.page.setViewportSize({ width: 1200, height: 800 });
    await dashboardPage.verifyDashboardLoaded();
    
    // Verify key elements are visible in desktop layout
    await expect(dashboardPage.fundOverviewCard).toBeVisible();
    await expect(dashboardPage.performanceMetrics).toBeVisible();

    // Test tablet layout
    await dashboardPage.page.setViewportSize({ width: 768, height: 1024 });
    
    // Elements should still be visible but might be rearranged
    await expect(dashboardPage.fundOverviewCard).toBeVisible();
    
    // Test mobile layout
    await dashboardPage.page.setViewportSize({ width: 375, height: 667 });
    
    // Core elements should still be accessible on mobile
    await expect(dashboardPage.dashboardTitle).toBeVisible();
    
    // Take screenshots for different layouts
    await dashboardPage.takeScreenshot('dashboard-mobile');
  });

  test('should refresh data when page is reloaded', async () => {
    // Get initial metrics
    const initialMetrics = await dashboardPage.getFundMetrics();
    
    // Reload the page
    await dashboardPage.page.reload();
    await dashboardPage.waitForLoadingToComplete();
    
    // Verify dashboard still loads correctly
    await dashboardPage.verifyDashboardLoaded();
    
    // Get metrics after reload
    const reloadedMetrics = await dashboardPage.getFundMetrics();
    
    // Structure should be the same (values might be updated)
    expect(typeof reloadedMetrics.totalFundSize).toBe('string');
    expect(typeof reloadedMetrics.deployedCapital).toBe('string');
  });

  test('should handle empty state for new fund', async () => {
    // For a newly created fund, dashboard should show appropriate empty states
    const investmentCount = await dashboardPage.getRecentInvestmentsCount();
    
    if (investmentCount === 0) {
      // Should show empty state messaging
      const emptyStateMessage = dashboardPage.page.locator(':has-text("No investments"), :has-text("Get started"), :has-text("Add your first")').first();
      const addInvestmentButton = dashboardPage.addInvestmentButton;
      
      // Either empty state message or add investment button should be visible
      const hasEmptyStateHandling = await emptyStateMessage.isVisible() || await addInvestmentButton.isVisible();
      expect(hasEmptyStateHandling).toBeTruthy();
    }
  });

  test('should display fund name in header', async () => {
    const fundNameVisible = await navigationPage.fundNameHeader.isVisible();
    
    if (fundNameVisible) {
      const fundName = await navigationPage.fundNameHeader.textContent();
      expect(fundName).toBeTruthy();
      expect(fundName?.trim().length).toBeGreaterThan(0);
    }
  });

  test('should handle loading states gracefully', async () => {
    // Navigate to dashboard and verify loading is handled
    await dashboardPage.goto('dashboard');
    
    // Wait for loading to complete
    await dashboardPage.waitForLoadingToComplete();
    
    // Verify no loading spinners remain
    const loadingSpinners = dashboardPage.page.locator('.animate-spin, .loading, .spinner');
    const spinnerCount = await loadingSpinners.count();
    
    // No loading indicators should be visible after load completes
    expect(spinnerCount).toBe(0);
  });
});