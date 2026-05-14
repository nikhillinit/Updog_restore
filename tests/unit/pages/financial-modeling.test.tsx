import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FinancialModeling from '@/pages/financial-modeling';

vi.mock('@/components/dashboard/dual-forecast-dashboard', () => ({
  default: () => <div>Dual Forecast Dashboard</div>,
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
    expect(screen.getByRole('tab', { name: /api-based projection/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /scenario modeling/i })).toBeInTheDocument();
    expect(screen.getByText('Dual Forecast Dashboard')).toBeInTheDocument();
  });

  it('treats the scenario-modeling tab as deferred instead of live placeholder content', async () => {
    const user = userEvent.setup();
    render(<FinancialModeling />);

    await user.click(screen.getByRole('tab', { name: /scenario modeling/i }));

    expect(screen.getByText(/scenario modeling remains deferred/i)).toBeInTheDocument();
    expect(
      screen.getByText(/intentionally not presenting hardcoded kpi cards or placeholder charts/i)
    ).toBeInTheDocument();
  });
});
