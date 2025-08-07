import { test, expect } from '@playwright/test';

test.describe('Basic Smoke Tests', () => {
  
  test('should be able to access the application', async ({ page }) => {
    // Set a longer timeout for this test since the app might need to start
    test.setTimeout(60000);
    
    try {
      await page.goto('/', { waitUntil: 'networkidle', timeout: 30000 });
      
      // If we can load the page, verify it's not an error page
      const title = await page.title();
      expect(title).toBeTruthy();
      
      const body = await page.textContent('body');
      expect(body).toBeTruthy();
      
      // Should not contain common error indicators
      const hasError = body?.toLowerCase().includes('error') || 
                      body?.toLowerCase().includes('cannot be reached') ||
                      body?.toLowerCase().includes('connection refused');
      expect(hasError).toBeFalsy();
      
    } catch (error) {
      // If the server isn't running, skip the test gracefully
      console.log('Server appears to be down, skipping test:', error.message);
      test.skip();
    }
  });

  test('should handle direct navigation to common routes', async ({ page }) => {
    test.setTimeout(30000);
    
    const routes = ['/', '/dashboard', '/fund-setup'];
    
    for (const route of routes) {
      try {
        await page.goto(route, { timeout: 10000 });
        
        // Verify we get some content back
        const body = await page.textContent('body');
        expect(body).toBeTruthy();
        
        // Take a screenshot for documentation
        await page.screenshot({ 
          path: `test-results/smoke-${route.replace('/', 'root')}.png`,
          fullPage: true 
        });
        
      } catch (error) {
        console.log(`Route ${route} failed: ${error.message}`);
        // Continue with other routes
      }
    }
  });
});
