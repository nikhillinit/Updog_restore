import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'wouter';
import { createWouterWrapper } from '../../utils/withWouter';
import ModelResults from '@/pages/model-results';

const mockUseFundContext = vi.fn();

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => mockUseFundContext(),
}));

function LocationProbe() {
  const [location] = useLocation();
  return <div data-testid="location">{location}</div>;
}

describe('ModelResults compatibility route', () => {
  afterEach(() => {
    mockUseFundContext.mockReset();
  });

  it('redirects to canonical fund results when a fund is explicitly available', async () => {
    mockUseFundContext.mockReturnValue({
      currentFund: { id: 42, name: 'Fund Forty Two' },
    });
    const { Wrapper } = createWouterWrapper('/model-results');

    render(
      <>
        <ModelResults />
        <LocationProbe />
      </>,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/fund-model-results/42');
    });
  });

  it('renders a recoverable fund-required state without a current fund', () => {
    mockUseFundContext.mockReturnValue({
      currentFund: null,
    });
    const { Wrapper } = createWouterWrapper('/model-results');

    render(<ModelResults />, { wrapper: Wrapper });

    expect(screen.getByText(/select a fund to view model results/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /set up a fund/i })).toHaveAttribute(
      'href',
      '/fund-setup'
    );
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });
});
