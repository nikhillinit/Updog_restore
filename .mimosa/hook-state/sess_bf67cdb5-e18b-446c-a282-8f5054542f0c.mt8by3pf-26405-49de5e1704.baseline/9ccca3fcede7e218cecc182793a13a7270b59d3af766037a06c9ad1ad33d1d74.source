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

vi.mock('@/components/sensitivity/StressPanel', () => ({
  StressPanel: ({ fundId }: { fundId: number | null }) => (
    <div data-testid="stress-panel">stress-panel:{String(fundId)}</div>
  ),
}));

import SensitivityAnalysisPage from '@/pages/sensitivity-analysis';

describe('SensitivityAnalysisPage', () => {
  it('renders the live Monte Carlo workspace and exposes all four tabs as enabled with normalized labels', () => {
    render(<SensitivityAnalysisPage />);

    expect(screen.getByText('Sensitivity Analysis')).toBeInTheDocument();
    // New four-live gate text replaces the previous stress-disabled copy.
    expect(
      screen.getByText(
        /Sensitivity analysis surface: Monte Carlo backtesting, one-way and two-way parameter\s+sweeps, and named stress scenarios/i
      )
    ).toBeInTheDocument();

    // Normalized tab labels (no more "Backtesting", "Analysis", "Sensitivity", "Testing" suffixes).
    expect(screen.getByRole('tab', { name: 'Monte Carlo' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'One-Way' })).not.toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Two-Way' })).not.toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Stress' })).not.toBeDisabled();

    // Per-tab "Live now" Cards have been removed from all 4 tabs as part of IA cleanup.
    expect(screen.queryByText('Live now')).toBeNull();

    // Default tab is monte-carlo, so the embedded backtesting workspace is mounted.
    expect(screen.getByTestId('backtesting-workspace')).toHaveTextContent('workspace:7:false');
    expect(screen.getByRole('tab', { name: 'Monte Carlo' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('mounts the OneWayPanel inside the one-way tab content', async () => {
    const user = userEvent.setup();
    render(<SensitivityAnalysisPage />);

    await user.click(screen.getByRole('tab', { name: 'One-Way' }));

    expect(screen.getByRole('tab', { name: 'One-Way' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('one-way-panel')).toHaveTextContent('one-way-panel:7');
  });

  it('mounts the TwoWayPanel inside the two-way tab content', async () => {
    const user = userEvent.setup();
    render(<SensitivityAnalysisPage />);

    await user.click(screen.getByRole('tab', { name: 'Two-Way' }));

    expect(screen.getByTestId('two-way-panel')).toHaveTextContent('two-way-panel:7');
  });

  it('mounts the StressPanel inside the stress tab content', async () => {
    const user = userEvent.setup();
    render(<SensitivityAnalysisPage />);

    await user.click(screen.getByRole('tab', { name: 'Stress' }));

    expect(screen.getByTestId('stress-panel')).toHaveTextContent('stress-panel:7');
  });
});
