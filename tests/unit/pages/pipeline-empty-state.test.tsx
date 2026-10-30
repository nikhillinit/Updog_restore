import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PipelinePage from '@/pages/pipeline';
import { createWouterWrapper } from '../../utils/withWouter';

const fundState = vi.hoisted(() => ({ fundId: 7 as number | null }));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: fundState.fundId }),
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
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <PipelinePage />
    </QueryClientProvider>
  );

  const result = render(tree(), { wrapper: Wrapper });
  return { ...result, rerenderPage: () => result.rerender(tree()) };
}

function dealsRequests(): string[] {
  return vi
    .mocked(fetch)
    .mock.calls.map(([input]) => (typeof input === 'string' ? input : input.toString()))
    .filter((url) => url.includes('/api/deals/opportunities'));
}

describe('PipelinePage empty state', () => {
  beforeEach(() => {
    fundState.fundId = 7;
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

  it('prompts for a fund and blocks deal reads and write actions without one', async () => {
    fundState.fundId = null;
    const user = userEvent.setup();
    renderPipelinePage();

    const prompt = await screen.findByTestId('pipeline-empty-state');
    expect(within(prompt).getByRole('heading', { name: /select a fund/i })).toBeInTheDocument();
    expect(within(prompt).queryByRole('button', { name: /add deal/i })).not.toBeInTheDocument();
    expect(within(prompt).queryByRole('button', { name: /import deals/i })).not.toBeInTheDocument();

    const addDeal = screen.getByRole('button', { name: /add deal/i });
    const importDeals = screen.getByRole('button', { name: /import deals/i });
    expect(addDeal).toBeDisabled();
    expect(importDeals).toBeDisabled();
    await user.click(addDeal);
    await user.click(importDeals);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    expect(dealsRequests()).toEqual([]);
  });

  it('enables exactly one fund-scoped deals read and the write actions once a fund is selected', async () => {
    fundState.fundId = null;
    const { rerenderPage } = renderPipelinePage();
    await screen.findByTestId('pipeline-empty-state');
    expect(dealsRequests()).toEqual([]);

    fundState.fundId = 7;
    rerenderPage();

    expect(
      await screen.findByRole('heading', { name: /no deals in your pipeline/i })
    ).toBeInTheDocument();
    const requests = dealsRequests();
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0]!, 'http://localhost').searchParams.get('fundId')).toBe('7');
    for (const button of screen.getAllByRole('button', { name: /add deal|import deals/i })) {
      expect(button).toBeEnabled();
    }
  });
});
