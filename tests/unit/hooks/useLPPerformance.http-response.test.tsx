import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLPPerformance } from '@/hooks/useLPPerformance';
import { SERVER_ERROR_MESSAGE } from '@/lib/http-response';

const { mockUseLPContext } = vi.hoisted(() => ({
  mockUseLPContext: vi.fn(),
}));

vi.mock('@/contexts/LPContext', () => ({
  useLPContext: () => mockUseLPContext(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        retryDelay: 1,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function mockFetchResponse(body: string, status = 500) {
  vi.stubGlobal(
    'fetch',
    vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockImplementation(() =>
      Promise.resolve(
        new Response(body, {
          status,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
  );
}
describe('useLPPerformance HTTP response handling', () => {
  beforeEach(() => {
    mockUseLPContext.mockReturnValue({ lpId: 17 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('suppresses server message payloads when performance fetch fails', async () => {
    mockFetchResponse(JSON.stringify({ message: 'Performance unavailable' }), 503);

    const { result } = renderHook(() => useLPPerformance({ fundId: 7 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe(SERVER_ERROR_MESSAGE);
  });

  it.each([
    { status: 400, message: 'HTTP 400: Failed to fetch performance' },
    { status: 500, message: SERVER_ERROR_MESSAGE },
  ])('handles unreadable HTTP $status performance error JSON', async ({ status, message }) => {
    mockFetchResponse('not-json', status);

    const { result } = renderHook(() => useLPPerformance({ fundId: 7 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe(message);
  });
});
