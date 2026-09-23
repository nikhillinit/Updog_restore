import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CapitalStructureStep from '@/pages/CapitalStructureStep';
import { fundStore } from '@/stores/fundStore';

vi.mock('wouter', () => ({
  useLocation: () => ['/fund-setup?step=3', vi.fn()],
}));

describe('CapitalStructureStep dollar units', () => {
  beforeEach(() => {
    const initialState = fundStore.getInitialState();
    const seed = initialState.capitalPlanAllocations.find(
      (allocation) => allocation.entryRound === 'Seed'
    );
    if (!seed) throw new Error('Expected default Seed allocation');

    act(() => {
      fundStore.setState(
        {
          ...initialState,
          hydrated: true,
          fundSize: 72_000_000,
          capitalPlanAllocations: [
            {
              ...seed,
              id: 'seed-allocation',
              name: 'Seed allocation',
              capitalAllocationPct: 100,
              initialCheckStrategy: 'amount',
              initialCheckAmount: 500_000,
            },
          ],
        },
        true
      );
    });
  });

  it('uses dollar fund and check values for allocation and ownership outputs', async () => {
    render(<CapitalStructureStep />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit Seed allocation' }));

    expect(screen.getByText(/Initial Investment Capital:/)).toHaveTextContent('$72,000,000');
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === 'P' &&
          element.textContent?.includes('Implied Entry Ownership:') === true &&
          element.textContent.includes('~3.3%')
      )
    ).toBeInTheDocument();
  });
});
