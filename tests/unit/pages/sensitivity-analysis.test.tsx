import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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

import SensitivityAnalysisPage from '@/pages/sensitivity-analysis';

describe('SensitivityAnalysisPage', () => {
  it('renders the Monte Carlo shell with disabled tabs and embedded workspace', () => {
    render(<SensitivityAnalysisPage />);

    expect(screen.getByText('Sensitivity Analysis')).toBeInTheDocument();
    expect(
      screen.getByText(
        /fund-scoped backend endpoint, a stable comparison contract, and persisted scenario data/i
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Monte Carlo Backtesting' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'One-Way Analysis' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Two-Way Sensitivity' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Stress Testing' })).toBeDisabled();
    expect(screen.getByTestId('backtesting-workspace')).toHaveTextContent('workspace:7:false');
  });
});
