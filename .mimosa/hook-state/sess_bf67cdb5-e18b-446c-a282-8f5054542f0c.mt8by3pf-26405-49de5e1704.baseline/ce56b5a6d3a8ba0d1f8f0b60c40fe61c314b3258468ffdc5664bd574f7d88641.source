/**
 * Visual Regression Tests for Charts
 * Captures baseline screenshots of key charts and data visualizations
 */
import { test, expect } from '@playwright/test';

const VISUAL_THRESHOLD = 0.001; // 0.1% difference allowed

test.describe('Charts Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    // Set consistent viewport for charts
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Navigate to dashboard or charts page
    await page.goto('/dashboard');
    
    // Wait for data to load
    await page.waitForLoadState('networkidle');
    
    // Wait for chart animations to complete
    await page.waitForTimeout(1000);
  });

  test('Portfolio Overview Chart', async ({ page }) => {
    const portfolioChart = page.locator('[data-testid="portfolio-chart"], .portfolio-chart, #portfolio-overview').first();
    
    if (await portfolioChart.count() > 0) {
      await portfolioChart.waitFor({ state: 'visible' });
      
      // Disable chart animations for consistent screenshots
      await page.evaluate(() => {
        // Disable Chart.js animations if present
        if ((window as any).Chart) {
          (window as any).Chart.defaults.animation = false;
        }
        
        // Disable other charting library animations
        const charts = document.querySelectorAll('canvas, svg.chart');
        charts.forEach(chart => {
          chart.classList.add('no-animation');
        });
      });
      
      await expect(portfolioChart).toHaveScreenshot('chart-portfolio-overview.png', {
        threshold: VISUAL_THRESHOLD,
        animations: 'disabled',
      });
    }
  });

  test('Performance Metrics Chart', async ({ page }) => {
    const performanceChart = page.locator('[data-testid="performance-chart"], .performance-chart, #performance-metrics').first();
    
    if (await performanceChart.count() > 0) {
      await performanceChart.waitFor({ state: 'visible' });
      
      await expect(performanceChart).toHaveScreenshot('chart-performance-metrics.png', {
        threshold: VISUAL_THRESHOLD,
        animations: 'disabled',
      });
    }
  });

  test('Fund Allocation Pie Chart', async ({ page }) => {
    const allocationChart = page.locator('[data-testid="allocation-chart"], .allocation-chart, .pie-chart').first();
    
    if (await allocationChart.count() > 0) {
      await allocationChart.waitFor({ state: 'visible' });
      
      await expect(allocationChart).toHaveScreenshot('chart-fund-allocation.png', {
        threshold: VISUAL_THRESHOLD,
        animations: 'disabled',
      });
    }
  });

  test('Cash Flow Timeline', async ({ page }) => {
    const cashFlowChart = page.locator('[data-testid="cashflow-chart"], .cashflow-chart, .timeline-chart').first();
    
    if (await cashFlowChart.count() > 0) {
      await cashFlowChart.waitFor({ state: 'visible' });
      
      await expect(cashFlowChart).toHaveScreenshot('chart-cash-flow.png', {
        threshold: VISUAL_THRESHOLD,
        animations: 'disabled',
      });
    }
  });

  test('IRR Distribution Histogram', async ({ page }) => {
    const irrChart = page.locator('[data-testid="irr-chart"], .irr-distribution, .histogram').first();
    
    if (await irrChart.count() > 0) {
      await irrChart.waitFor({ state: 'visible' });
      
      await expect(irrChart).toHaveScreenshot('chart-irr-distribution.png', {
        threshold: VISUAL_THRESHOLD,
        animations: 'disabled',
      });
    }
  });

  test('Monte Carlo Simulation Results', async ({ page }) => {
    // Navigate to simulations if needed
    const simulationsLink = page.locator('a[href*="simulation"], button:has-text("Simulations")').first();
    if (await simulationsLink.count() > 0) {
      await simulationsLink.click();
      await page.waitForLoadState('networkidle');
    }
    
    const monteCarloChart = page.locator('[data-testid="monte-carlo-chart"], .monte-carlo-chart, .simulation-results').first();
    
    if (await monteCarloChart.count() > 0) {
      await monteCarloChart.waitFor({ state: 'visible' });
      
      await expect(monteCarloChart).toHaveScreenshot('chart-monte-carlo.png', {
        threshold: VISUAL_THRESHOLD,
        animations: 'disabled',
      });
    }
  });

  test('Chart Hover States', async ({ page }) => {
    const chart = page.locator('canvas, svg.chart').first();
    
    if (await chart.count() > 0) {
      // Get chart center for hover
      const box = await chart.boundingBox();
      if (box) {
        // Hover over chart center
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(300);
        
        // Check if tooltip appears
        const tooltip = page.locator('.chart-tooltip, .tooltip, [role="tooltip"]').first();
        if (await tooltip.count() > 0) {
          await expect(tooltip).toHaveScreenshot('chart-tooltip.png', {
            threshold: VISUAL_THRESHOLD,
          });
        }
      }
    }
  });

  test('Chart Legend Interactions', async ({ page }) => {
    const legend = page.locator('.chart-legend, .legend, [data-testid="chart-legend"]').first();
    
    if (await legend.count() > 0) {
      // Capture legend normal state
      await expect(legend).toHaveScreenshot('chart-legend-normal.png', {
        threshold: VISUAL_THRESHOLD,
      });
      
      // Click first legend item to toggle
      const legendItem = legend.locator('.legend-item, li').first();
      if (await legendItem.count() > 0) {
        await legendItem.click();
        await page.waitForTimeout(300);
        
        await expect(legend).toHaveScreenshot('chart-legend-toggled.png', {
          threshold: VISUAL_THRESHOLD,
        });
      }
    }
  });

  test('Chart Export Menu', async ({ page }) => {
    const exportButton = page.locator('[data-testid="chart-export"], button[aria-label*="export"], .export-button').first();
    
    if (await exportButton.count() > 0) {
      await exportButton.click();
      await page.waitForTimeout(200);
      
      const exportMenu = page.locator('.export-menu, [role="menu"]').first();
      if (await exportMenu.count() > 0) {
        await expect(exportMenu).toHaveScreenshot('chart-export-menu.png', {
          threshold: VISUAL_THRESHOLD,
        });
      }
    }
  });

  test('Chart Loading State', async ({ page }) => {
    // Reload page and capture loading state
    await page.reload();
    
    // Try to capture skeleton loaders or loading spinners
    const loadingChart = page.locator('.chart-loading, .skeleton-chart, [data-loading="true"]').first();
    
    if (await loadingChart.count() > 0) {
      await expect(loadingChart).toHaveScreenshot('chart-loading.png', {
        threshold: VISUAL_THRESHOLD,
      });
    }
  });

  test('Chart Empty State', async ({ page }) => {
    // Try to find empty state
    const emptyChart = page.locator('.chart-empty, .no-data, [data-empty="true"]').first();
    
    if (await emptyChart.count() > 0) {
      await expect(emptyChart).toHaveScreenshot('chart-empty-state.png', {
        threshold: VISUAL_THRESHOLD,
      });
    }
  });

  test('Chart Error State', async ({ page }) => {
    // Try to trigger or find error state
    const errorChart = page.locator('.chart-error, .error-state, [data-error="true"]').first();
    
    if (await errorChart.count() > 0) {
      await expect(errorChart).toHaveScreenshot('chart-error-state.png', {
        threshold: VISUAL_THRESHOLD,
      });
    }
  });

  test('Responsive Charts - Mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    
    const chart = page.locator('canvas, svg.chart').first();
    if (await chart.count() > 0) {
      await expect(chart).toHaveScreenshot('chart-mobile.png', {
        threshold: VISUAL_THRESHOLD,
      });
    }
  });

  test('Responsive Charts - Tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    
    const chart = page.locator('canvas, svg.chart').first();
    if (await chart.count() > 0) {
      await expect(chart).toHaveScreenshot('chart-tablet.png', {
        threshold: VISUAL_THRESHOLD,
      });
    }
  });

  test('Dark Mode Charts', async ({ page }) => {
    // Enable dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    });
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const chart = page.locator('canvas, svg.chart').first();
    if (await chart.count() > 0) {
      await expect(chart).toHaveScreenshot('chart-dark-mode.png', {
        threshold: VISUAL_THRESHOLD,
      });
    }
  });
});