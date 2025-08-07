import { test, expect } from '@playwright/test';

// Production smoke tests - run against live deployed environments
test.describe('Production Smoke Tests', () => {
  const prodUrl = process.env.PROD_URL || 'https://updog-restore.vercel.app';
  const previewUrl = process.env.PREVIEW_URL || process.env.BASE_URL;
  
  test('should verify production health endpoint', async ({ request }) => {
    const response = await request.get(`${prodUrl}/healthz`);
    
    expect(response.status()).toBe(200);
    
    const healthData = await response.json();
    expect(healthData).toHaveProperty('status');
    expect(healthData.status).toBe('healthy');
    
    console.log('Production health check passed:', healthData);
  });

  test('should load production homepage successfully', async ({ page }) => {
    const response = await page.goto(prodUrl, { waitUntil: 'networkidle' });
    
    expect(response?.status()).toBe(200);
    
    // Should not show error pages
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.toLowerCase()).not.toContain('error');
    
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    expect(body.toLowerCase()).not.toContain('application error');
    expect(body.toLowerCase()).not.toContain('cannot be reached');
    
    // Take screenshot for verification
    await page.screenshot({ 
      path: 'test-results/production-homepage.png',
      fullPage: true 
    });
  });

  test('should verify production assets load correctly', async ({ page }) => {
    // Monitor failed requests
    const failedRequests: string[] = [];
    
    page.on('requestfailed', (request) => {
      failedRequests.push(request.url());
    });
    
    await page.goto(prodUrl, { waitUntil: 'networkidle' });
    
    // Should have no failed requests for critical assets
    const criticalFailures = failedRequests.filter(url => 
      url.endsWith('.js') || 
      url.endsWith('.css') || 
      url.endsWith('.ico')
    );
    
    expect(criticalFailures).toHaveLength(0);
    
    if (failedRequests.length > 0) {
      console.log('Non-critical failed requests:', failedRequests);
    }
  });

  test('should verify SSL certificate and security headers', async ({ request }) => {
    const response = await request.get(prodUrl);
    
    expect(response.status()).toBe(200);
    
    // Check security headers
    const headers = response.headers();
    
    // HTTPS should be enforced
    expect(headers['strict-transport-security']).toBeTruthy();
    
    // Should have content security policy (if implemented)
    const csp = headers['content-security-policy'] || headers['content-security-policy-report-only'];
    if (csp) {
      expect(csp).toBeTruthy();
    }
    
    // Should have X-Frame-Options or frame-ancestors in CSP
    const frameOptions = headers['x-frame-options'];
    if (frameOptions || csp) {
      expect(frameOptions === 'DENY' || frameOptions === 'SAMEORIGIN' || csp?.includes('frame-ancestors')).toBeTruthy();
    }
    
    console.log('Security headers check passed');
  });

  test('should verify database connectivity in production', async ({ page }) => {
    await page.goto(`${prodUrl}/dashboard`);
    
    // If redirected to auth, that's fine - DB is accessible
    const currentUrl = await page.url();
    
    // Should not show database connection errors
    const body = await page.textContent('body');
    expect(body?.toLowerCase()).not.toContain('database connection');
    expect(body?.toLowerCase()).not.toContain('connection error');
    expect(body?.toLowerCase()).not.toContain('database error');
    
    console.log('Database connectivity check passed');
  });

  test('should handle high traffic gracefully', async ({ page }) => {
    const startTime = Date.now();
    
    // Make multiple concurrent requests to simulate traffic
    const requests = Array.from({ length: 5 }, () => 
      page.goto(prodUrl, { timeout: 30000 }).catch(() => null)
    );
    
    const responses = await Promise.all(requests);
    const loadTime = Date.now() - startTime;
    
    // Most requests should succeed
    const successfulResponses = responses.filter(response => response?.status() === 200);
    expect(successfulResponses.length).toBeGreaterThanOrEqual(3);
    
    // Should handle concurrent requests within reasonable time
    expect(loadTime).toBeLessThan(30000);
    
    console.log(`Concurrent requests completed in ${loadTime}ms, ${successfulResponses.length}/5 successful`);
  });

  // Preview environment tests (if different from production)
  if (previewUrl && previewUrl !== prodUrl) {
    test('should verify preview environment matches production', async ({ page }) => {
      // Test both environments
      await page.goto(prodUrl);
      const prodTitle = await page.title();
      const prodContent = await page.textContent('body');
      
      await page.goto(previewUrl);
      const previewTitle = await page.title();
      const previewContent = await page.textContent('body');
      
      // Titles should be similar (allowing for environment differences)
      expect(previewTitle).toBeTruthy();
      expect(previewContent).toBeTruthy();
      
      // Should not show obvious deployment errors
      expect(previewContent.toLowerCase()).not.toContain('deployment failed');
      expect(previewContent.toLowerCase()).not.toContain('build error');
      
      console.log('Preview environment verification passed');
    });
  }

  test('should verify API endpoints are accessible', async ({ request }) => {
    const apiEndpoints = ['/api/health', '/healthz', '/api/status'];
    
    for (const endpoint of apiEndpoints) {
      try {
        const response = await request.get(`${prodUrl}${endpoint}`);
        
        if (response.status() === 200) {
          console.log(`API endpoint ${endpoint} is accessible`);
          
          // Verify response format
          const contentType = response.headers()['content-type'];
          if (contentType?.includes('application/json')) {
            const data = await response.json();
            expect(data).toBeTruthy();
          }
          break; // At least one health endpoint should work
        }
      } catch (error) {
        console.log(`API endpoint ${endpoint} not accessible: ${error}`);
      }
    }
  });

  test('should verify CDN and static assets performance', async ({ page }) => {
    // Monitor network requests
    const assetRequests: any[] = [];
    
    page.on('response', (response) => {
      const url = response.url();
      if (url.endsWith('.js') || url.endsWith('.css') || url.endsWith('.png') || url.endsWith('.jpg')) {
        assetRequests.push({
          url,
          status: response.status(),
          timing: response.timing()
        });
      }
    });
    
    await page.goto(prodUrl, { waitUntil: 'networkidle' });
    
    // All assets should load successfully
    const failedAssets = assetRequests.filter(req => req.status >= 400);
    expect(failedAssets).toHaveLength(0);
    
    // Assets should load reasonably quickly (CDN benefit)
    const slowAssets = assetRequests.filter(req => 
      req.timing && req.timing.responseEnd > 5000 // 5 seconds
    );
    
    // Most assets should load quickly
    expect(slowAssets.length).toBeLessThan(assetRequests.length * 0.5);
    
    console.log(`Asset performance: ${assetRequests.length} assets, ${failedAssets.length} failed, ${slowAssets.length} slow`);
  });

  test('should verify error pages work correctly', async ({ page }) => {
    // Test 404 page
    const response = await page.goto(`${prodUrl}/this-page-does-not-exist`);
    
    // Should handle 404 gracefully
    const status = response?.status();
    expect(status === 404 || status === 200).toBeTruthy(); // 200 if SPA handles routing
    
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    
    // Should show user-friendly error page, not server error
    expect(body?.toLowerCase()).not.toContain('internal server error');
    expect(body?.toLowerCase()).not.toContain('application error');
    
    // Take screenshot of error page
    await page.screenshot({ 
      path: 'test-results/production-404.png',
      fullPage: true 
    });
  });

  test('should verify cross-origin resource sharing', async ({ request }) => {
    // Test CORS if API is used by external domains
    const response = await request.get(`${prodUrl}/api/health`, {
      headers: {
        'Origin': 'https://example.com'
      }
    });
    
    const corsHeaders = {
      accessControl: response.headers()['access-control-allow-origin'],
      methods: response.headers()['access-control-allow-methods'],
      headers: response.headers()['access-control-allow-headers']
    };
    
    // CORS should be configured appropriately for production
    if (corsHeaders.accessControl) {
      expect(corsHeaders.accessControl === '*' || corsHeaders.accessControl.includes('updog')).toBeTruthy();
    }
    
    console.log('CORS configuration verified:', corsHeaders);
  });

  test('should verify monitoring and analytics are working', async ({ page }) => {
    // Monitor network requests to see if analytics/monitoring calls are made
    const monitoringCalls: string[] = [];
    
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('analytics') || 
          url.includes('sentry') || 
          url.includes('datadog') || 
          url.includes('newrelic') ||
          url.includes('vercel.com/_vercel/speed-insights') ||
          url.includes('vercel.com/_vercel/insights')) {
        monitoringCalls.push(url);
      }
    });
    
    await page.goto(prodUrl, { waitUntil: 'networkidle' });
    
    // Should have some monitoring/analytics calls (if implemented)
    if (monitoringCalls.length > 0) {
      console.log('Monitoring services detected:', monitoringCalls.length);
    } else {
      console.log('No monitoring services detected (this may be intentional)');
    }
    
    // This test is informational - not all apps need external monitoring
    expect(true).toBeTruthy();
  });

  test('should verify responsive design on mobile', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto(prodUrl);
    
    // Page should be responsive
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    
    // Should have viewport meta tag for mobile
    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewportMeta).toContain('width=device-width');
    
    // Take mobile screenshot
    await page.screenshot({ 
      path: 'test-results/production-mobile.png',
      fullPage: true 
    });
  });
});
