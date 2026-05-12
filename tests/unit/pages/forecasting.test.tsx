import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useLocation, useSearch } from 'wouter';
import Forecasting from '@/pages/forecasting';
import { createWouterWrapper } from '../../utils/withWouter';

const mockUseFundContext = vi.fn();

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => mockUseFundContext(),
}));

vi.mock('@/pages/financial-modeling', () => ({
  default: () => <div>Financial Modeling Surface</div>,
}));

function LocationProbe() {
  const [location] = useLocation();
  const search = useSearch();
  return <div data-testid="location">{`${location}${search ? `?${search}` : ''}`}</div>;
}

describe('Forecasting compatibility route', () => {
  afterEach(() => {
    mockUseFundContext.mockReset();
  });

  it('normalizes to a fund-scoped forecasting URL when a fund is available', async () => {
    mockUseFundContext.mockReturnValue({
      currentFund: { id: 42, name: 'Fund Forty Two' },
    });
    const { Wrapper } = createWouterWrapper('/forecasting');

    render(
      <>
        <Forecasting />
        <LocationProbe />
      </>,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/forecasting?fundId=42');
    });
  });

  it('does not rewrite an already fund-scoped forecasting URL', () => {
    mockUseFundContext.mockReturnValue({
      currentFund: { id: 42, name: 'Fund Forty Two' },
    });
    const { Wrapper } = createWouterWrapper('/forecasting?fundId=7');

    render(
      <>
        <Forecasting />
        <LocationProbe />
      </>,
      { wrapper: Wrapper }
    );

    expect(screen.getByTestId('location').textContent).toBe('/forecasting?fundId=7');
    expect(screen.getByText('Financial Modeling Surface')).toBeInTheDocument();
  });

  it('renders the fund-required modeling surface when no fund is available', () => {
    mockUseFundContext.mockReturnValue({
      currentFund: null,
    });
    const { Wrapper } = createWouterWrapper('/forecasting');

    render(<Forecasting />, { wrapper: Wrapper });

    expect(screen.getByText('Financial Modeling Surface')).toBeInTheDocument();
  });
});
