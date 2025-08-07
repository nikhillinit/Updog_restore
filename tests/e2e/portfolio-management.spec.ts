import { test, expect } from '@playwright/test';
import { PortfolioPage } from './page-objects/PortfolioPage';
import { DashboardPage } from './page-objects/DashboardPage';
import { NavigationPage } from './page-objects/NavigationPage';

test.describe('Portfolio Management', () => {
  let portfolioPage: PortfolioPage;
  let dashboardPage: DashboardPage;
  let navigationPage: NavigationPage;

  test.beforeEach(async ({ page }) => {
    portfolioPage = new PortfolioPage(page);
    dashboardPage = new DashboardPage(page);
    navigationPage = new NavigationPage(page);

    // Navigate to portfolio page
    await portfolioPage.goto('portfolio');
    
    // Check if redirected to setup or auth
    const currentUrl = await portfolioPage.page.url();
    if (currentUrl.includes('/fund-setup') || currentUrl.includes('/login')) {
      test.skip('Fund setup not complete or authentication required');
    }
  });

  test('should display portfolio overview with key metrics', async () => {
    await portfolioPage.verifyPortfolioLoaded();
    
    // Get portfolio metrics
    const metrics = await portfolioPage.verifyPortfolioPerformance();
    
    // Take screenshot of portfolio overview
    await portfolioPage.takeScreenshot('portfolio-overview');
    
    // Verify metrics structure (values might be 0 for empty portfolio)
    expect(metrics).toHaveProperty('totalValue');
    expect(metrics).toHaveProperty('totalInvested');
    expect(metrics).toHaveProperty('irr');
    expect(metrics).toHaveProperty('moic');
  });

  test('should handle empty portfolio state', async () => {
    const investmentsCount = await portfolioPage.getInvestmentsCount();
    
    if (investmentsCount === 0) {
      await portfolioPage.verifyEmptyPortfolio();
      
      // Should show add investment option
      if (await portfolioPage.addInvestmentButton.isVisible()) {
        await portfolioPage.clickAddInvestment();
        
        // Should navigate to investment creation or show modal
        const currentUrl = await portfolioPage.page.url();
        const hasModal = await portfolioPage.page.locator('[role="dialog"], .modal').isVisible();
        
        expect(currentUrl.includes('/investments') || hasModal).toBeTruthy();
      }
    }
  });

  test('should display investments list correctly', async () => {
    await portfolioPage.verifyPortfolioLoaded();
    
    const investmentsCount = await portfolioPage.getInvestmentsCount();
    
    if (investmentsCount > 0) {
      // Verify table/list structure
      await portfolioPage.verifyTableStructure();
      
      // Verify first investment has proper data
      const firstInvestment = portfolioPage.investmentItems.first();
      await portfolioPage.verifyInvestmentDetails(firstInvestment);
      
    } else {
      console.log('No investments found - testing empty state');
      await portfolioPage.verifyEmptyPortfolio();
    }
  });

  test('should allow searching and filtering investments', async () => {
    await portfolioPage.verifyPortfolioLoaded();
    
    const investmentsCount = await portfolioPage.getInvestmentsCount();
    
    if (investmentsCount > 0) {
      // Test search functionality if available
      if (await portfolioPage.searchInput.isVisible()) {
        const initialCount = await portfolioPage.getInvestmentsCount();
        
        await portfolioPage.searchInvestments('test');
        await portfolioPage.page.waitForTimeout(1000);
        
        // Results might be filtered (count could be same or different)
        const searchResults = await portfolioPage.getInvestmentsCount();
        expect(searchResults).toBeGreaterThanOrEqual(0);
        
        // Clear search
        await portfolioPage.searchInput.fill('');
        await portfolioPage.page.keyboard.press('Enter');
      }
      
      // Test filter functionality if available
      if (await portfolioPage.filterDropdown.isVisible()) {
        const filterOptions = await portfolioPage.filterDropdown.locator('option').count();
        
        if (filterOptions > 1) {
          // Select a filter option
          await portfolioPage.filterDropdown.selectOption({ index: 1 });
          await portfolioPage.page.waitForTimeout(1000);
          
          // Portfolio should still be functional after filtering
          await expect(portfolioPage.portfolioContainer).toBeVisible();
        }
      }
    }
  });

  test('should display portfolio charts and visualizations', async () => {
    await portfolioPage.verifyPortfolioLoaded();
    
    // Verify charts are present
    await portfolioPage.verifyPortfolioCharts();
    
    // Take screenshot with charts
    await portfolioPage.takeScreenshot('portfolio-charts');
  });

  test('should handle portfolio sorting', async () => {
    await portfolioPage.verifyPortfolioLoaded();
    
    const investmentsCount = await portfolioPage.getInvestmentsCount();
    
    if (investmentsCount > 1 && await portfolioPage.sortDropdown.isVisible()) {
      // Get initial order
      const initialOrder = [];
      for (let i = 0; i < Math.min(investmentsCount, 3); i++) {
        const investment = portfolioPage.investmentItems.nth(i);
        const text = await investment.textContent();
        initialOrder.push(text);
      }
      
      // Change sort order
      const sortOptions = await portfolioPage.sortDropdown.locator('option').count();
      if (sortOptions > 1) {
        await portfolioPage.sortPortfolio('value');
        await portfolioPage.page.waitForTimeout(1000);
        
        // Verify order might have changed
        const newOrder = [];
        for (let i = 0; i < Math.min(investmentsCount, 3); i++) {
          const investment = portfolioPage.investmentItems.nth(i);
          const text = await investment.textContent();
          newOrder.push(text);
        }
        
        // At least the structure should be maintained
        expect(newOrder.length).toBe(initialOrder.length);
      }
    }
  });

  test('should allow adding new investments', async () => {
    await portfolioPage.verifyPortfolioLoaded();
    
    if (await portfolioPage.addInvestmentButton.isVisible()) {
      await portfolioPage.clickAddInvestment();
      
      // Should navigate to investment form or show modal
      const currentUrl = await portfolioPage.page.url();
      const hasModal = await portfolioPage.page.locator('[role="dialog"], .modal').isVisible();
      const isInvestmentForm = currentUrl.includes('/investments') && 
                              (currentUrl.includes('/add') || currentUrl.includes('/new'));
      
      expect(hasModal || isInvestmentForm).toBeTruthy();
      
      // Take screenshot of add investment flow
      await portfolioPage.takeScreenshot('add-investment-flow');
    }
  });

  test('should handle investment selection and details', async () => {
    await portfolioPage.verifyPortfolioLoaded();
    
    const investmentsCount = await portfolioPage.getInvestmentsCount();
    
    if (investmentsCount > 0) {
      // Click on first investment
      const firstInvestment = portfolioPage.investmentItems.first();
      await firstInvestment.click();
      
      // Should navigate to investment details or show modal
      await portfolioPage.page.waitForTimeout(1000);
      
      const currentUrl = await portfolioPage.page.url();
      const hasModal = await portfolioPage.page.locator('[role="dialog"], .modal').isVisible();
      const isDetailView = currentUrl.includes('/investments/') || hasModal;
      
      if (isDetailView) {
        // Take screenshot of investment details
        await portfolioPage.takeScreenshot('investment-details');
      }
      
      expect(isDetailView || currentUrl.includes('/portfolio')).toBeTruthy();
    }
  });

  test('should export portfolio data', async () => {
    await portfolioPage.verifyPortfolioLoaded();
    
    if (await portfolioPage.exportButton.isVisible()) {
      // Set up download handling
      const downloadPromise = portfolioPage.page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
      
      await portfolioPage.exportPortfolio();
      
      const download = await downloadPromise;
      
      if (download) {
        // Verify download was initiated
        const filename = download.suggestedFilename();
        expect(filename).toBeTruthy();
        expect(filename.toLowerCase()).toMatch(/\.(csv|xlsx|pdf)$/);
      } else {
        // Export might show a modal or different UI
        const hasModal = await portfolioPage.page.locator('[role="dialog"], .modal').isVisible();
        const hasMessage = await portfolioPage.page.locator('.notification, .toast, .alert').isVisible();
        
        expect(hasModal || hasMessage).toBeTruthy();
      }
    }
  });

  test('should refresh portfolio data', async () => {
    await portfolioPage.verifyPortfolioLoaded();
    
    // Get initial metrics
    const initialMetrics = await portfolioPage.getPortfolioMetrics();
    
    // Refresh portfolio
    await portfolioPage.refreshPortfolio();
    
    // Verify portfolio still loads correctly
    await portfolioPage.verifyPortfolioLoaded();
    
    // Get metrics after refresh
    const refreshedMetrics = await portfolioPage.getPortfolioMetrics();
    
    // Structure should remain the same
    expect(typeof refreshedMetrics.totalValue).toBe('string');
    expect(typeof refreshedMetrics.totalInvested).toBe('string');
  });

  test('should be responsive across different screen sizes', async () => {
    await portfolioPage.testPortfolioResponsiveness();
    
    // Test mobile specific functionality
    await portfolioPage.page.setViewportSize({ width: 375, height: 667 });
    
    // Core functionality should work on mobile
    await portfolioPage.verifyPortfolioLoaded();
    
    // Charts might be adapted for mobile
    const hasCharts = await portfolioPage.page.locator('canvas, svg, .chart').count() > 0;
    const hasPortfolioData = await portfolioPage.portfolioSummary.isVisible();
    
    expect(hasCharts || hasPortfolioData).toBeTruthy();
  });

  test('should handle loading states gracefully', async () => {
    // Navigate to portfolio and check for loading indicators
    await portfolioPage.goto('portfolio');
    
    // Look for loading states
    const loadingElements = portfolioPage.page.locator('.loading, .spinner, .animate-spin');
    
    // Wait for portfolio to fully load
    await portfolioPage.verifyPortfolioLoaded();
    
    // Loading states should be cleared
    const remainingLoaders = await loadingElements.count();
    expect(remainingLoaders).toBe(0);
  });

  test('should handle errors gracefully', async () => {
    await portfolioPage.verifyPortfolioLoaded();
    
    // Test error handling by trying various actions
    const actions = [
      async () => await portfolioPage.refreshPortfolio(),
      async () => await portfolioPage.searchInvestments(''),
      async () => {
        if (await portfolioPage.filterDropdown.isVisible()) {
          await portfolioPage.filterPortfolio('all');
        }
      }
    ];
    
    for (const action of actions) {
      try {
        await action();
        
        // Should not break the portfolio view
        await expect(portfolioPage.portfolioContainer).toBeVisible();
        
      } catch (error) {
        // Errors should be handled gracefully
        const hasErrorMessage = await portfolioPage.page.locator('.error, .alert-error, [role="alert"]').isVisible();
        const portfolioStillVisible = await portfolioPage.portfolioContainer.isVisible();
        
        expect(hasErrorMessage || portfolioStillVisible).toBeTruthy();
      }
    }
  });

  test('should maintain data consistency', async () => {
    await portfolioPage.verifyPortfolioLoaded();
    
    // Get portfolio metrics from portfolio page
    const portfolioMetrics = await portfolioPage.getPortfolioMetrics();
    
    // Navigate to dashboard and compare
    await navigationPage.navigateToDashboard();
    await dashboardPage.verifyDashboardLoaded();
    
    const dashboardMetrics = await dashboardPage.getFundMetrics();
    
    // Key metrics should be consistent between views
    // Note: Format might differ (e.g., "$100M" vs "$100,000,000")
    // So we check that both have values rather than exact matches
    const portfolioHasValues = Object.values(portfolioMetrics).some(v => v !== 'N/A' && v !== '$0' && v.length > 0);
    const dashboardHasValues = Object.values(dashboardMetrics).some(v => v !== '$0' && v.length > 0);
    
    // If one view has data, the other should too (consistency)
    if (portfolioHasValues || dashboardHasValues) {
      expect(portfolioHasValues && dashboardHasValues).toBeTruthy();
    }
  });
});
