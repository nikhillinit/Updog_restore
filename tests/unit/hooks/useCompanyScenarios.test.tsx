import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCompanyScenarios } from '@/hooks/useCompanyScenarios';
import { companyScenarioListQueryKey } from '@/lib/fund-scenario-workspace-query-keys';
import { apiRequest } from '@/lib/queryClient';

vi.mock('@/lib/queryClient', async (orig) => {
  const actual = await orig<typeof import('@/lib/queryClient')>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockApiRequest = vi.mocked(apiRequest);
const SCENARIO = {
  id: '00000000-0000-4000-8000-000000000101',
  name: 'Base case',
  version: 4,
  updatedAt: '2026-07-15T10:00:00.000Z',
  isLocked: false,
  caseCount: 2,
};

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useCompanyScenarios', () => {
  beforeEach(() => mockApiRequest.mockReset());

  it('fetches and validates the unflagged company scenario list', async () => {
    mockApiRequest.mockResolvedValue([SCENARIO]);

    const { result } = renderHook(() => useCompanyScenarios('101'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockApiRequest).toHaveBeenCalledWith('GET', '/api/companies/101/scenarios');
    expect(result.current.scenarios).toEqual([SCENARIO]);
    expect(companyScenarioListQueryKey('101')).toEqual(['company-scenarios', '101']);
  });

  it('does not fetch until a company is selected', () => {
    const { result } = renderHook(() => useCompanyScenarios(null), { wrapper: wrapper() });

    expect(mockApiRequest).not.toHaveBeenCalled();
    expect(result.current.scenarios).toEqual([]);
  });

  it('surfaces malformed server data instead of making it actionable', async () => {
    mockApiRequest.mockResolvedValue([{ ...SCENARIO, caseCount: -1 }]);

    const { result } = renderHook(() => useCompanyScenarios('101'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.scenarios).toEqual([]);
  });
});
