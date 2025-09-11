import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FundSetup from '../../client/src/pages/fund-setup';
import { FundProvider } from '../../client/src/contexts/FundContext';
import { TestQueryClientProvider } from '../utils/test-query-client';

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <TestQueryClientProvider>
    <FundProvider>{children}</FundProvider>
  </TestQueryClientProvider>
);

describe('FundSetup - Investment Strategy Step', () => {
  it('renders step 3 container correctly', async () => {
    render(
      <MemoryRouter initialEntries={["/fund-setup?step=3"]}>
        <Routes>
          <Route path="/fund-setup" element={
            <TestWrapper>
              <FundSetup />
            </TestWrapper>
          } />
        </Routes>
      </MemoryRouter>
    );

    // Assert we land on the Exit Recycling step (Step 3)
    const container = await screen.findByTestId("wizard-step-exit-recycling-container");
    expect(container).toBeInTheDocument();
  });

  it('shows step 2 as investment strategy', async () => {
    render(
      <MemoryRouter initialEntries={["/fund-setup?step=2"]}>
        <Routes>
          <Route path="/fund-setup" element={
            <TestWrapper>
              <FundSetup />
            </TestWrapper>
          } />
        </Routes>
      </MemoryRouter>
    );

    // Step 2 should be Investment Strategy
    const container = await screen.findByTestId("wizard-step-investment-strategy-container");
    expect(container).toBeInTheDocument();
  });

  it('handles invalid step gracefully', async () => {
    render(
      <MemoryRouter initialEntries={["/fund-setup?step=99"]}>
        <Routes>
          <Route path="/fund-setup" element={
            <TestWrapper>
              <FundSetup />
            </TestWrapper>
          } />
        </Routes>
      </MemoryRouter>
    );

    // Invalid step should show StepNotFound
    const container = await screen.findByTestId("wizard-step-not-found-container");
    expect(container).toBeInTheDocument();
  });

  it('defaults to investment strategy when no step specified', async () => {
    render(
      <MemoryRouter initialEntries={["/fund-setup"]}>
        <Routes>
          <Route path="/fund-setup" element={
            <TestWrapper>
              <FundSetup />
            </TestWrapper>
          } />
        </Routes>
      </MemoryRouter>
    );

    // Default should be Investment Strategy
    const container = await screen.findByTestId("wizard-step-investment-strategy-container");
    expect(container).toBeInTheDocument();
  });
});