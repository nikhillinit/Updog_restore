import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { InvestmentRoundResponse } from '@shared/contracts/investments/investment-round.contract';
import { RoundsTable } from './rounds-table';

function round(over: Partial<InvestmentRoundResponse>): InvestmentRoundResponse {
  return {
    id: 1,
    investmentId: 3,
    fundId: 7,
    roundName: 'Seed',
    securityType: 'equity',
    roundDate: '2024-06-01',
    currency: 'USD',
    investmentAmount: '25000',
    roundSize: null,
    preMoneyValuation: null,
    supersedesRoundId: null,
    createdAt: '2024-06-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    etag: 'W/"1"',
    ...over,
  };
}

describe('RoundsTable', () => {
  it('shows the corrected tag only when supersedesRoundId is set', () => {
    render(
      <RoundsTable
        rounds={[
          round({ id: 1, roundName: 'Seed' }),
          round({ id: 2, roundName: 'Series A', supersedesRoundId: 1 }),
        ]}
        onAdd={() => {}}
        onSupersede={() => {}}
      />
    );
    expect(screen.getAllByText(/corrected/i)).toHaveLength(1);
    expect(screen.getByText('Series A')).toBeInTheDocument();
  });

  it('wires add and per-row supersede', () => {
    const onAdd = vi.fn();
    const onSupersede = vi.fn();
    const r = round({ id: 9, roundName: 'Seed' });
    render(<RoundsTable rounds={[r]} onAdd={onAdd} onSupersede={onSupersede} />);
    fireEvent.click(screen.getByRole('button', { name: /add round/i }));
    fireEvent.click(screen.getByRole('button', { name: /^correct$/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onSupersede).toHaveBeenCalledWith(r);
  });

  it('renders an empty state', () => {
    render(<RoundsTable rounds={[]} onAdd={() => {}} onSupersede={() => {}} />);
    expect(screen.getByText(/no rounds recorded/i)).toBeInTheDocument();
  });
});
