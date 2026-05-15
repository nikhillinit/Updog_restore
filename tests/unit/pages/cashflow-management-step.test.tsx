import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CashflowManagementStep from '@/pages/CashflowManagementStep';
import { fundStore } from '@/stores/fundStore';

const mockNavigate = vi.fn();

vi.mock('wouter', () => ({
  useLocation: () => ['/fund-setup?step=6', mockNavigate],
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    currentFund: {
      id: 1,
      name: 'Test Fund I',
      size: 100_000_000,
    },
  }),
}));

describe('CashflowManagementStep', () => {
  beforeEach(() => {
    mockNavigate.mockReset();

    act(() => {
      fundStore.setState(
        {
          ...fundStore.getInitialState(),
          hydrated: true,
          fundExpenses: [],
        },
        true
      );
    });
  });

  it('keeps suggested expenses user-driven instead of auto-populating hidden rows', async () => {
    render(<CashflowManagementStep />);

    expect(fundStore.getState().fundExpenses).toHaveLength(0);
    expect(screen.getByText(/No expenses configured yet/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add Suggested Expenses' }));

    expect(fundStore.getState().fundExpenses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'Legal & Regulatory' }),
        expect.objectContaining({ category: 'Audit & Tax' }),
      ])
    );
    expect(fundStore.getState().fundExpenses).toHaveLength(5);
  });

  it('stores fixed-term expense end months only when the duration is explicit', async () => {
    render(<CashflowManagementStep />);

    await userEvent.type(screen.getByLabelText('Monthly expense amount'), '24000');
    await userEvent.click(screen.getByRole('switch', { name: 'Use ongoing expense duration' }));
    await userEvent.clear(screen.getByLabelText('Expense end month'));
    await userEvent.type(screen.getByLabelText('Expense end month'), '18');
    await userEvent.click(screen.getByRole('button', { name: 'Add Expense' }));

    expect(fundStore.getState().fundExpenses).toEqual([
      expect.objectContaining({
        category: 'legal',
        monthlyAmount: 24000,
        startMonth: 1,
        endMonth: 18,
      }),
    ]);
  });
});
