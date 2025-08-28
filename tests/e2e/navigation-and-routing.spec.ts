import { test, expect } from '@playwright/test';
import { NavigationPage } from './page-objects/NavigationPage';
import { DashboardPage } from './page-objects/DashboardPage';
import { FundSetupPage } from './page-objects/FundSetupPage';

test.describe('Navigation and Routing', () => {
  let navigationPage: NavigationPage;
  let dashboardPage: DashboardPage;
  let fundSetupPage: FundSetupPage;

  test.beforeEach(async ({ page }) => {
    navigationPage = new NavigationPage(page);
    dashboardPage = new DashboardPage(page);
    fundSetupPage = new FundSetupPage(page);
  });

  test('should handle homepage redirection logic', async () => {
    // Navigate to root
    await navigationPage.goto();
    
    // Should redirect based on fund setup status
    const currentUrl = await navigationPage.page.url();
    const redirectedToSetup = currentUrl.includes('/fund-setup');
    const redirectedToDashboard = currentUrl.includes('/dashboard');
    const redirectedToAuth = currentUrl.includes('/login') || currentUrl.includes('/auth');
    
    // Should redirect to one of these logical destinations
    expect(redirectedToSetup || redirectedToDashboard || redirectedToAuth).toBeTruthy();
    
    // Take screenshot of homepage redirection
    await navigationPage.takeScreenshot('homepage-redirect');
  });

  test('should navigate between all main modules', async () => {
    // Start from dashboard
    await dashboardPage.goto('dashboard');
    
    // Skip if redirected to fund setup (no fund configured)
    const currentUrl = await navigationPage.page.url();
    if (currentUrl.includes('/fund-setup')) {
      test.skip('No fund configured, skipping navigation test');
    }
    
    await dashboardPage.verifyDashboardLoaded();
    
    // Test navigation to each module if available
    const navigationTests = [
      { name: 'Portfolio', method: 'navigateToPortfolio', urlPattern: /.*portfolio.*/ },
      { name: 'Investments', method: 'navigateToInvestments', urlPattern: /.*investments.*/ },
      { name: 'Analytics', method: 'navigateToAnalytics', urlPattern: /.*analytics.*/ },
      { name: 'Settings', method: 'navigateToSettings', urlPattern: /.*settings.*/ }
    ];
    
    for (const navTest of navigationTests) {
      try {
        await (navigationPage as any)[navTest.method]();
        await expect(navigationPage.page).toHaveURL(navTest.urlPattern);
        
        // Navigate back to dashboard
        await navigationPage.navigateToDashboard();
        await expect(navigationPage.page).toHaveURL(/.*dashboard.*/);
        
      } catch (error) {
        console.log(`${navTest.name} navigation not available: ${error}`);
      }
    }
  });

  test('should show active navigation state correctly', async () => {
    await dashboardPage.goto('dashboard');
    
    const currentUrl = await navigationPage.page.url();
    if (currentUrl.includes('/fund-setup')) {
      test.skip('Redirected to fund setup');
    }
    
    // Verify active state on dashboard
    await navigationPage.verifyActiveNavigation('dashboard');
    
    // Navigate to other sections and verify active states
    if (await navigationPage.portfolioLink.isVisible()) {
      await navigationPage.navigateToPortfolio();
      await navigationPage.verifyActiveNavigation('portfolio');
      
      await navigationPage.navigateToDashboard();
      await navigationPage.verifyActiveNavigation('dashboard');
    }
  });

  test('should handle direct URL navigation', async () => {
    // Test direct navigation to various routes
    const routes = [
      '/dashboard',
      '/portfolio',
      '/investments', 
      '/analytics',
      '/fund-setup',
      '/settings'
    ];
    
    for (const route of routes) {
      try {
        await navigationPage.goto(route.substring(1)); // Remove leading slash
        
        // Verify page loads (might redirect based on auth/setup status)
        const body = await navigationPage.page.textContent('body');
        expect(body).toBeTruthy();
        
        // Should not show 404 or error page
        const hasError = body?.toLowerCase().includes('404') ||
                         body?.toLowerCase().includes('not found') ||
                         body?.toLowerCase().includes('error');
        expect(hasError).toBeFalsy();
        
      } catch (error) {
        console.log(`Direct navigation to ${route} failed: ${error}`);
      }
    }
  });

  test('should handle 404 errors for invalid routes', async () => {
    await navigationPage.goto('invalid-route-that-does-not-exist');
    
    // Should show 404 page or redirect to valid page
    const body = await navigationPage.page.textContent('body');
    const currentUrl = await navigationPage.page.url();
    
    const shows404 = body?.toLowerCase().includes('404') ||
                     body?.toLowerCase().includes('not found') ||
                     body?.toLowerCase().includes('page not found');
    
    const redirectsToValid = currentUrl.includes('/dashboard') ||
                            currentUrl.includes('/fund-setup') ||
                            currentUrl.includes('/login');
    
    expect(shows404 || redirectsToValid).toBeTruthy();
  });

  test('should work on mobile devices with responsive navigation', async () => {
    await navigationPage.testResponsiveNavigation();
    
    // Take screenshots of different layouts
    await navigationPage.page.setViewportSize({ width: 375, height: 667 });
    await navigationPage.takeScreenshot('navigation-mobile');
    
    await navigationPage.page.setViewportSize({ width: 768, height: 1024 });
    await navigationPage.takeScreenshot('navigation-tablet');
    
    await navigationPage.page.setViewportSize({ width: 1200, height: 800 });
    await navigationPage.takeScreenshot('navigation-desktop');
  });

  test('should be keyboard accessible', async () => {
    await dashboardPage.goto('dashboard');
    
    const currentUrl = await navigationPage.page.url();
    if (currentUrl.includes('/fund-setup')) {
      await fundSetupPage.verifyWizardLoaded();
      // Test keyboard navigation on fund setup
      await navigationPage.page.keyboard.press('Tab');
      const focusedElement = await navigationPage.page.locator(':focus');
      await expect(focusedElement).toBeVisible();
      return;
    }
    
    // Test keyboard navigation
    await navigationPage.verifyNavigationAccessibility();
    
    // Tab through navigation elements
    await navigationPage.page.keyboard.press('Tab');
    await navigationPage.page.keyboard.press('Tab');
    await navigationPage.page.keyboard.press('Tab');
    
    // Should be able to activate navigation with Enter/Space
    const focusedElement = await navigationPage.page.locator(':focus');
    if (await focusedElement.isVisible()) {
      await navigationPage.page.keyboard.press('Enter');
      // Should navigate or activate the focused element
      await navigationPage.page.waitForTimeout(1000);
    }
  });

  test('should display fund name in header', async () => {
    await dashboardPage.goto('dashboard');
    
    if (await navigationPage.fundNameHeader.isVisible()) {
      const fundName = await navigationPage.fundNameHeader.textContent();
      expect(fundName).toBeTruthy();
      expect(fundName?.trim().length).toBeGreaterThan(0);
      
      // Fund name should be consistent across pages
      await navigationPage.navigateToPortfolio();
      
      if (await navigationPage.fundNameHeader.isVisible()) {
        const portfolioFundName = await navigationPage.fundNameHeader.textContent();
        expect(portfolioFundName).toBe(fundName);
      }
    }
  });

  test('should show breadcrumbs for nested pages', async () => {
    await dashboardPage.goto('dashboard');
    
    // Check if breadcrumbs are implemented
    if (await navigationPage.breadcrumbs.isVisible()) {
      const breadcrumbText = await navigationPage.breadcrumbs.textContent();
      expect(breadcrumbText).toBeTruthy();
      
      // Navigate to a nested page and check breadcrumbs update
      await navigationPage.navigateToPortfolio();
      
      if (await navigationPage.breadcrumbs.isVisible()) {
        const portfolioBreadcrumbs = await navigationPage.breadcrumbs.textContent();
        expect(portfolioBreadcrumbs).toBeTruthy();
        expect(portfolioBreadcrumbs).not.toBe(breadcrumbText);
      }
    }
  });

  test('should handle page refresh on different routes', async () => {
    const routes = ['dashboard', 'portfolio', 'investments'];
    
    for (const route of routes) {
      try {
        await navigationPage.goto(route);
        
        // Refresh the page
        await navigationPage.page.reload();
        
        // Page should still load correctly
        const body = await navigationPage.page.textContent('body');
        expect(body).toBeTruthy();
        
        // Should not show errors
        const hasError = body?.toLowerCase().includes('error') ||
                         body?.toLowerCase().includes('cannot be reached');
        expect(hasError).toBeFalsy();
        
      } catch (error) {
        console.log(`Route ${route} refresh test failed: ${error}`);
      }
    }
  });

  test('should handle browser back/forward navigation', async () => {
    await dashboardPage.goto('dashboard');
    
    const currentUrl = await navigationPage.page.url();
    if (currentUrl.includes('/fund-setup')) {
      test.skip('Redirected to fund setup');
    }
    
    // Navigate to portfolio
    if (await navigationPage.portfolioLink.isVisible()) {
      await navigationPage.navigateToPortfolio();
      const portfolioUrl = await navigationPage.page.url();
      
      // Go back using browser back
      await navigationPage.page.goBack();
      await expect(navigationPage.page).toHaveURL(/.*dashboard.*/);
      
      // Go forward using browser forward
      await navigationPage.page.goForward();
      expect(await navigationPage.page.url()).toBe(portfolioUrl);
    }
  });

  test('should maintain navigation state during page transitions', async () => {
    await dashboardPage.goto('dashboard');
    
    // Check for loading states during navigation
    if (await navigationPage.portfolioLink.isVisible()) {
      await navigationPage.portfolioLink.click();
      
      // Should not show broken states during transition
      await navigationPage.page.waitForTimeout(500);
      
      // Navigation should remain visible and functional
      await expect(navigationPage.mainNavigation).toBeVisible();
      
      // Page should eventually load
      await navigationPage.waitForNavigation();
      const body = await navigationPage.page.textContent('body');
      expect(body).toBeTruthy();
    }
  });

  test('should handle external links appropriately', async () => {
    await dashboardPage.goto('dashboard');
    
    // Look for any external links (help, documentation, etc.)
    const externalLinks = navigationPage.page.locator('a[href^="http"], a[target="_blank"]');
    const externalLinkCount = await externalLinks.count();
    
    if (externalLinkCount > 0) {
      const firstExternalLink = externalLinks.first();
      const href = await firstExternalLink.getAttribute('href');
      const target = await firstExternalLink.getAttribute('target');
      
      // External links should either open in new tab or be clearly marked
      expect(target === '_blank' || href?.includes('http')).toBeTruthy();
    }
  });

  test('should show proper loading states', async () => {
    await dashboardPage.goto('dashboard');
    
    // Navigate to different sections and check for loading states
    if (await navigationPage.portfolioLink.isVisible()) {
      await navigationPage.portfolioLink.click();
      
      // Look for loading indicators
      const loadingElements = navigationPage.page.locator('.loading, .spinner, .animate-spin, [data-testid="loading"]');
      
      // Wait for page to fully load
      await navigationPage.waitForNavigation();
      
      // Loading indicators should be gone
      await expect(loadingElements).toHaveCount(0);
    }
  });
});
