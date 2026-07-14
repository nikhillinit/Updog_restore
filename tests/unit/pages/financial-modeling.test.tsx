import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FinancialModeling from '@/pages/financial-modeling';

vi.mock('@/components/dashboard/dual-forecast-dashboard', () => ({
  default: () => <div>Dual Forecast Dashboard</div>,
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    fundId: 42,
    currentFund: { id: 42, name: 'Fund Forty Two' },
  }),
}));

describe('FinancialModeling page', () => {
  it('defaults to the API-based projection surface', () => {
    render(<FinancialModeling />);

    expect(
      screen.getByRole('heading', { name: /financial modeling & forecasting/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/forward-looking values are labeled as projections/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /fund projection/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /scenario modeling/i })).toBeInTheDocument();
    expect(screen.getByText('Dual Forecast Dashboard')).toBeInTheDocument();
    // Plan 9 Wave 9B1: workspace row mounts here with the comparison-surface
    // indicator and Forecast marked active.
    const forecastLink = screen.getByRole('link', { name: 'Forecast' });
    expect(forecastLink).toHaveAttribute('aria-current', 'page');
    expect(forecastLink).toHaveAttribute('href', '/financial-modeling?fundId=42');
    expect(screen.getByText('Basis: Construction and Current — side by side')).toBeInTheDocument();
    expect(
      screen.queryByText(/api facts|api-based|canonical deterministic/i)
    ).not.toBeInTheDocument();
  });

  it('treats the scenario-modeling tab as deferred instead of live placeholder content', async () => {
    const user = userEvent.setup();
    render(<FinancialModeling />);

    await user.click(screen.getByRole('tab', { name: /scenario modeling/i }));

    expect(screen.getByText(/scenario modeling remains deferred/i)).toBeInTheDocument();
    expect(
      screen.getByText(/intentionally not presenting hardcoded kpi cards or placeholder charts/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/api facts|api-based|canonical deterministic/i)
    ).not.toBeInTheDocument();
  });
});
