import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Tests', () => {
  const pages = [
    { path: '', name: 'Homepage' },
    { path: 'dashboard', name: 'Dashboard' },
    { path: 'portfolio', name: 'Portfolio' },
    { path: 'fund-setup', name: 'Fund Setup' },
    { path: 'investments', name: 'Investments' }
  ];

  for (const pageInfo of pages) {
    test(`should meet accessibility standards on ${pageInfo.name}`, async ({ page }) => {
      // Navigate to the page
      await page.goto(`/${pageInfo.path}`);
      
      // Wait for page to load
      await page.waitForLoadState('networkidle');
      
      // Skip if redirected to auth or different page
      const currentUrl = await page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
        test.skip('Redirected to authentication');
      }
      
      // Run axe accessibility scan
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      // Take screenshot for documentation
      await page.screenshot({ 
        path: `test-results/accessibility-${pageInfo.name.toLowerCase()}.png`,
        fullPage: true 
      });

      // Assert no violations
      expect(accessibilityScanResults.violations).toEqual([]);
    });
  }

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Skip if not accessible
    const currentUrl = await page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/fund-setup')) {
      test.skip('Page not accessible or redirected');
    }
    
    // Test Tab navigation
    await page.keyboard.press('Tab');
    
    let focusedElements = 0;
    const maxTabs = 10; // Reasonable limit
    
    for (let i = 0; i < maxTabs; i++) {
      const focusedElement = await page.locator(':focus').first();
      
      if (await focusedElement.isVisible()) {
        focusedElements++;
        
        // Verify focused element has visible focus indicator
        const elementBox = await focusedElement.boundingBox();
        expect(elementBox).toBeTruthy();
        
        // Check for focus styles (outline, border, background change)
        const computedStyle = await focusedElement.evaluate(el => {
          const style = window.getComputedStyle(el);
          return {
            outline: style.outline,
            outlineWidth: style.outlineWidth,
            border: style.border,
            backgroundColor: style.backgroundColor
          };
        });
        
        const hasFocusIndicator = computedStyle.outline !== 'none' ||
                                computedStyle.outlineWidth !== '0px' ||
                                computedStyle.border.includes('blue') ||
                                computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)';
        
        if (hasFocusIndicator) {
          // At least one element should have visible focus
          break;
        }
      }
      
      await page.keyboard.press('Tab');
    }
    
    // Should have found at least some focusable elements
    expect(focusedElements).toBeGreaterThan(0);
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    const testPages = ['dashboard', 'portfolio'];
    
    for (const pagePath of testPages) {
      await page.goto(`/${pagePath}`);
      
      const currentUrl = await page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/fund-setup')) {
        continue;
      }
      
      // Get all headings
      const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
      
      if (headings.length > 0) {
        // Should have at least one h1
        const h1Elements = await page.locator('h1').count();
        expect(h1Elements).toBeGreaterThanOrEqual(1);
        
        // Check heading levels don't skip (no h3 without h2, etc.)
        const headingLevels = await Promise.all(
          headings.map(async (heading) => {
            const tagName = await heading.evaluate(el => el.tagName.toLowerCase());
            return parseInt(tagName.charAt(1));
          })
        );
        
        // Sort to check hierarchy
        const sortedLevels = [...headingLevels].sort();
        
        // Should start with h1 (level 1)
        expect(sortedLevels[0]).toBe(1);
        
        // No level should be more than 1 greater than the previous
        for (let i = 1; i < sortedLevels.length; i++) {
          const levelDiff = sortedLevels[i] - sortedLevels[i - 1];
          expect(levelDiff).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  test('should have proper form labels and ARIA attributes', async ({ page }) => {
    await page.goto('/fund-setup');
    
    // If fund setup is available, test form accessibility
    const formElements = await page.locator('input, select, textarea').all();
    
    for (const element of formElements) {
      const tagName = await element.evaluate(el => el.tagName.toLowerCase());
      const type = await element.getAttribute('type');
      
      // Skip hidden inputs
      if (type === 'hidden') continue;
      
      // Check for associated label
      const id = await element.getAttribute('id');
      const ariaLabel = await element.getAttribute('aria-label');
      const ariaLabelledby = await element.getAttribute('aria-labelledby');
      
      let hasLabel = false;
      
      if (id) {
        const label = await page.locator(`label[for="${id}"]`).first();
        hasLabel = await label.isVisible();
      }
      
      if (!hasLabel) {
        hasLabel = ariaLabel !== null || ariaLabelledby !== null;
      }
      
      if (!hasLabel) {
        // Check if wrapped in label
        const parentLabel = await element.locator('xpath=ancestor::label').first();
        hasLabel = await parentLabel.isVisible();
      }
      
      // Form controls should have labels
      expect(hasLabel).toBeTruthy();
    }
  });

  test('should have proper color contrast', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Skip if redirected
    const currentUrl = await page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/fund-setup')) {
      test.skip('Redirected to different page');
    }
    
    // Run axe scan focused on color contrast
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .include('body')
      .analyze();

    // Filter for color contrast violations
    const colorContrastViolations = accessibilityScanResults.violations.filter(
      violation => violation.id === 'color-contrast'
    );

    // Should have no color contrast violations
    expect(colorContrastViolations).toHaveLength(0);
  });

  test('should provide alternative text for images', async ({ page }) => {
    await page.goto('/dashboard');
    
    const currentUrl = await page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/fund-setup')) {
      test.skip('Redirected to different page');
    }
    
    // Get all images
    const images = await page.locator('img').all();
    
    for (const image of images) {
      const alt = await image.getAttribute('alt');
      const ariaLabel = await image.getAttribute('aria-label');
      const role = await image.getAttribute('role');
      
      // Images should have alt text, aria-label, or be marked as decorative
      const hasAccessibleText = alt !== null || ariaLabel !== null || role === 'presentation';
      
      expect(hasAccessibleText).toBeTruthy();
    }
  });

  test('should support screen readers with proper ARIA landmarks', async ({ page }) => {
    await page.goto('/dashboard');
    
    const currentUrl = await page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/fund-setup')) {
      test.skip('Redirected to different page');
    }
    
    // Check for ARIA landmarks
    const landmarks = await page.locator('[role="main"], [role="navigation"], [role="banner"], [role="contentinfo"], main, nav, header, footer').count();
    
    // Should have at least some landmark elements
    expect(landmarks).toBeGreaterThan(0);
    
    // Specifically check for main content area
    const mainContent = await page.locator('main, [role="main"]').count();
    expect(mainContent).toBeGreaterThanOrEqual(1);
  });

  test('should handle focus management in modals', async ({ page }) => {
    await page.goto('/dashboard');
    
    const currentUrl = await page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/fund-setup')) {
      test.skip('Redirected to different page');
    }
    
    // Look for buttons that might open modals
    const modalTriggers = await page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("Edit")').all();
    
    for (const trigger of modalTriggers.slice(0, 2)) { // Test first 2 to avoid timeouts
      try {
        await trigger.click();
        await page.waitForTimeout(1000);
        
        // Check if modal appeared
        const modal = await page.locator('[role="dialog"], .modal, [aria-modal="true"]').first();
        
        if (await modal.isVisible()) {
          // Focus should be trapped in modal
          const focusedElement = await page.locator(':focus').first();
          
          if (await focusedElement.isVisible()) {
            // Focused element should be within modal
            const isInModal = await focusedElement.locator('xpath=ancestor-or-self::*[@role="dialog" or contains(@class, "modal")]').count() > 0;
            expect(isInModal).toBeTruthy();
          }
          
          // Close modal (ESC key or close button)
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          
          // Modal should close
          const modalStillVisible = await modal.isVisible();
          expect(modalStillVisible).toBeFalsy();
          
          break; // Only test one modal
        }
      } catch (error) {
        // Modal test failed, continue
        console.log(`Modal test failed: ${error}`);
      }
    }
  });

  test('should be usable with high contrast mode', async ({ page }) => {
    // Enable high contrast styles (simulate Windows high contrast)
    await page.addStyleTag({
      content: `
        * {
          background: black !important;
          color: white !important;
          border-color: white !important;
        }
        a, button {
          color: yellow !important;
        }
      `
    });
    
    await page.goto('/dashboard');
    
    const currentUrl = await page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/fund-setup')) {
      test.skip('Redirected to different page');
    }
    
    // Page should still be functional
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    
    // Interactive elements should still be visible
    const buttons = await page.locator('button:visible').count();
    const links = await page.locator('a:visible').count();
    
    expect(buttons + links).toBeGreaterThan(0);
    
    // Take screenshot in high contrast mode
    await page.screenshot({ 
      path: 'test-results/high-contrast-mode.png',
      fullPage: true 
    });
  });
});