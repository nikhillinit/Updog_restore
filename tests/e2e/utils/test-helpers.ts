import { Page, expect } from '@playwright/test';

export class TestHelpers {
  /**
   * Wait for all network requests to complete
   */
  static async waitForNetworkIdle(page: Page, timeout = 30000): Promise<void> {
    await page.waitForLoadState('networkidle', { timeout });
  }

  /**
   * Take a timestamped screenshot
   */
  static async takeTimestampedScreenshot(page: Page, name: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({
      path: `test-results/screenshots/${name}-${timestamp}.png`,
      fullPage: true
    });
  }

  /**
   * Wait for element with better error messages
   */
  static async waitForElementSafely(
    page: Page,
    selector: string,
    options: { timeout?: number; visible?: boolean } = {}
  ): Promise<boolean> {
    try {
      const element = page.locator(selector);
      await element.waitFor({
        state: options.visible !== false ? 'visible' : 'attached',
        timeout: options.timeout || 10000
      });
      return true;
    } catch (error) {
      console.log(`Element not found: ${selector}. Error: ${error}`);
      return false;
    }
  }

  /**
   * Retry an action with exponential backoff
   */
  static async retryAction<T>(
    action: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await action();
      } catch (error) {
        lastError = error as Error;
        if (i < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, i);
          console.log(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Fill form field with validation
   */
  static async fillFieldSafely(
    page: Page,
    selector: string,
    value: string,
    options: { validate?: boolean; timeout?: number } = {}
  ): Promise<void> {
    const element = page.locator(selector);
    
    await element.waitFor({ state: 'visible', timeout: options.timeout || 10000 });
    
    // Clear and fill
    await element.clear();
    await element.fill(value);
    
    // Validate if requested
    if (options.validate !== false) {
      const actualValue = await element.inputValue();
      if (actualValue !== value) {
        throw new Error(`Field validation failed. Expected: ${value}, Actual: ${actualValue}`);
      }
    }
  }

  /**
   * Check if element exists without throwing
   */
  static async elementExists(page: Page, selector: string, timeout = 5000): Promise<boolean> {
    try {
      await page.locator(selector).waitFor({ state: 'attached', timeout });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get element text content safely
   */
  static async getTextSafely(page: Page, selector: string, fallback = ''): Promise<string> {
    try {
      const element = page.locator(selector);
      if (await element.isVisible()) {
        return (await element.textContent()) || fallback;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Click element with retry logic
   */
  static async clickSafely(
    page: Page,
    selector: string,
    options: { timeout?: number; force?: boolean } = {}
  ): Promise<boolean> {
    try {
      const element = page.locator(selector);
      await element.waitFor({ state: 'visible', timeout: options.timeout || 10000 });
      
      // Scroll into view if needed
      await element.scrollIntoViewIfNeeded();
      
      await element.click({ force: options.force, timeout: options.timeout });
      return true;
    } catch (error) {
      console.log(`Click failed for ${selector}: ${error}`);
      return false;
    }
  }

  /**
   * Handle authentication state
   */
  static async handleAuthenticationState(page: Page): Promise<'authenticated' | 'unauthenticated' | 'setup-required'> {
    const currentUrl = page.url();
    
    if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
      return 'unauthenticated';
    }
    
    if (currentUrl.includes('/fund-setup')) {
      return 'setup-required';
    }
    
    return 'authenticated';
  }

  /**
   * Measure page performance
   */
  static async measurePagePerformance(page: Page): Promise<{
    loadTime: number;
    domContentLoaded: number;
    firstContentfulPaint: number;
    largestContentfulPaint: number;
  }> {
    const performanceData = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const paintEntries = performance.getEntriesByType('paint');
      
      const fcp = paintEntries.find(entry => entry.name === 'first-contentful-paint')?.startTime || 0;
      
      return {
        loadTime: navigation.loadEventEnd - navigation.fetchStart,
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.fetchStart,
        firstContentfulPaint: fcp,
        largestContentfulPaint: 0 // Will be updated by observer
      };
    });
    
    return performanceData;
  }

  /**
   * Validate form field
   */
  static async validateFormField(
    page: Page,
    selector: string,
    expectedProperties: { required?: boolean; type?: string; pattern?: string }
  ): Promise<void> {
    const element = page.locator(selector);
    await element.waitFor({ state: 'visible' });
    
    if (expectedProperties.required !== undefined) {
      const isRequired = await element.getAttribute('required');
      expect(isRequired !== null).toBe(expectedProperties.required);
    }
    
    if (expectedProperties.type) {
      const type = await element.getAttribute('type');
      expect(type).toBe(expectedProperties.type);
    }
    
    if (expectedProperties.pattern) {
      const pattern = await element.getAttribute('pattern');
      expect(pattern).toBe(expectedProperties.pattern);
    }
  }

  /**
   * Get page load metrics
   */
  static async getPageLoadMetrics(page: Page): Promise<{
    requests: number;
    failedRequests: number;
    totalSize: number;
    loadTime: number;
  }> {
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      
      const totalSize = resources.reduce((sum, resource) => {
        return sum + (resource.transferSize || 0);
      }, 0);
      
      return {
        requests: resources.length,
        failedRequests: 0, // Would need response monitoring
        totalSize,
        loadTime: navigation.loadEventEnd - navigation.fetchStart
      };
    });
    
    return metrics;
  }

  /**
   * Test responsive behavior
   */
  static async testResponsiveBreakpoints(
    page: Page,
    test: () => Promise<void>
  ): Promise<void> {
    const breakpoints = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1200, height: 800 },
      { name: 'large', width: 1920, height: 1080 }
    ];
    
    for (const breakpoint of breakpoints) {
      console.log(`Testing ${breakpoint.name} breakpoint (${breakpoint.width}x${breakpoint.height})`);
      
      await page.setViewportSize({
        width: breakpoint.width,
        height: breakpoint.height
      });
      
      await test();
      
      await TestHelpers.takeTimestampedScreenshot(page, `responsive-${breakpoint.name}`);
    }
  }

