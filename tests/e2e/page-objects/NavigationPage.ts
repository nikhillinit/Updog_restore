import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class NavigationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Navigation elements
  get mainNavigation(): Locator {
    return this.page.locator('[data-testid="main-nav"], nav[role="navigation"], .main-navigation').first();
  }

  get fundNameHeader(): Locator {
    return this.page.locator('[data-testid="fund-name"], .fund-name, .header-fund-name, h1, h2').first();
  }

  get dashboardLink(): Locator {
    return this.page.locator('[data-testid="nav-dashboard"], a[href*="dashboard"], :has-text("Dashboard")').first();
  }

  get portfolioLink(): Locator {
    return this.page.locator('[data-testid="nav-portfolio"], a[href*="portfolio"], :has-text("Portfolio")').first();
  }

  get investmentsLink(): Locator {
    return this.page.locator('[data-testid="nav-investments"], a[href*="investments"], :has-text("Investments")').first();
  }

  get analyticsLink(): Locator {
    return this.page.locator('[data-testid="nav-analytics"], a[href*="analytics"], :has-text("Analytics")').first();
  }

  get fundSetupLink(): Locator {
    return this.page.locator('[data-testid="nav-fund-setup"], a[href*="fund-setup"], :has-text("Fund Setup")').first();
  }

  get settingsLink(): Locator {
    return this.page.locator('[data-testid="nav-settings"], a[href*="settings"], :has-text("Settings")').first();
  }

  // Mobile navigation
  get mobileMenuButton(): Locator {
    return this.page.locator('[data-testid="mobile-menu"], .mobile-menu-toggle, .hamburger, button[aria-label*="menu"]').first();
  }

  get mobileMenu(): Locator {
    return this.page.locator('[data-testid="mobile-menu-panel"], .mobile-menu-panel, .mobile-nav').first();
  }

  // User menu
  get userMenuButton(): Locator {
    return this.page.locator('[data-testid="user-menu"], .user-menu, .profile-menu, button[aria-label*="user"]').first();
  }

  get userDropdown(): Locator {
    return this.page.locator('[data-testid="user-dropdown"], .user-dropdown, .profile-dropdown').first();
  }

  get logoutButton(): Locator {
    return this.page.locator('[data-testid="logout"], button:has-text("Logout"), a:has-text("Sign out")').first();
  }

  // Breadcrumbs
  get breadcrumbs(): Locator {
    return this.page.locator('[data-testid="breadcrumbs"], .breadcrumbs, nav[aria-label="Breadcrumb"]').first();
  }

  // Actions
  async navigateToDashboard() {
    await this.dashboardLink.click();
    await this.waitForNavigation();
    await expect(this.page).toHaveURL(/.*dashboard.*/);
  }

  async navigateToPortfolio() {
    await this.portfolioLink.click();
    await this.waitForNavigation();
    await expect(this.page).toHaveURL(/.*portfolio.*/);
  }

  async navigateToInvestments() {
    await this.investmentsLink.click();
    await this.waitForNavigation();
    await expect(this.page).toHaveURL(/.*investments.*/);
  }

  async navigateToAnalytics() {
    await this.analyticsLink.click();
    await this.waitForNavigation();
    await expect(this.page).toHaveURL(/.*analytics.*/);
  }

  async navigateToFundSetup() {
    await this.fundSetupLink.click();
    await this.waitForNavigation();
    await expect(this.page).toHaveURL(/.*fund-setup.*/);
  }

  async navigateToSettings() {
    await this.settingsLink.click();
    await this.waitForNavigation();
    await expect(this.page).toHaveURL(/.*settings.*/);
  }

  async openMobileMenu() {
    await this.mobileMenuButton.click();
    await expect(this.mobileMenu).toBeVisible();
  }

  async closeMobileMenu() {
    // Click outside the menu or on close button
    await this.page.click('body');
    await expect(this.mobileMenu).not.toBeVisible();
  }

  async openUserMenu() {
    await this.userMenuButton.click();
    await expect(this.userDropdown).toBeVisible();
  }

  async logout() {
    await this.openUserMenu();
    await this.logoutButton.click();
    await this.waitForNavigation();
  }

  async verifyActiveNavigation(expectedPath: string) {
    const currentUrl = await this.page.url();
    expect(currentUrl).toContain(expectedPath);
    
    // Check for active navigation state
    const activeNav = this.page.locator('.active, .current, [aria-current="page"]');
    await expect(activeNav).toBeVisible();
  }

  async verifyNavigationAccessibility() {
    // Check that navigation is keyboard accessible
    await this.page.keyboard.press('Tab');
    
    // Verify focus indicators
    const focusedElement = await this.page.locator(':focus');
    await expect(focusedElement).toBeVisible();
    
    // Check ARIA labels
    const navElement = this.mainNavigation;
    const ariaLabel = await navElement.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
  }

  async testResponsiveNavigation() {
    // Test desktop navigation
    await this.page.setViewportSize({ width: 1200, height: 800 });
    await expect(this.mainNavigation).toBeVisible();
    await expect(this.mobileMenuButton).not.toBeVisible();

    // Test mobile navigation
    await this.page.setViewportSize({ width: 375, height: 667 });
    await expect(this.mobileMenuButton).toBeVisible();
    
    // Test mobile menu functionality
    await this.openMobileMenu();
    await expect(this.dashboardLink).toBeVisible();
    await this.closeMobileMenu();
  }
}