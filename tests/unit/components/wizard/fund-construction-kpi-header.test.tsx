import { act, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { FundConstructionKpiHeader } from '@/components/wizard/FundConstructionKpiHeader';
import { fundStore } from '@/stores/fundStore';

describe('FundConstructionKpiHeader', () => {
  beforeEach(() => {
    const initialState = fundStore.getInitialState();
    act(() => {
      fundStore.setState(
        {
          ...initialState,
          hydrated: true,
          fundName: 'Builder Fund I',
          fundSize: 75,
          managementFeeRate: 2,
          carriedInterest: 20,
          fundLife: 10,
          investmentPeriod: 5,
        },
        true
      );
    });
  });

  it('uses dashboard header KPI cards backed by draft fund construction inputs', () => {
    render(<FundConstructionKpiHeader />);

    const investedCard = screen.getByTestId('construction-kpi-totalInvested');
    expect(investedCard).toHaveTextContent('Total Invested');
    expect(investedCard).toHaveTextContent('$75.0M');
    expect(
      within(investedCard).getByRole('button', { name: 'Planned capital from Builder Fund I' })
    ).toBeInTheDocument();

    expect(screen.getByTestId('construction-kpi-dpi')).toHaveTextContent('DPI');
    expect(screen.getByTestId('construction-kpi-dpi')).not.toHaveTextContent('No distributions');
    expect(
      within(screen.getByTestId('construction-kpi-tvpi')).getByText(/\d+\.\d{2}x/)
    ).toBeInTheDocument();
    expect(screen.getByTestId('construction-kpi-currentValue')).toHaveTextContent('Current Value');
    expect(screen.getByTestId('construction-kpi-currentValue')).not.toHaveTextContent('N/A');
    expect(screen.getByTestId('construction-kpi-avgCheckSize')).toHaveTextContent('$500.0K');
  });

  it('hides the header when no draft KPI values are actionable yet', () => {
    const initialState = fundStore.getInitialState();
    act(() => {
      fundStore.setState(
        {
          ...initialState,
          hydrated: true,
          fundName: '',
          fundSize: undefined,
          capitalPlanAllocations: [],
        },
        true
      );
    });

    const { container } = render(<FundConstructionKpiHeader />);

    expect(container.firstChild).toBeNull();
  });
});