  /**
   * Verify no console errors
   */
  static async verifyNoConsoleErrors(page: Page, allowedErrors: string[] = []): Promise<void> {
    const errors: string[] = [];
    
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const errorText = message.text();
        const isAllowed = allowedErrors.some(allowed => errorText.includes(allowed));
        
        if (!isAllowed) {
          errors.push(errorText);
        }
      }
    });
    
    // Give time for any async errors
    await page.waitForTimeout(1000);
    
    if (errors.length > 0) {
      console.log('Console errors detected:', errors);
      expect(errors).toHaveLength(0);
    }
  }

  /**
   * Monitor network requests
   */
  static async monitorNetworkRequests(
    page: Page,
    action: () => Promise<void>
  ): Promise<{
    requests: Array<{
      url: string;
      method: string;
      status: number;
      responseTime: number;
    }>;
  }> {
    const requests: any[] = [];
    
    page.on('request', (request) => {
      requests.push({
        url: request.url(),
        method: request.method(),
        startTime: Date.now()
      });
    });
    
    page.on('response', (response) => {
      const request = requests.find(req => req.url === response.url());
      if (request) {
        request.status = response.status();
        request.responseTime = Date.now() - request.startTime;
      }
    });
    
    await action();
    
    return { requests: requests.filter(req => req.status) };
  }

  /**
   * Skip test if condition not met
   */
  static skipIf(condition: boolean, reason: string): void {
    if (condition) {
      console.log(`Skipping test: ${reason}`);
      // In Playwright, we'll use test.skip() from the calling context
      throw new Error(`SKIP_TEST: ${reason}`);
    }
  }

  /**
   * Generate test data
   */
  static generateTestData() {
    const timestamp = Date.now();
    
    return {
      user: {
        firstName: 'Test',
        lastName: 'User',
        email: `test.user.${timestamp}@example.com`,
        password: 'TestPassword123!'
      },
      fund: {
        name: `Test Fund ${timestamp}`,
        type: 'Venture Capital',
        description: `Test fund created at ${new Date().toISOString()}`,
        vintageYear: new Date().getFullYear().toString(),
        fundSize: '100000000',
        targetFundSize: '150000000',
        managementFee: '2.0',
        carriedInterest: '20.0'
      },
      investment: {
        name: `Test Company ${timestamp}`,
        amount: '5000000',
        sector: 'Technology',
        stage: 'Series A'
      }
    };
  }
}