import { mapAsync } from "../../client/src/lib";
import { test, expect } from '@playwright/test';

test.describe('Performance Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Enable performance metrics collection
    await page.coverage.startJSCoverage();
    await page.coverage.startCSSCoverage();
  });

  test.afterEach(async ({ page }) => {
    // Stop coverage collection
    await page.coverage.stopJSCoverage();
    await page.coverage.stopCSSCoverage();
  });

  test('should load homepage within performance budget', async ({ page }) => {
    // Start performance measurement
    const startTime = Date.now();
    
    await page.goto('/', { waitUntil: 'networkidle' });
    
    const loadTime = Date.now() - startTime;
    
    // Page should load within 5 seconds (generous for E2E)
    expect(loadTime).toBeLessThan(5000);
    
    // Take screenshot for performance documentation
    await page.screenshot({ 
      path: 'test-results/performance-homepage.png',
      fullPage: true 
    });
    
    console.log(`Homepage load time: ${loadTime}ms`);
  });

  test('should load dashboard within performance budget', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    
    const loadTime = Date.now() - startTime;
    const currentUrl = await page.url();
    
    // Skip if redirected
    if (currentUrl.includes('/login') || currentUrl.includes('/fund-setup')) {
      test.skip('Redirected to different page');
    }
    
    // Dashboard should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
    
    console.log(`Dashboard load time: ${loadTime}ms`);
  });

  test('should have acceptable Core Web Vitals', async ({ page }) => {
    await page.goto('/dashboard');
    
    const currentUrl = await page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/fund-setup')) {
      test.skip('Redirected to different page');
    }
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    
    // Measure Core Web Vitals
    const vitals = await page.evaluate(() => {
      return new Promise((resolve) => {
        const metrics = {
          fcp: 0, // First Contentful Paint
          lcp: 0, // Largest Contentful Paint  
          cls: 0, // Cumulative Layout Shift
          fid: 0  // First Input Delay
        };
        
        // Use Performance Observer if available
        if ('PerformanceObserver' in window) {
          try {
            // Measure LCP
            const lcpObserver = new PerformanceObserver((list) => {
              const entries = list.getEntries();
              const lastEntry = entries[entries.length - 1];
              if (lastEntry) {
                metrics.lcp = lastEntry.startTime;
              }
            });
            lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
            
            // Measure CLS
            let clsValue = 0;
            const clsObserver = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                if (!entry.hadRecentInput) {
                  clsValue += entry.value;
                }
              }
              metrics.cls = clsValue;
            });
            clsObserver.observe({ entryTypes: ['layout-shift'] });
            
            setTimeout(() => {
              resolve(metrics);
            }, 2000);
            
          } catch (error) {
            resolve(metrics);
          }
        } else {
          // Fallback to basic timing
          const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          if (navigation) {
            metrics.fcp = navigation.domContentLoadedEventEnd - navigation.fetchStart;
            metrics.lcp = navigation.loadEventEnd - navigation.fetchStart;
          }
          resolve(metrics);
        }
      });
    });
    
    console.log('Core Web Vitals:', vitals);
    
    // Assert reasonable performance (generous limits for E2E)
    if (vitals.lcp > 0) {
      expect(vitals.lcp).toBeLessThan(4000); // LCP < 4s
    }
    if (vitals.cls > 0) {
      expect(vitals.cls).toBeLessThan(0.25); // CLS < 0.25
    }
  });

  test('should not have memory leaks on navigation', async ({ page }) => {
    await page.goto('/dashboard');
    
    const currentUrl = await page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/fund-setup')) {
      test.skip('Redirected to different page');
    }
    
    // Get initial memory usage
    const initialMemory = await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });
    
    // Navigate between pages multiple times
    const navigationRoutes = ['/portfolio', '/investments', '/dashboard'];
    
    for (let i = 0; i < 3; i++) {
      for (const route of navigationRoutes) {
        try {
          await page.goto(route, { timeout: 10000 });
          await page.waitForTimeout(1000);
        } catch (error) {
          // Route might not exist, continue
          console.log(`Navigation to ${route} failed: ${error}`);
        }
      }
    }
    
    // Force garbage collection if possible
    await page.evaluate(() => {
      if (window.gc) {
        window.gc();
      }
    });
    
    // Get final memory usage
    const finalMemory = await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });
    
    console.log(`Memory usage - Initial: ${initialMemory}, Final: ${finalMemory}`);
    
    // Memory growth should be reasonable (less than 50MB increase)
    if (initialMemory > 0 && finalMemory > 0) {
      const memoryGrowth = finalMemory - initialMemory;
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // 50MB
    }
  });

  test('should handle large data sets efficiently', async ({ page }) => {
    await page.goto('/portfolio');
    
    const currentUrl = await page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/fund-setup')) {
      test.skip('Redirected to different page');
    }
    
    // Wait for initial load
    await page.waitForLoadState('networkidle');
    
    const startTime = Date.now();
    
    // Test scrolling performance (if there's a scrollable list)
    const scrollableElements = await page.locator('.portfolio-list, .investments-table, [role="table"]').all();
    
    if (scrollableElements.length > 0) {
      const element = scrollableElements[0];
      
      // Scroll multiple times to test performance
      for (let i = 0; i < 5; i++) {
        await element.scrollIntoView();
        await page.mouse.wheel(0, 500);
        await page.waitForTimeout(100);
      }
    } else {
      // Test general page scrolling
      for (let i = 0; i < 5; i++) {
        await page.mouse.wheel(0, 500);
        await page.waitForTimeout(100);
      }
    }
    
    const scrollTime = Date.now() - startTime;
    
    // Scrolling should be smooth (total time reasonable)
    expect(scrollTime).toBeLessThan(2000);
    
    console.log(`Scrolling performance: ${scrollTime}ms`);
  });

  test('should load images efficiently', async ({ page }) => {
    await page.goto('/dashboard');
    
    const currentUrl = await page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/fund-setup')) {
      test.skip('Redirected to different page');
    }
    
    // Wait for page load
    await page.waitForLoadState('networkidle');
    
    // Check for images
    const images = await page.locator('img').all();
    
    if (images.length > 0) {
      // Measure image load performance
      const imageLoadTimes = await Promise.all(
        await mapAsync(images, async (img) => {
          const startTime = Date.now();
          
          try {
            await img.waitFor({ state: 'visible', timeout: 5000 });
            
            // Check if image is actually loaded
            const isLoaded = await img.evaluate((el: HTMLImageElement) => {
              return el.complete && el.naturalWidth > 0;
            });
            
            const loadTime = Date.now() - startTime;
            
            return { loaded: isLoaded, time: loadTime };
          } catch {
            return { loaded: false, time: 5000 };
          }
        })
      );
      
      // Most images should load quickly
      const successfulLoads = imageLoadTimes.filter(result => result.loaded);
      const avgLoadTime = successfulLoads.reduce((sum, result) => sum + result.time, 0) / successfulLoads.length;
      
      if (successfulLoads.length > 0) {
        expect(avgLoadTime).toBeLessThan(3000); // Average < 3s per image
      }
      
      console.log(`Image load performance - Count: ${images.length}, Avg time: ${avgLoadTime}ms`);
    }
  });

  test('should have efficient bundle size', async ({ page }) => {
    // Monitor network requests during page load
    const responses: any[] = [];
    
    page.on('response', (response) => {
      responses.push({
        url: response.url(),
        size: response.headers()['content-length'],
        type: response.headers()['content-type']
      });
    });
    
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    
    // Analyze JavaScript bundle sizes
    const jsResponses = responses.filter(r => r.type?.includes('javascript') || r.url.endsWith('.js'));
    const cssResponses = responses.filter(r => r.type?.includes('css') || r.url.endsWith('.css'));
    
    const totalJSSize = jsResponses.reduce((sum, response) => {
      const size = parseInt(response.size || '0');
      return sum + (isNaN(size) ? 0 : size);
    }, 0);
    
    const totalCSSSize = cssResponses.reduce((sum, response) => {
      const size = parseInt(response.size || '0');
      return sum + (isNaN(size) ? 0 : size);
    }, 0);
    
    console.log(`Bundle sizes - JS: ${totalJSSize} bytes, CSS: ${totalCSSSize} bytes`);
    
    // Bundle sizes should be reasonable (2MB total limit for E2E)
    expect(totalJSSize + totalCSSSize).toBeLessThan(2 * 1024 * 1024);
    
    // Individual JS files shouldn't be too large
    jsResponses.forEach(response => {
      const size = parseInt(response.size || '0');
      if (!isNaN(size) && size > 0) {
        expect(size).toBeLessThan(1024 * 1024); // 1MB per file
      }
    });
  });

  test('should handle concurrent requests efficiently', async ({ page }) => {
    await page.goto('/dashboard');
    
    const currentUrl = await page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/fund-setup')) {
      test.skip('Redirected to different page');
    }
    
    // Wait for initial load
    await page.waitForLoadState('networkidle');
    
    const startTime = Date.now();
    
    // Trigger multiple actions that might cause API requests
    const actions = [
      async () => {
        const refreshBtn = page.locator('button[aria-label*="refresh" i], .refresh-btn').first();
        if (await refreshBtn.isVisible()) {
          await refreshBtn.click();
        }
      },
      async () => {
        // Navigate to portfolio and back
        try {
          await page.goto('/portfolio', { timeout: 5000 });
          await page.waitForTimeout(500);
          await page.goto('/dashboard', { timeout: 5000 });
        } catch (error) {
          console.log('Navigation test failed:', error);
        }
      }
    ];
    
    // Execute actions concurrently
    await Promise.all(actions.map(action => action().catch(() => {})));
    
    const totalTime = Date.now() - startTime;
    
    // Concurrent operations should complete reasonably quickly
    expect(totalTime).toBeLessThan(10000); // 10 seconds total
    
    console.log(`Concurrent operations time: ${totalTime}ms`);
  });

  test('should maintain performance under load simulation', async ({ page }) => {
    await page.goto('/dashboard');
    
    const currentUrl = await page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/fund-setup')) {
      test.skip('Redirected to different page');
    }
    
    // Simulate user interactions rapidly
    const startTime = Date.now();
    const interactions = [];
    
    // Rapid clicking and scrolling
    for (let i = 0; i < 10; i++) {
      interactions.push(
        page.mouse.wheel(0, 200).catch(() => {}),
        page.mouse.move(100 + i * 10, 100 + i * 10).catch(() => {}),
        page.keyboard.press('Tab').catch(() => {})
      );
    }
    
    await Promise.all(interactions);
    
    const interactionTime = Date.now() - startTime;
    
    // Page should remain responsive during rapid interactions
    expect(interactionTime).toBeLessThan(5000);
    
    // Check if page is still functional
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    
    console.log(`Load simulation time: ${interactionTime}ms`);
  });

  test('should cache resources effectively', async ({ page }) => {
    // First visit
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    
    const currentUrl = await page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/fund-setup')) {
      test.skip('Redirected to different page');
    }
    
    const firstLoadTime = Date.now();
    await page.waitForLoadState('domcontentloaded');
    const firstLoadDuration = Date.now() - firstLoadTime;
    
    // Reload the page (should use cache)
    const reloadStartTime = Date.now();
    await page.reload({ waitUntil: 'networkidle' });
    const reloadDuration = Date.now() - reloadStartTime;
    
    console.log(`First load: ${firstLoadDuration}ms, Reload: ${reloadDuration}ms`);
    
    // Reload should generally be faster than first load
    // (Though in E2E this might not always be true due to test isolation)
    expect(reloadDuration).toBeLessThan(firstLoadDuration * 2); // At least not significantly slower
  });
});
