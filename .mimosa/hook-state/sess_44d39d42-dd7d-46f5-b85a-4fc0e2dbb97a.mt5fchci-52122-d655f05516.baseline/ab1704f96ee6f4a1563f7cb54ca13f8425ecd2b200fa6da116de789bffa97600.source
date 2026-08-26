import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAIUsage, useAskAllAIs } from '@/hooks/useAI';

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

describe('Wave 3 useAI boundary', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses AI ask responses from the API envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              model: 'gpt',
              text: 'Ship the plan.',
              usage: {
                prompt_tokens: 11,
                completion_tokens: 7,
                total_tokens: 18,
              },
              cost_usd: 0.42,
              elapsed_ms: 125,
            },
            {
              model: 'claude',
              error: 'rate limited',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { result } = renderHook(() => useAskAllAIs(), {
      wrapper: createWrapper(),
    });

    let payload: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      payload = await result.current.mutateAsync({
        prompt: 'What changed?',
        models: ['gpt', 'claude'],
        tags: ['wave3'],
      });
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'What changed?',
        models: ['gpt', 'claude'],
        tags: ['wave3'],
      }),
    });
    expect(payload).toEqual([
      {
        model: 'gpt',
        text: 'Ship the plan.',
        usage: {
          prompt_tokens: 11,
          completion_tokens: 7,
          total_tokens: 18,
        },
        cost_usd: 0.42,
        elapsed_ms: 125,
      },
      {
        model: 'claude',
        error: 'rate limited',
        text: undefined,
        usage: undefined,
        cost_usd: undefined,
        elapsed_ms: undefined,
      },
    ]);
  });

  it('parses AI usage stats from the API envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          calls_today: 3,
          limit: 25,
          remaining: 22,
          total_cost_usd: 1.75,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { result } = renderHook(() => useAIUsage(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/ai/usage');
    expect(result.current.data).toEqual({
      calls_today: 3,
      limit: 25,
      remaining: 22,
      total_cost_usd: 1.75,
    });
  });
});
