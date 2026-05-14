import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PipelinePage from '@/pages/pipeline';
import { createWouterWrapper } from '../../utils/withWouter';

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: 7 }),
}));

vi.mock('@/core/flags/flagAdapter', () => ({
  useFeatureFlag: () => false,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPipelinePage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const response = await fetch(queryKey.join('/') as string, { credentials: 'include' });
          if (!response.ok) {
            throw new Error(`${response.status}: ${response.statusText}`);
          }
          return response.json();
        },
      },
      mutations: { retry: false },
    },
  });
  const { Wrapper } = createWouterWrapper('/pipeline');

  return render(
    <QueryClientProvider client={queryClient}>
      <PipelinePage />
    </QueryClientProvider>,
    { wrapper: Wrapper }
  );
}

describe('PipelinePage empty state', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url.includes('/api/deals/opportunities')) {
          return jsonResponse({
            success: true,
            data: [],
            pagination: { hasMore: false, nextCursor: null, count: 0 },
          });
        }

        if (url.includes('/api/deals/stages')) {
          return jsonResponse({ success: true, data: [] });
        }

        return new Response('Not found', { status: 404 });
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('offers both manual add and import paths when the active fund has no deals', async () => {
    renderPipelinePage();

    const emptyState = await screen.findByTestId('pipeline-empty-state');

    expect(
      within(emptyState).getByRole('heading', { name: /no deals in your pipeline/i })
    ).toBeInTheDocument();
    expect(within(emptyState).getByRole('button', { name: /add deal/i })).toBeVisible();
    expect(within(emptyState).getByRole('button', { name: /import deals/i })).toBeVisible();
  });

  it('opens the import dialog from the empty-state import action', async () => {
    const user = userEvent.setup();
    renderPipelinePage();

    const emptyState = await screen.findByTestId('pipeline-empty-state');
    await user.click(within(emptyState).getByRole('button', { name: /import deals/i }));

    expect(await screen.findByRole('dialog', { name: /import deals/i })).toBeVisible();
  });
});
