/**
 * Accessibility Tests for Wizard Component
 * Ensures WCAG 2.1 AA compliance
 */
import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y, getViolations, reportViolations } from 'axe-playwright';

test.describe('Wizard Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to wizard
    await page.goto('/wizard');
    
    // Wait for wizard to load
    await page.waitForSelector('[data-testid="wizard-container"]', { timeout: 10000 }).catch(() => {
      // If no test id, wait for common wizard selectors
      return page.waitForSelector('.wizard, #wizard, [role="form"]', { timeout: 10000 });
    });
    
    // Inject axe-core
    await injectAxe(page);
  });

  test('Wizard meets WCAG 2.1 AA standards', async ({ page }) => {
    // Run accessibility check
    await checkA11y(page, null, {
      detailedReport: true,
      detailedReportOptions: {
        html: true
      },
      axeOptions: {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
        }
      }
    });
  });

  test('Wizard step navigation is keyboard accessible', async ({ page }) => {
    // Check for skip links
    const skipLink = page.locator('a[href="#main"], a[href="#content"]').first();
    if (await skipLink.count() > 0) {
      await expect(skipLink).toBeVisible({ visible: false }); // Usually hidden until focused
    }

    // Tab through wizard elements
    await page.keyboard.press('Tab');
    const firstFocusedElement = await page.evaluateHandle(() => document.activeElement);
    expect(firstFocusedElement).toBeTruthy();

    // Check navigation buttons are keyboard accessible
    const nextButton = page.locator('button:has-text("Next"), button:has-text("Continue")').first();
    if (await nextButton.count() > 0) {
      await nextButton.focus();
      await expect(nextButton).toBeFocused();
    }

    const prevButton = page.locator('button:has-text("Previous"), button:has-text("Back")').first();
    if (await prevButton.count() > 0) {
      await prevButton.focus();
      await expect(prevButton).toBeFocused();
    }
  });

  test('Form inputs have proper labels', async ({ page }) => {
    // Check all inputs have labels
    const inputs = page.locator('input, select, textarea');
    const inputCount = await inputs.count();

    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      const inputId = await input.getAttribute('id');
      const inputAriaLabel = await input.getAttribute('aria-label');
      const inputAriaLabelledBy = await input.getAttribute('aria-labelledby');

      // Input should have either:
      // 1. An associated label (via id)
      // 2. An aria-label
      // 3. An aria-labelledby reference
      if (inputId) {
        const label = page.locator(`label[for="${inputId}"]`);
        const hasLabel = await label.count() > 0;
        const hasAriaLabel = inputAriaLabel !== null;
        const hasAriaLabelledBy = inputAriaLabelledBy !== null;

        expect(
          hasLabel || hasAriaLabel || hasAriaLabelledBy,
          `Input with id="${inputId}" should have a label, aria-label, or aria-labelledby`
        ).toBeTruthy();
      }
    }
  });

  test('Color contrast meets WCAG AA standards', async ({ page }) => {
    // Check color contrast specifically
    const violations = await getViolations(page, null, {
      runOnly: {
        type: 'rule',
        values: ['color-contrast']
      }
    });

    if (violations.length > 0) {
      reportViolations(violations, 'Color Contrast');
    }

    expect(violations.length).toBe(0);
  });

  test('Focus indicators are visible', async ({ page }) => {
    // Tab through interactive elements and check for focus indicators
    const interactiveElements = page.locator('button, a, input, select, textarea, [tabindex="0"]');
    const count = await interactiveElements.count();

    for (let i = 0; i < Math.min(count, 5); i++) { // Check first 5 elements
      const element = interactiveElements.nth(i);
      
      if (await element.isVisible()) {
        await element.focus();
        
        // Check if element has focus styles
        const outlineStyle = await element.evaluate((el) => {
          const styles = window.getComputedStyle(el);
          return {
            outline: styles.outline,
            outlineWidth: styles.outlineWidth,
            outlineColor: styles.outlineColor,
            boxShadow: styles.boxShadow,
            border: styles.border
          };
        });

        // Element should have some visual focus indicator
        const hasFocusIndicator = 
          (outlineStyle.outline !== 'none' && outlineStyle.outline !== 'none 0px') ||
          outlineStyle.boxShadow !== 'none' ||
          outlineStyle.outlineWidth !== '0px';

        expect(hasFocusIndicator, 'Element should have visible focus indicator').toBeTruthy();
      }
    }
  });

  test('ARIA attributes are properly used', async ({ page }) => {
    // Check for proper ARIA usage
    const violations = await getViolations(page, null, {
      runOnly: {
        type: 'rule',
        values: ['aria-allowed-attr', 'aria-required-attr', 'aria-valid-attr', 'aria-valid-attr-value']
      }
    });

    if (violations.length > 0) {
      reportViolations(violations, 'ARIA Attributes');
    }

    expect(violations.length).toBe(0);
  });

  test('Error messages are accessible', async ({ page }) => {
    // Try to trigger validation errors
    const submitButton = page.locator('button[type="submit"], button:has-text("Submit")').first();
    
    if (await submitButton.count() > 0) {
      await submitButton.click();
      
      // Wait for potential error messages
      await page.waitForTimeout(1000);
      
      // Check error messages have proper ARIA
      const errorMessages = page.locator('[role="alert"], [aria-live="polite"], .error-message, .field-error');
      const errorCount = await errorMessages.count();
      
      for (let i = 0; i < errorCount; i++) {
        const error = errorMessages.nth(i);
        const role = await error.getAttribute('role');
        const ariaLive = await error.getAttribute('aria-live');
        
        // Error messages should be announced to screen readers
        expect(
          role === 'alert' || ariaLive === 'polite' || ariaLive === 'assertive',
          'Error messages should have role="alert" or aria-live attribute'
        ).toBeTruthy();
      }
    }
  });

  test('Wizard progress is communicated to screen readers', async ({ page }) => {
    // Check for progress indicators
    const progressBar = page.locator('[role="progressbar"], progress, [aria-valuenow]').first();
    
    if (await progressBar.count() > 0) {
      const ariaValueNow = await progressBar.getAttribute('aria-valuenow');
      const ariaValueMin = await progressBar.getAttribute('aria-valuemin');
      const ariaValueMax = await progressBar.getAttribute('aria-valuemax');
      const ariaLabel = await progressBar.getAttribute('aria-label');
      
      // Progress bar should have proper ARIA attributes
      expect(ariaValueNow).toBeTruthy();
      expect(ariaValueMin).toBeTruthy();
      expect(ariaValueMax).toBeTruthy();
      
      // Should have a label
      expect(ariaLabel || await progressBar.getAttribute('aria-labelledby')).toBeTruthy();
    }
    
    // Check for step indicators
    const stepIndicators = page.locator('[aria-current="step"], [aria-current="page"], .current-step');
    if (await stepIndicators.count() > 0) {
      const currentStep = stepIndicators.first();
      const ariaCurrent = await currentStep.getAttribute('aria-current');
      expect(ariaCurrent).toBeTruthy();
    }
  });

  test('Images have appropriate alt text', async ({ page }) => {
    const images = page.locator('img');
    const imageCount = await images.count();

    for (let i = 0; i < imageCount; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      const role = await img.getAttribute('role');
      const ariaLabel = await img.getAttribute('aria-label');

      // Images should have alt text unless they're decorative (role="presentation")
      if (role !== 'presentation' && role !== 'none') {
        expect(
          alt !== null || ariaLabel !== null,
          'Images should have alt text or aria-label unless decorative'
        ).toBeTruthy();
      }
    }
  });

  test('Headings have proper hierarchy', async ({ page }) => {
    // Check heading hierarchy
    const violations = await getViolations(page, null, {
      runOnly: {
        type: 'rule',
        values: ['heading-order', 'page-has-heading-one']
      }
    });

    if (violations.length > 0) {
      reportViolations(violations, 'Heading Hierarchy');
    }

    expect(violations.length).toBe(0);
  });
});