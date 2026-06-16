import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCashFlowEvents } from '@/hooks/useCashFlowEvents';

const sampleEvent = {
  id: 10,
  fundId: 1,
  eventType: 'lp_capital_call',
  amount: '1250000.000000',
  currency: 'USD',
  eventDate: '2026-06-15T00:00:00.000Z',
  perspective: 'lp_net',
  description: null,
  payload: { callNumber: 1 },
  status: 'draft',
  createdAt: '2026-06-15T00:00:00.000Z',
};

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function mockFetchJson(payload: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: vi.fn().mockResolvedValue(payload),
    })
  );
}

describe('useCashFlowEvents', () => {
  beforeEach(() => {
    mockFetchJson({ data: [sampleEvent] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not fetch when there is no fund id', async () => {
    renderHook(() => useCashFlowEvents(undefined), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when disabled', async () => {
    renderHook(() => useCashFlowEvents('1', { enabled: false }), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches the fund-scoped endpoint and unwraps the data array', async () => {
    const { result } = renderHook(() => useCashFlowEvents('1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetch).toHaveBeenCalledWith('/api/funds/1/cash-flow-events');
    expect(result.current.data).toEqual([sampleEvent]);
  });

  it('surfaces API error messages', async () => {
    mockFetchJson({ message: 'Cash events unavailable' }, false);
    const { result } = renderHook(() => useCashFlowEvents('1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Cash events unavailable');
  });
});
