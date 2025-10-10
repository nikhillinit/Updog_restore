/**
 * Test ID Provider
 * Adds stable data-testid attributes to wizard components
 * Ensures E2E tests remain stable across UI changes
 */

import React, { ReactElement, cloneElement } from 'react';

export interface TestIdProps {
  testId?: string;
  children?: React.ReactNode;
}

/**
 * Common test IDs for wizard components
 */
export const WIZARD_TEST_IDS = {
  // Navigation
  nextButton: 'wizard-next',
  prevButton: 'wizard-prev',
  saveButton: 'wizard-save',
  submitButton: 'wizard-submit',
  
  // Fund setup step
  fundNameInput: 'fund-name-input',
  fundSizeInput: 'fund-size-input',
  fundStrategySelect: 'fund-strategy-select',
  
  // Company step
  companySearchInput: 'company-search',
  companyAddButton: 'company-add',
  companyList: 'company-list',
  companyItem: 'company-item',
  
  // Reserves step
  reservesToggle: 'reserves-toggle',
  reservesAmountInput: 'reserves-amount',
  reservesStrategySelect: 'reserves-strategy',
  reservesCalculateButton: 'reserves-calculate',
  
  // Pacing step
  pacingToggle: 'pacing-toggle',
  pacingPeriodSelect: 'pacing-period',
  pacingRateInput: 'pacing-rate',
  
  // Review step
  reviewSummary: 'review-summary',
  reviewConfirmCheckbox: 'review-confirm',
  
  // Results
  resultsContainer: 'results-container',
  resultsChart: 'results-chart',
  resultsTable: 'results-table',
  resultsExportButton: 'results-export',
} as const;

/**
 * Higher-order component to add test IDs
 */
export function withTestId<P extends object>(
  Component: React.ComponentType<P>,
  testId: string
) {
  const WithTestId = React.forwardRef<unknown, P>((props, ref) => {
    return <Component {...props} data-testid={testId} ref={ref} />;
  });
  WithTestId.displayName = `WithTestId(${Component.displayName || Component.name || 'Component'})`;
  return WithTestId;
}

/**
 * Hook to get test ID props
 */
export function useTestId(testId?: string) {
  if (!testId) return {};
  
  return {
    'data-testid': testId,
    // Add aria-label for accessibility
    'aria-label': testId.replace(/-/g, ' '),
  };
}

/**
 * Component to wrap children with test IDs
 */
export function TestIdWrapper({ 
  testId, 
  children,
  as: Component = 'div' 
}: TestIdProps & { as?: React.ElementType }) {
  const testProps = useTestId(testId);
  
  if (React.isValidElement(children) && children.type !== React.Fragment) {
    // If single child element, clone it with test ID
    return cloneElement(children as ReactElement, testProps);
  }
  
  // Otherwise wrap in container
  return <Component {...testProps}>{children}</Component>;
}