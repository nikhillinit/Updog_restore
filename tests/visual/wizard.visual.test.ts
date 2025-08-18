/**
 * Visual Regression Tests for Wizard Component
 * Captures baseline screenshots and validates visual consistency
 */
import { test, expect } from '@playwright/test';

// Visual comparison threshold (0.1% difference allowed)
const VISUAL_THRESHOLD = 0.001;

test.describe('Wizard Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    // Set consistent viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Navigate to wizard
    await page.goto('/wizard');
    
    // Wait for fonts and images to load
    await page.waitForLoadState('networkidle');
    
    // Wait for animations to complete
    await page.waitForTimeout(500);
  });

  test('Wizard initial state screenshot', async ({ page }) => {
    // Wait for wizard to be visible
    await page.waitForSelector('.wizard, #wizard, [data-testid="wizard-container"]', { 
      state: 'visible',
      timeout: 10000 
    });

    // Take screenshot
    await expect(page).toHaveScreenshot('wizard-initial.png', {
      fullPage: false,
      threshold: VISUAL_THRESHOLD,
      maxDiffPixels: 100,
      animations: 'disabled',
    });
  });

  test('Wizard step 1 - Fund Details', async ({ page }) => {
    // Navigate to first step if needed
    const step1 = page.locator('[data-step="1"], .step-1, #step-1').first();
    if (await step1.count() > 0) {
      await step1.click();
      await page.waitForTimeout(300);
    }

    // Fill in some sample data for consistent screenshots
    const fundNameInput = page.locator('input[name="fundName"], input[placeholder*="fund"], #fundName').first();
    if (await fundNameInput.count() > 0) {
      await fundNameInput.fill('Test Fund Visual');
    }

    const fundSizeInput = page.locator('input[name="fundSize"], input[placeholder*="size"], #fundSize').first();
    if (await fundSizeInput.count() > 0) {
      await fundSizeInput.fill('50000000');
    }

    await expect(page).toHaveScreenshot('wizard-step1-filled.png', {
      fullPage: false,
      threshold: VISUAL_THRESHOLD,
      maxDiffPixels: 100,
      animations: 'disabled',
    });
  });

  test('Wizard step navigation visual states', async ({ page }) => {
    // Capture navigation states
    const nextButton = page.locator('button:has-text("Next"), button:has-text("Continue")').first();
    
    if (await nextButton.count() > 0) {
      // Normal state
      await expect(nextButton).toHaveScreenshot('wizard-next-button-normal.png', {
        threshold: VISUAL_THRESHOLD,
      });

      // Hover state
      await nextButton.hover();
      await page.waitForTimeout(100);
      await expect(nextButton).toHaveScreenshot('wizard-next-button-hover.png', {
        threshold: VISUAL_THRESHOLD,
      });

      // Focus state
      await nextButton.focus();
      await expect(nextButton).toHaveScreenshot('wizard-next-button-focus.png', {
        threshold: VISUAL_THRESHOLD,
      });
    }
  });

  test('Wizard form validation states', async ({ page }) => {
    // Trigger validation by trying to submit empty form
    const submitButton = page.locator('button[type="submit"], button:has-text("Submit")').first();
    
    if (await submitButton.count() > 0) {
      await submitButton.click();
      
      // Wait for validation messages
      await page.waitForTimeout(500);
      
      // Capture validation state
      await expect(page).toHaveScreenshot('wizard-validation-errors.png', {
        fullPage: false,
        threshold: VISUAL_THRESHOLD,
        maxDiffPixels: 100,
        animations: 'disabled',
      });
    }
  });

  test('Wizard progress indicator', async ({ page }) => {
    const progressBar = page.locator('[role="progressbar"], .progress-bar, .wizard-progress').first();
    
    if (await progressBar.count() > 0) {
      await expect(progressBar).toHaveScreenshot('wizard-progress-bar.png', {
        threshold: VISUAL_THRESHOLD,
      });
    }

    // Step indicators
    const stepIndicators = page.locator('.wizard-steps, .step-indicators, [data-testid="step-indicators"]').first();
    
    if (await stepIndicators.count() > 0) {
      await expect(stepIndicators).toHaveScreenshot('wizard-step-indicators.png', {
        threshold: VISUAL_THRESHOLD,
      });
    }
  });

  test('Wizard responsive layout - Mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('wizard-mobile.png', {
      fullPage: false,
      threshold: VISUAL_THRESHOLD,
      maxDiffPixels: 100,
      animations: 'disabled',
    });
  });

  test('Wizard responsive layout - Tablet', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('wizard-tablet.png', {
      fullPage: false,
      threshold: VISUAL_THRESHOLD,
      maxDiffPixels: 100,
      animations: 'disabled',
    });
  });

  test('Wizard dark mode', async ({ page }) => {
    // Check if dark mode toggle exists
    const darkModeToggle = page.locator('[data-testid="dark-mode-toggle"], button[aria-label*="dark"], button[aria-label*="theme"]').first();
    
    if (await darkModeToggle.count() > 0) {
      await darkModeToggle.click();
      await page.waitForTimeout(500); // Wait for theme transition
      
      await expect(page).toHaveScreenshot('wizard-dark-mode.png', {
        fullPage: false,
        threshold: VISUAL_THRESHOLD,
        maxDiffPixels: 100,
        animations: 'disabled',
      });
    } else {
      // Try to set dark mode via localStorage or class
      await page.evaluate(() => {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      });
      
      await page.waitForTimeout(500);
      
      await expect(page).toHaveScreenshot('wizard-dark-mode.png', {
        fullPage: false,
        threshold: VISUAL_THRESHOLD,
        maxDiffPixels: 100,
        animations: 'disabled',
      });
    }
  });

  test('Wizard loading states', async ({ page }) => {
    // Simulate loading state if possible
    await page.evaluate(() => {
      // Add loading class to wizard
      const wizard = document.querySelector('.wizard, #wizard, [data-testid="wizard-container"]');
      if (wizard) {
        wizard.classList.add('loading', 'is-loading');
      }
      
      // Show any skeleton loaders
      const skeletons = document.querySelectorAll('.skeleton, [data-skeleton]');
      skeletons.forEach(skeleton => {
        (skeleton as HTMLElement).style.display = 'block';
      });
    });
    
    await page.waitForTimeout(300);
    
    await expect(page).toHaveScreenshot('wizard-loading.png', {
      fullPage: false,
      threshold: VISUAL_THRESHOLD,
      maxDiffPixels: 100,
      animations: 'disabled',
    });
  });

  test('Wizard success state', async ({ page }) => {
    // Try to complete wizard or simulate success state
    await page.evaluate(() => {
      // Add success class
      const wizard = document.querySelector('.wizard, #wizard, [data-testid="wizard-container"]');
      if (wizard) {
        wizard.classList.add('success', 'completed');
      }
      
      // Show success message if exists
      const successMessage = document.querySelector('.success-message, [data-testid="success-message"]');
      if (successMessage) {
        (successMessage as HTMLElement).style.display = 'block';
      }
    });
    
    await page.waitForTimeout(300);
    
    await expect(page).toHaveScreenshot('wizard-success.png', {
      fullPage: false,
      threshold: VISUAL_THRESHOLD,
      maxDiffPixels: 100,
      animations: 'disabled',
    });
  });
});