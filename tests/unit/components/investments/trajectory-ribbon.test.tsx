import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { InvestmentRoundResponse } from '@shared/contracts/investments/investment-round.contract';
import { TrajectoryRibbon } from '@/components/investments/trajectory-ribbon';

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

describe('TrajectoryRibbon', () => {
  it('renders one node per round, sorted by date ascending', () => {
    render(
      <TrajectoryRibbon
        rounds={[
          round({ id: 2, roundName: 'Series A', roundDate: '2025-01-10' }),
          round({ id: 1, roundName: 'Seed', roundDate: '2024-06-01' }),
        ]}
      />
    );
    const nodes = screen.getAllByTestId('ribbon-node');
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toHaveTextContent('Seed');
    expect(nodes[1]).toHaveTextContent('Series A');
  });

  it('centers a single round without NaN positions', () => {
    const { container } = render(<TrajectoryRibbon rounds={[round({ id: 1 })]} />);
    const circle = container.querySelector('circle[cx]') as SVGCircleElement;
    expect(Number.isFinite(Number(circle.getAttribute('cx')))).toBe(true);
  });

  it('renders nothing for no rounds', () => {
    const { container } = render(<TrajectoryRibbon rounds={[]} />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
