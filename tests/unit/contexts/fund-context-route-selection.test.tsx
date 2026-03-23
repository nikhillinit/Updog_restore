import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FundProvider, useFundContext } from '@/contexts/FundContext';
import { createWouterWrapper } from '../../utils/withWouter';

const mockUseQuery = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

const mockFunds = [
  {
    id: 1,
    name: 'First Fund',
    size: 25_000_000,
    managementFee: 0.02,
    carryPercentage: 0.2,
    vintageYear: 2024,
    deployedCapital: 0,
    status: 'active',
    createdAt: '2026-03-22T00:00:00.000Z',
    updatedAt: '2026-03-22T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Route Fund',
    size: 50_000_000,
    managementFee: 0.02,
    carryPercentage: 0.2,
    vintageYear: 2025,
    deployedCapital: 0,
    status: 'active',
    createdAt: '2026-03-22T00:00:00.000Z',
    updatedAt: '2026-03-22T00:00:00.000Z',
  },
];

function Consumer() {
  const { currentFund, needsSetup, isLoading } = useFundContext();

  if (isLoading) {
    return <div>loading</div>;
  }

  return (
    <div>
      {currentFund?.id ?? 'none'}:{currentFund?.name ?? 'none'}:{String(needsSetup)}
    </div>
  );
}

describe('FundProvider route-aware selection', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      data: mockFunds,
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('prefers the route fund ID on /fund-model-results/:fundId', async () => {
    const { Wrapper } = createWouterWrapper('/fund-model-results/2');

    render(
      <Wrapper>
        <FundProvider>
          <Consumer />
        </FundProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('2:Route Fund:false')).toBeInTheDocument();
    });
  });

  it('falls back to the first fund on non-results routes', async () => {
    const { Wrapper } = createWouterWrapper('/dashboard');

    render(
      <Wrapper>
        <FundProvider>
          <Consumer />
        </FundProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('1:First Fund:false')).toBeInTheDocument();
    });
  });
});
