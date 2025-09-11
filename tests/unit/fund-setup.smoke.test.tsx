import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderFundSetup } from '../utils/render-fund-setup';
import { useConsoleCapture } from '../helpers/console-capture';

/**
 * KNOWN LIMITATION: These tests are currently disabled due to fundamental 
 * incompatibilities between React DOM and both JSDOM/happy-dom environments.
 * 
 * React's internal getActiveElementDeep function uses `instanceof HTMLIFrameElement`
 * which fails in these environments because the constructor is not properly exposed.
 * 
 * TODO: Re-enable these tests once we add Playwright for true browser testing.
 * These smoke tests verify critical functionality and should be run in a real browser.
 */
const ENABLE_WHEN_BROWSER_TESTING_AVAILABLE = false;
const itSmoke = ENABLE_WHEN_BROWSER_TESTING_AVAILABLE ? it : it.skip;

describe('FundSetup (smoke) - DISABLED: Requires browser environment', () => {
  const logs = useConsoleCapture();

  beforeEach(() => {
    // Clear logs between tests for isolation
    logs.error.length = 0;
    logs.warn.length = 0;
    logs.log.length = 0;
  });

  // Test each step individually for better isolation and clearer failure messages
  itSmoke('renders step 2 (investment-strategy) without churn errors', () => {
    renderFundSetup('/fund-setup?step=2');

    const all = [...logs.error, ...logs.warn].flat().join('\n').toLowerCase();
    expect(all).not.toMatch(/maximum update depth|getsnapshot.*cached|too many re-renders/);

    expect(screen.getByTestId('wizard-step-investment-strategy-container')).toBeTruthy();
  });

  itSmoke('renders step 3 (exit-recycling) without churn errors', () => {
    renderFundSetup('/fund-setup?step=3');

    const all = [...logs.error, ...logs.warn].flat().join('\n').toLowerCase();
    expect(all).not.toMatch(/maximum update depth|getsnapshot.*cached|too many re-renders/);

    expect(screen.getByTestId('wizard-step-exit-recycling-container')).toBeTruthy();
  });

  itSmoke('renders step 4 (waterfall) without churn errors', () => {
    renderFundSetup('/fund-setup?step=4');

    const all = [...logs.error, ...logs.warn].flat().join('\n').toLowerCase();
    expect(all).not.toMatch(/maximum update depth|getsnapshot.*cached|too many re-renders/);

    expect(screen.getByTestId('wizard-step-waterfall-container')).toBeTruthy();
  });

  itSmoke('shows not-found for invalid step and warns at most once in DEV', () => {
    renderFundSetup('/fund-setup?step=99');
    
    expect(screen.getByTestId('wizard-step-not-found-container')).toBeTruthy();
    
    // In DEV mode, we expect at most one warning about invalid step
    if (import.meta.env.DEV) {
      const warns = logs.warn.flat().join(' ');
      const matches = warns.match(/Invalid step/g) ?? [];
      expect(matches.length).toBeLessThanOrEqual(1);
    }
  });

  itSmoke('no hydration or infinite loop errors across multiple renders', () => {
    // Test rendering multiple steps in sequence
    const steps = ['2', '3', '4'];
    
    for (const step of steps) {
      renderFundSetup(`/fund-setup?step=${step}`);
      // RTL handles cleanup automatically between tests
    }
    
    // Check consolidated logs for any critical errors
    const allLogs = [...logs.error, ...logs.warn]
      .flat()
      .join('\n')
      .toLowerCase();
    
    // These patterns indicate serious React issues
    expect(allLogs).not.toMatch(/maximum update depth/);
    expect(allLogs).not.toMatch(/getsnapshot.*cached/);
    expect(allLogs).not.toMatch(/too many re-renders/);
    expect(allLogs).not.toMatch(/hydration/);
    expect(allLogs).not.toMatch(/act\(\)/);
  });
});