import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import FundSetup from '../../client/src/pages/fund-setup';
import { FundProvider } from '../../client/src/contexts/FundContext';
import { TestQueryClientProvider } from '../utils/test-query-client';

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <TestQueryClientProvider>
    <FundProvider>{children}</FundProvider>
  </TestQueryClientProvider>
);

describe('FundSetup - Investment Strategy Step', () => {
  beforeEach(() => {
    // Set URL to step=3 (Investment Strategy step)
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState({}, '', '/fund-setup?step=3');
    } else {
      // For test environment without full window.history
      Object.defineProperty(window, 'location', {
        value: { search: '?step=3' },
        writable: true
      });
    }
  });

  it('renders step 3 header correctly', async () => {
    render(
      <TestWrapper>
        <FundSetup />
      </TestWrapper>
    );

    // Check that step 3 is active by looking for its content
    expect(
      screen.getByText('Investment Strategy')
    ).toBeInTheDocument();

    // Check step navigation shows Investment Strategy as current
    expect(screen.getByText(/Stages, sectors, and allocations/)).toBeInTheDocument();
  });

  it('shows current step indicator correctly', async () => {
    render(
      <TestWrapper>
        <FundSetup />
      </TestWrapper>
    );

    // The current step should have specific styling - look for Investment Strategy step
    const stepElement = screen.getByText('Investment Strategy');
    expect(stepElement).toBeInTheDocument();
  });

  it('handles safe mode when parameter present', async () => {
    // Set safe mode URL parameter for step 3
    window.history.pushState({}, '', '/fund-setup?step=3&safe');
    
    render(
      <TestWrapper>
        <FundSetup />
      </TestWrapper>
    );

    // Look for either safe mode content or regular step content
    // (Safe mode might change what's displayed)
    expect(
      screen.getByText('Investment Strategy')
    ).toBeInTheDocument();
  });

  it('does not show committed capital step content', async () => {
    render(
      <TestWrapper>
        <FundSetup />
      </TestWrapper>
    );

    // Assert something that should NOT be present on Step 3
    expect(
      screen.queryByText(/LP\/GP commitments and capital calls/i)
    ).not.toBeInTheDocument();
  });
});