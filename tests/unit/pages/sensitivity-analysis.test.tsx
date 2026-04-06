import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: 7 }),
}));

vi.mock('@/components/backtesting/BacktestingWorkspace', () => ({
  BacktestingWorkspace: ({
    fundId,
    showHeader,
  }: {
    fundId: number | null;
    showHeader?: boolean;
  }) => (
    <div data-testid="backtesting-workspace">
      workspace:{String(fundId)}:{String(showHeader)}
    </div>
  ),
}));

vi.mock('@/components/sensitivity/OneWayPanel', () => ({
  OneWayPanel: ({ fundId }: { fundId: number | null }) => (
    <div data-testid="one-way-panel">one-way-panel:{String(fundId)}</div>
  ),
}));

vi.mock('@/components/sensitivity/TwoWayPanel', () => ({
  TwoWayPanel: ({ fundId }: { fundId: number | null }) => (
    <div data-testid="two-way-panel">two-way-panel:{String(fundId)}</div>
  ),
}));

import SensitivityAnalysisPage from '@/pages/sensitivity-analysis';

describe('SensitivityAnalysisPage', () => {
  it('renders the live Monte Carlo workspace and exposes the one-way and two-way tabs as enabled', () => {
    render(<SensitivityAnalysisPage />);

    expect(screen.getByText('Sensitivity Analysis')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Monte Carlo backtesting, one-way parameter sensitivity, and two-way parameter\s+sensitivity are live/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/fund-scoped backend endpoint, a stable comparison contract, and persisted/i)
    ).toBeInTheDocument();

    expect(screen.getByRole('tab', { name: 'Monte Carlo Backtesting' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'One-Way Analysis' })).not.toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Two-Way Sensitivity' })).not.toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Stress Testing' })).toBeDisabled();

    // Default tab is monte-carlo, so the embedded backtesting workspace is mounted.
    expect(screen.getByTestId('backtesting-workspace')).toHaveTextContent('workspace:7:false');
  });

  it('mounts the OneWayPanel inside the one-way tab content', async () => {
    const user = userEvent.setup();
    render(<SensitivityAnalysisPage />);

    await user.click(screen.getByRole('tab', { name: 'One-Way Analysis' }));

    expect(screen.getByTestId('one-way-panel')).toHaveTextContent('one-way-panel:7');
  });

  it('mounts the TwoWayPanel inside the two-way tab content', async () => {
    const user = userEvent.setup();
    render(<SensitivityAnalysisPage />);

    await user.click(screen.getByRole('tab', { name: 'Two-Way Sensitivity' }));

    expect(screen.getByTestId('two-way-panel')).toHaveTextContent('two-way-panel:7');
  });
});
