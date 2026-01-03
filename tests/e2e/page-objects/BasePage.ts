import type { Page, Locator } from '@playwright/test';

export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(path: string = '') {
    await this.page.goto(`/${path}`);
  }

  async waitForLoadingToComplete() {
    // Wait for any loading spinners to disappear
    await this.page.waitForSelector('.animate-spin', { state: 'detached', timeout: 30000 });
  }

  async getPageTitle(): Promise<string> {
    return await this.page.title();
  }

  async takeScreenshot(name: string) {
    await this.page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
  }

  // Common navigation elements
  get sidebar(): Locator {
    return this.page.locator('[data-testid="sidebar"], nav[role="navigation"]').first();
  }

  get header(): Locator {
    return this.page.locator('[data-testid="header"], header').first();
  }

  // Wait for navigation to complete
  async waitForNavigation() {
    await this.page.waitForLoadState('networkidle');
  }
}