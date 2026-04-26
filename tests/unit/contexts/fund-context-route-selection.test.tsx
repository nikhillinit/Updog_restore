import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
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
  const { currentFund, needsSetup, isLoading, isDemoMode } = useFundContext();

  if (isLoading) {
    return <div>loading</div>;
  }

  return (
    <div>
      {currentFund?.id ?? 'none'}:{currentFund?.name ?? 'none'}:{String(needsSetup)}:
      {String(isDemoMode)}
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
      expect(screen.getByText('2:Route Fund:false:false')).toBeInTheDocument();
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
      expect(screen.getByText('1:First Fund:false:false')).toBeInTheDocument();
    });
  });

  it('does not silently inherit the first fund on /financial-modeling', async () => {
    const { Wrapper } = createWouterWrapper('/financial-modeling');

    render(
      <Wrapper>
        <FundProvider>
          <Consumer />
        </FundProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('none:none:false:false')).toBeInTheDocument();
    });
  });

  it('does not silently inherit the first fund on /forecasting', async () => {
    const { Wrapper } = createWouterWrapper('/forecasting');

    render(
      <Wrapper>
        <FundProvider>
          <Consumer />
        </FundProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('none:none:false:false')).toBeInTheDocument();
    });
  });

  it('does not silently select the only available production fund on /forecasting', async () => {
    mockUseQuery.mockReturnValue({
      data: [mockFunds[0]],
      isLoading: false,
      error: null,
    });
    const { Wrapper } = createWouterWrapper('/forecasting');

    render(
      <Wrapper>
        <FundProvider>
          <Consumer />
        </FundProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('none:none:false:false')).toBeInTheDocument();
    });
  });

  it('uses an explicit route-scoped fund ID on /forecasting', async () => {
    const { Wrapper } = createWouterWrapper('/forecasting?fundId=2');

    render(
      <Wrapper>
        <FundProvider>
          <Consumer />
        </FundProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('2:Route Fund:false:false')).toBeInTheDocument();
    });
  });

  it('uses an explicit route-scoped fund ID on /financial-modeling', async () => {
    const { Wrapper } = createWouterWrapper('/financial-modeling?fundId=2');

    render(
      <Wrapper>
        <FundProvider>
          <Consumer />
        </FundProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('2:Route Fund:false:false')).toBeInTheDocument();
    });
  });

  it('does not silently inherit the first fund on /model-results', async () => {
    const { Wrapper } = createWouterWrapper('/model-results');

    render(
      <Wrapper>
        <FundProvider>
          <Consumer />
        </FundProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('none:none:false:false')).toBeInTheDocument();
    });
  });

  it('does not silently select the only available production fund on /model-results', async () => {
    mockUseQuery.mockReturnValue({
      data: [mockFunds[0]],
      isLoading: false,
      error: null,
    });
    const { Wrapper } = createWouterWrapper('/model-results');

    render(
      <Wrapper>
        <FundProvider>
          <Consumer />
        </FundProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('none:none:false:false')).toBeInTheDocument();
    });
  });

  it('drops an implicit first-fund selection when navigating from /dashboard to /financial-modeling', async () => {
    const { Wrapper, goto } = createWouterWrapper('/dashboard');

    render(
      <Wrapper>
        <FundProvider>
          <Consumer />
        </FundProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('1:First Fund:false:false')).toBeInTheDocument();
    });

    act(() => {
      goto('/financial-modeling');
    });

    await waitFor(() => {
      expect(screen.getByText('none:none:false:false')).toBeInTheDocument();
    });
  });

  it('preserves a route-addressed fund when navigating from results to /financial-modeling', async () => {
    const { Wrapper, goto } = createWouterWrapper('/fund-model-results/2');

    render(
      <Wrapper>
        <FundProvider>
          <Consumer />
        </FundProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('2:Route Fund:false:false')).toBeInTheDocument();
    });

    act(() => {
      goto('/financial-modeling');
    });

    await waitFor(() => {
      expect(screen.getByText('2:Route Fund:false:false')).toBeInTheDocument();
    });
  });

  it('preserves a route-addressed fund when navigating from results to /model-results', async () => {
    const { Wrapper, goto } = createWouterWrapper('/fund-model-results/2');

    render(
      <Wrapper>
        <FundProvider>
          <Consumer />
        </FundProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('2:Route Fund:false:false')).toBeInTheDocument();
    });

    act(() => {
      goto('/model-results');
    });

    await waitFor(() => {
      expect(screen.getByText('2:Route Fund:false:false')).toBeInTheDocument();
    });
  });

  it('still requires setup on /financial-modeling when no funds can be loaded', async () => {
    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('API unavailable'),
    });

    const { Wrapper } = createWouterWrapper('/financial-modeling');

    render(
      <Wrapper>
        <FundProvider>
          <Consumer />
        </FundProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('none:none:true:false')).toBeInTheDocument();
    });
  });

  it('requires setup instead of synthesizing a demo fund when funds cannot be loaded', async () => {
    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('API unavailable'),
    });

    const { Wrapper } = createWouterWrapper('/dashboard');

    render(
      <Wrapper>
        <FundProvider>
          <Consumer />
        </FundProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('none:none:true:false')).toBeInTheDocument();
    });
  });

  it('treats demo mode as non-setup state even when funds cannot be loaded', async () => {
    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('API unavailable'),
    });

    localStorage.setItem('DEMO_TOOLBAR', '1');

    const { Wrapper } = createWouterWrapper('/dashboard');

    render(
      <Wrapper>
        <FundProvider>
          <Consumer />
        </FundProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('none:none:false:true')).toBeInTheDocument();
    });
  });
});
