import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useGraduationDefaults,
  useGraduationProjection,
} from '@/hooks/use-graduation';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('Wave 3 use-graduation boundary', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses graduation projection responses into the typed summary contract', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          mode: 'expectation',
          seed: 17,
          totalCompanies: 20,
          expectedGraduationRate: 12.5,
          expectedFailureRate: 30,
          stageDistribution: {
            seed: 10,
            series_a: 5,
            series_b: 2,
            series_c: 1,
            exit: 1,
            failed: 1,
          },
          quarterlyProjections: [
            {
              quarter: 1,
              expectedGraduates: 2,
              expectedFailures: 1,
              stageDistribution: {
                seed: 9,
                series_a: 6,
                series_b: 2,
                series_c: 1,
                exit: 1,
                failed: 1,
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { result } = renderHook(() => useGraduationProjection(), {
      wrapper: createWrapper(),
    });

    let payload: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      payload = await result.current.mutateAsync({
        initialCompanies: 20,
        horizonQuarters: 4,
        expectationMode: true,
      });
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/graduation/project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initialCompanies: 20,
        horizonQuarters: 4,
        expectationMode: true,
      }),
    });
    expect(payload).toEqual({
      mode: 'expectation',
      seed: 17,
      totalCompanies: 20,
      expectedGraduationRate: 12.5,
      expectedFailureRate: 30,
      stageDistribution: {
        seed: 10,
        series_a: 5,
        series_b: 2,
        series_c: 1,
        exit: 1,
        failed: 1,
      },
      quarterlyProjections: [
        {
          quarter: 1,
          expectedGraduates: 2,
          expectedFailures: 1,
          stageDistribution: {
            seed: 9,
            series_a: 6,
            series_b: 2,
            series_c: 1,
            exit: 1,
            failed: 1,
          },
        },
      ],
    });
  });

  it('parses graduation defaults into the typed config contract', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          expectationMode: false,
          seed: 99,
          transitions: {
            seedToA: { graduate: 35, fail: 15, remain: 50 },
            aToB: { graduate: 20, fail: 10, remain: 70 },
            bToC: { graduate: 10, fail: 20, remain: 70 },
            cToExit: { graduate: 25, fail: 5, remain: 70 },
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { result } = renderHook(() => useGraduationDefaults(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/graduation/defaults');
    expect(result.current.data).toEqual({
      expectationMode: false,
      seed: 99,
      transitions: {
        seedToA: { graduate: 35, fail: 15, remain: 50 },
        aToB: { graduate: 20, fail: 10, remain: 70 },
        bToC: { graduate: 10, fail: 20, remain: 70 },
        cToExit: { graduate: 25, fail: 5, remain: 70 },
      },
    });
  });
});
