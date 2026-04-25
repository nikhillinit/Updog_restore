import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLatestAllocations } from '../../../../client/src/components/portfolio/tabs/hooks/useLatestAllocations';

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: 1 }),
}));

function Harness() {
  const query = useLatestAllocations();

  if (query.error instanceof Error) {
    return <div>{query.error.message}</div>;
  }

  if (query.data) {
    return <div>loaded</div>;
  }

  return <div>loading</div>;
}

function renderHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  );
}

describe('useLatestAllocations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('reports HTML responses as contract errors instead of JSON parse crashes', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    });

    renderHarness();

    await waitFor(() => {
      expect(screen.getByText(/expected JSON but received text\/html/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/unexpected token/i)).not.toBeInTheDocument();
  });
});
