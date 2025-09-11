import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import FundSetup from '@/pages/fund-setup';
import { withWouter } from '../helpers/wouter';
import { useConsoleCapture } from '../helpers/console-capture';
import { TestQueryClientProvider } from '../utils/test-query-client';

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <TestQueryClientProvider>
    {children}
  </TestQueryClientProvider>
);

describe('Wizard step 2 → 3', () => {
  const consoleCap = useConsoleCapture();

  it('navigates without React/Zustand churn errors', async () => {
    // Step 2 (investment-strategy)
    const step2UI = withWouter(
      <TestWrapper>
        <FundSetup />
      </TestWrapper>,
      '/fund-setup?step=2'
    );
    
    const { rerender } = render(step2UI);
    
    // Verify step 2 loads
    expect(screen.getByTestId('wizard-step-investment-strategy-container')).toBeInTheDocument();
    
    // Navigate to step 3 (exit-recycling)
    const step3UI = withWouter(
      <TestWrapper>
        <FundSetup />
      </TestWrapper>,
      '/fund-setup?step=3'
    );
    
    rerender(step3UI);
    
    // Verify step 3 loads
    expect(screen.getByTestId('wizard-step-exit-recycling-container')).toBeInTheDocument();
    
    // Assert no infinite loop symptoms
    const logs = consoleCap.read();
    expect(logs).not.toMatch(/maximum update depth|getsnapshot.*cached|too many re-renders/);
  });

  it('handles invalid step gracefully', async () => {
    const invalidStepUI = withWouter(
      <TestWrapper>
        <FundSetup />
      </TestWrapper>,
      '/fund-setup?step=99'
    );
    
    render(invalidStepUI);
    
    // Should fall back to not-found step
    expect(screen.getByTestId('wizard-step-not-found-container')).toBeInTheDocument();
    
    // Should log warning about invalid step
    const logs = consoleCap.read();
    expect(logs).toMatch(/invalid step.*99.*defaulting to not-found/);
  });
});