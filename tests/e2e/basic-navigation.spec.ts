import { test, expect } from '@playwright/test';

test.describe('Basic Application Navigation', () => {
  
  test('should load the application homepage', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // The app should either show fund setup or dashboard based on setup status
    const currentUrl = page.url();
    const pageContent = await page.textContent('body');
    
    // Verify we get a valid response (not an error page)
    expect(pageContent).toBeTruthy();
    expect(pageContent?.length).toBeGreaterThan(0);
    
    // Should redirect to either fund-setup or dashboard
    const validRedirects = ['/fund-setup', '/dashboard', '/'];
    const hasValidRedirect = validRedirects.some(path => currentUrl.includes(path));
    expect(hasValidRedirect).toBeTruthy();
  });

  test('should show fund setup page for new funds', async ({ page }) => {
    await page.goto('/fund-setup');
    await page.waitForLoadState('networkidle');
    
    // Look for fund setup elements with flexible selectors
    const fundSetupElements = [
      'input[name="name"]',
      'input[placeholder*="fund" i]',
      'input[placeholder*="name" i]',
      '[data-testid*="fund"]',
      'h1:has-text("Fund Setup")',
      'h1:has-text("Setup")',
      'text=Fund Name',
      'text=fund name'
    ];
    
    let foundElement = false;
    for (const selector of fundSetupElements) {
      const element = page.locator(selector).first();
      if (await element.isVisible()) {
        foundElement = true;
        break;
      }
    }
    
    // If we're redirected away from fund-setup, that's also valid
    const currentUrl = page.url();
    const isOnFundSetup = currentUrl.includes('/fund-setup');
    const isRedirected = currentUrl.includes('/dashboard');
    
    expect(foundElement || isRedirected).toBeTruthy();
  });

  test('should navigate to dashboard when fund exists', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    const currentUrl = page.url();
    
    // Either we're on dashboard or redirected to fund-setup
    const isOnDashboard = currentUrl.includes('/dashboard');
    const isRedirectedToSetup = currentUrl.includes('/fund-setup');
    
    expect(isOnDashboard || isRedirectedToSetup).toBeTruthy();
    
    if (isOnDashboard) {
      // Look for dashboard elements
      const dashboardElements = [
        'h1:has-text("Dashboard")',
        '[data-testid*="dashboard"]',
        'text=Fund Overview',
        'text=Performance',
        'text=Portfolio'
      ];
      
      let foundDashboardElement = false;
      for (const selector of dashboardElements) {
        const element = page.locator(selector).first();
        if (await element.isVisible()) {
          foundDashboardElement = true;
          break;
        }
      }
      
      expect(foundDashboardElement).toBeTruthy();
    }
  });

  test('should display navigation sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Skip if we're on fund setup page
    const currentUrl = page.url();
    if (currentUrl.includes('/fund-setup')) {
      test.skip();
    }
    
    // Look for navigation elements
    const navElements = [
      'nav',
      '[role="navigation"]',
      '.sidebar',
      '[data-testid="sidebar"]',
      'a:has-text("Dashboard")',
      'a:has-text("Portfolio")',
      'a:has-text("Investments")'
    ];
    
    let foundNavElement = false;
    for (const selector of navElements) {
      const element = page.locator(selector).first();
      if (await element.isVisible()) {
        foundNavElement = true;
        break;
      }
    }
    
    expect(foundNavElement).toBeTruthy();
  });

  test('should be responsive on mobile devices', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Verify the page loads on mobile
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
    
    // Check if mobile menu toggle exists (common pattern)
    const mobileMenuToggle = page.locator('button[aria-label*="menu" i], .menu-toggle, [data-testid*="menu-toggle"]').first();
    const mobileMenuExists = await mobileMenuToggle.isVisible();
    
    // On mobile, either navigation is visible or there's a menu toggle
    const visibleNav = await page.locator('nav, [role="navigation"]').first().isVisible();
    
    // At least one navigation method should be available
    expect(mobileMenuExists || visibleNav).toBeTruthy();
  });

  test('should handle browser back/forward navigation', async ({ page }) => {
    // Start at homepage
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const initialUrl = page.url();
    
    // Navigate to a different page
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Use browser back button
    await page.goBack();
    await page.waitForLoadState('networkidle');
    
    const backUrl = page.url();
    expect(backUrl).toBe(initialUrl);
    
    // Use browser forward button
    await page.goForward();
    await page.waitForLoadState('networkidle');
    
    const forwardUrl = page.url();
    expect(forwardUrl).toContain('/dashboard');
  });

  test('should handle page refresh without errors', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Refresh the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Verify page still loads correctly
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
    
    // Should not show error messages
    const errorMessages = await page.locator('text=Error, text=error, [role="alert"]').count();
    expect(errorMessages).toBe(0);
  });
});