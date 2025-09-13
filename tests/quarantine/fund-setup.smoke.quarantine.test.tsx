import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderFundSetup } from '../utils/render-fund-setup';
import { useConsoleCapture } from '../helpers/console-capture';

/**
 * QUARANTINED: These tests require a real browser environment and cannot run in JSDOM/happy-dom.
 * 
 * React's internal getActiveElementDeep function uses `instanceof HTMLIFrameElement`
 * which fails in DOM simulation environments because the constructor is not properly exposed.
 * 
 * These tests have been ported to Playwright E2E tests at tests/e2e/fund-setup.spec.ts
 * This file is kept for reference but excluded from test runs via vitest.config.ts
 */

describe.skip('FundSetup (smoke) - QUARANTINED: See tests/e2e/fund-setup.spec.ts', () => {
  const logs = useConsoleCapture();

  beforeEach(() => {
    // Clear logs between tests for isolation
    logs.error.length = 0;
    logs.warn.length = 0;
    logs.log.length = 0;
  });

  // Test each step individually for better isolation and clearer failure messages
  it('renders step 2 (investment-strategy) without churn errors', () => {
    renderFundSetup('/fund-setup?step=2');

    const all = [...logs.error, ...logs.warn].flat().join('\n').toLowerCase();
    expect(all).not.toMatch(/maximum update depth|getsnapshot.*cached|too many re-renders/);

    expect(screen.getByTestId('wizard-step-investment-strategy-container')).toBeTruthy();
  });

  it('renders step 3 (exit-recycling) without churn errors', () => {
    renderFundSetup('/fund-setup?step=3');

    const all = [...logs.error, ...logs.warn].flat().join('\n').toLowerCase();
    expect(all).not.toMatch(/maximum update depth|getsnapshot.*cached|too many re-renders/);

    expect(screen.getByTestId('wizard-step-exit-recycling-container')).toBeTruthy();
  });

  it('renders step 4 (waterfall) without churn errors', () => {
    renderFundSetup('/fund-setup?step=4');

    const all = [...logs.error, ...logs.warn].flat().join('\n').toLowerCase();
    expect(all).not.toMatch(/maximum update depth|getsnapshot.*cached|too many re-renders/);

    expect(screen.getByTestId('wizard-step-waterfall-container')).toBeTruthy();
  });

  it('shows not-found for invalid step and warns at most once in DEV', () => {
    renderFundSetup('/fund-setup?step=99');
    
    expect(screen.getByTestId('wizard-step-not-found-container')).toBeTruthy();
    
    // In DEV mode, we expect at most one warning about invalid step
    if (import.meta.env.DEV) {
      const warns = logs.warn.flat().join(' ');
      const matches = warns.match(/Invalid step/g) ?? [];
      expect(matches.length).toBeLessThanOrEqual(1);
    }
  });

  it('no hydration or infinite loop errors across multiple renders', () => {
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