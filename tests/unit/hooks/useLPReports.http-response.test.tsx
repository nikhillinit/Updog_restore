import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useDownloadLPReport,
  useGenerateLPReport,
  useLPReports,
  useLPReportStatus,
} from '@/hooks/useLPReports';
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
describe('useLPReports HTTP response handling', () => {
  beforeEach(() => {
    mockUseLPContext.mockReturnValue({ lpId: 17 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('suppresses server message payloads when report listing fails', async () => {
    mockFetchResponse(JSON.stringify({ message: 'Reports unavailable' }), 503);

    const { result } = renderHook(() => useLPReports(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe(SERVER_ERROR_MESSAGE);
  });

  it.each([
    { status: 400, message: 'HTTP 400: Failed to fetch reports' },
    { status: 500, message: SERVER_ERROR_MESSAGE },
  ])('handles unreadable HTTP $status report error JSON', async ({ status, message }) => {
    mockFetchResponse('not-json', status);

    const { result } = renderHook(() => useLPReports(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe(message);
  });

  it('surfaces API message payloads when report generation fails', async () => {
    mockFetchResponse(JSON.stringify({ message: 'Report generation unavailable' }), 422);

    const { result } = renderHook(() => useGenerateLPReport(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate({
        reportType: 'quarterly_statement',
        format: 'pdf',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Report generation unavailable');
  });

  it.each([
    { status: 400, message: 'HTTP 400: Failed to fetch report status' },
    { status: 500, message: SERVER_ERROR_MESSAGE },
  ])('handles unreadable HTTP $status report status error JSON', async ({ status, message }) => {
    mockFetchResponse('not-json', status);

    const { result } = renderHook(() => useLPReportStatus({ reportId: 'report-1' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe(message);
  });

  it('surfaces API message payloads when report download fails', async () => {
    mockFetchResponse(JSON.stringify({ message: 'Download expired' }), 410);

    const { result } = renderHook(() => useDownloadLPReport(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate('report-1');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Download expired');
  });
});
