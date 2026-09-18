import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFundCashFlowInputs } from '@/hooks/useFundCashFlowInputs';
import { apiRequest } from '@/lib/queryClient';
import { fundStore } from '@/stores/fundStore';

vi.mock('@/lib/queryClient', async (orig) => {
  const actual = await orig<typeof import('@/lib/queryClient')>();
  return { ...actual, apiRequest: vi.fn() };
});

const currentFund = {
  id: 2,
  name: 'F1 / Fund One',
  size: 15_320_000,
  managementFee: 0.02,
  carryPercentage: 0.2,
  vintageYear: 2024,
  deployedCapital: 0,
  status: 'active',
  createdAt: '2026-09-15T00:00:00.000Z',
  updatedAt: '2026-09-15T00:00:00.000Z',
};

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ currentFund }),
}));

const mockApi = vi.mocked(apiRequest);
const wizardExpense = { id: 'legal', category: 'legal', monthlyAmount: 5_000, startMonth: 1 };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useFundCashFlowInputs', () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockResolvedValue([
      {
        id: 1,
        fundId: 2,
        companyId: 10,
        investmentDate: '2024-07-01T00:00:00.000Z',
        amount: '400000.00',
        round: 'Seed',
      },
    ]);
    fundStore.setState({ draftFundId: null, fundExpenses: [] });
  });

  it('stays undefined when no fund id is given (demo mode)', () => {
    const { result } = renderHook(() => useFundCashFlowInputs(null, 12), { wrapper });

    expect(result.current).toBeUndefined();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('uses wizard assumptions only when the store draft belongs to this fund', async () => {
    fundStore.setState({ draftFundId: 99, fundExpenses: [wizardExpense] });
    const other = renderHook(() => useFundCashFlowInputs('2', 12), { wrapper });
    await waitFor(() => expect(other.result.current).toBeDefined());
    expect(other.result.current?.recurringExpenses).toEqual([]);

    fundStore.setState({ draftFundId: 2, fundExpenses: [wizardExpense] });
    const own = renderHook(() => useFundCashFlowInputs('2', 12), { wrapper });
    await waitFor(() => expect(own.result.current).toBeDefined());
    expect(own.result.current?.recurringExpenses.map((e) => e.name)).toEqual(['legal']);
    expect(mockApi).toHaveBeenCalledWith('GET', '/api/investments?fundId=2');
  });
});
