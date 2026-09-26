import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReallocationTab } from '@/components/portfolio/tabs/ReallocationTab';
import type { ProposedAllocation } from '@/types/reallocation';

const state = vi.hoisted(() => ({
  fundId: 1,
  toast: vi.fn(),
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: state.fundId }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: state.toast }),
}));

vi.mock('@/hooks/use-fund-data', () => ({
  usePortfolioCompanies: () => ({
    portfolioCompanies: [
      {
        id: 1,
        name: 'Alpha',
        plannedReservesCents: 100,
        allocationCapCents: null,
      },
      {
        id: 2,
        name: 'Beta',
        plannedReservesCents: 200,
        allocationCapCents: 500,
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

type Responder = (body: Record<string, unknown>) => Response | Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makePreviewResponse(proposedAllocations: ProposedAllocation[]) {
  const deltas = proposedAllocations.map((allocation) => ({
    company_id: allocation.company_id,
    company_name: allocation.company_id === 1 ? 'Alpha' : 'Beta',
    from_cents: allocation.company_id === 1 ? 100 : 200,
    to_cents: allocation.planned_reserves_cents,
    delta_cents: allocation.planned_reserves_cents - (allocation.company_id === 1 ? 100 : 200),
    delta_pct: 100,
    status: 'increased' as const,
  }));

  return {
    deltas,
    totals: {
      total_allocated_before: deltas.reduce((sum, delta) => sum + delta.from_cents, 0),
      total_allocated_after: deltas.reduce((sum, delta) => sum + delta.to_cents, 0),
      delta_cents: deltas.reduce((sum, delta) => sum + delta.delta_cents, 0),
      delta_pct: 100,
    },
    warnings: [],
    validation: { is_valid: true, errors: [] },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <ReallocationTab />
    </QueryClientProvider>
  );
  return { queryClient, ...rendered };
}

async function waitForAllocationVersions(latestFetches: string[]) {
  await waitFor(() => expect(latestFetches).toHaveLength(1));
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /preview changes/i })).toBeDisabled();
  });
}

describe('ReallocationTab client C3 contract', () => {
  let latestVersions: Record<number, Record<number, number>>;
  let latestFetches: string[];
  let previewBodies: Record<string, unknown>[];
  let commitBodies: Record<string, unknown>[];
  let previewResponder: Responder;
  let commitResponder: Responder;

  beforeEach(() => {
    state.fundId = 1;
    state.toast.mockReset();
    latestVersions = {
      1: { 1: 4, 2: 9 },
      2: { 1: 6, 2: 11 },
    };
    latestFetches = [];
    previewBodies = [];
    commitBodies = [];
    previewResponder = (body) =>
      jsonResponse(makePreviewResponse(body.proposed_allocations as ProposedAllocation[]));
    commitResponder = () =>
      jsonResponse({
        success: true,
        updated_count: 1,
        new_versions: [{ company_id: 1, new_version: 5 }],
        audit_ids: [{ company_id: 1, audit_id: 'audit-1' }],
        timestamp: '2026-09-25T00:00:00.000Z',
      });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : 'url' in input ? input.url : input.toString();
      const parsedUrl = new URL(url, window.location.origin);

      if (parsedUrl.pathname.endsWith('/allocations/latest')) {
        latestFetches.push(parsedUrl.pathname);
        const versions = latestVersions[Number(parsedUrl.pathname.split('/')[3])] ?? {};
        return jsonResponse({
          companies: Object.entries(versions).map(([companyId, allocationVersion]) => ({
            company_id: Number(companyId),
            allocation_version: allocationVersion,
          })),
          metadata: {},
        });
      }

      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      if (parsedUrl.pathname.endsWith('/reallocation/preview')) {
        previewBodies.push(body);
        return previewResponder(body);
      }
      if (parsedUrl.pathname.endsWith('/reallocation/commit')) {
        commitBodies.push(body);
        return commitResponder(body);
      }

      throw new Error(`Unexpected fetch: ${parsedUrl.pathname}`);
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('uses each selected company version and sends the frozen preview payload on commit', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitForAllocationVersions(latestFetches);

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]!);
    await user.click(checkboxes[1]!);
    const inputs = screen.getAllByRole('spinbutton');
    await user.clear(inputs[0]!);
    await user.type(inputs[0]!, '2.00');
    await user.clear(inputs[1]!);
    await user.type(inputs[1]!, '3.00');

    const previewButton = screen.getByRole('button', { name: /preview changes/i });
    await waitFor(() => expect(previewButton).toBeEnabled());
    await user.click(previewButton);
    await waitFor(() => expect(previewBodies).toHaveLength(1));
    await screen.findByRole('button', { name: /commit changes/i });

    const expectedPayload = [
      { company_id: 1, planned_reserves_cents: 200, expected_version: 4 },
      { company_id: 2, planned_reserves_cents: 300, expected_version: 9 },
    ];
    expect(previewBodies[0]).toEqual({ proposed_allocations: expectedPayload });

    await user.type(screen.getByLabelText(/reason for reallocation/i), 'Q3 review');
    await user.click(screen.getByRole('button', { name: /commit changes/i }));
    await waitFor(() => expect(commitBodies).toHaveLength(1));

    expect(commitBodies[0]).toEqual({
      proposed_allocations: expectedPayload,
      reason: 'Q3 review',
    });
  });

  it('does not block on mixed versions for unselected companies', async () => {
    const user = userEvent.setup();
    latestVersions[1] = { 1: 4, 2: 99 };
    renderTab();
    await waitForAllocationVersions(latestFetches);

    await user.click(screen.getAllByRole('checkbox')[0]!);
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '2.00');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /preview changes/i })).toBeEnabled()
    );
  });

  it('keeps preview disabled and explains missing selected versions', async () => {
    const user = userEvent.setup();
    latestVersions[1] = { 1: 4 };
    renderTab();
    await waitForAllocationVersions(latestFetches);

    await user.click(screen.getAllByRole('checkbox')[0]!);
    await user.click(screen.getAllByRole('checkbox')[1]!);

    expect(await screen.findByTestId('allocation-version-note')).toHaveTextContent(
      /version unavailable/i
    );
    expect(screen.getByRole('button', { name: /preview changes/i })).toBeDisabled();
  });

  it('clears a preview conflict, refetches versions, preserves inputs, and requires re-preview', async () => {
    const user = userEvent.setup();
    let previewCall = 0;
    previewResponder = (body) => {
      previewCall += 1;
      return previewCall === 2
        ? jsonResponse(
            {
              error: 'Version conflict',
              message: 'One or more allocation versions are stale',
              details: { current_versions: [{ company_id: 1, current_version: 5 }] },
            },
            409
          )
        : jsonResponse(makePreviewResponse(body.proposed_allocations as ProposedAllocation[]));
    };
    renderTab();
    await waitForAllocationVersions(latestFetches);
    await user.click(screen.getAllByRole('checkbox')[0]!);
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '2.00');

    const previewButton = screen.getByRole('button', { name: /preview changes/i });
    await user.click(previewButton);
    await waitFor(() => expect(previewBodies).toHaveLength(1));
    await screen.findByRole('button', { name: /commit changes/i });
    await user.type(screen.getByLabelText(/reason for reallocation/i), 'Stale preview check');

    await user.click(previewButton);
    await waitFor(() =>
      expect(state.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Allocations changed' })
      )
    );
    expect(screen.queryByRole('button', { name: /commit changes/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')[0]).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(latestFetches).toHaveLength(2));

    await waitFor(() => expect(previewButton).toBeEnabled());
    await user.click(previewButton);
    await waitFor(() => expect(previewBodies).toHaveLength(3));
    await screen.findByLabelText(/reason for reallocation/i);
    expect(screen.getByLabelText(/reason for reallocation/i)).toHaveValue('Stale preview check');
    expect(screen.getByRole('button', { name: /commit changes/i })).toBeEnabled();
  });

  it('clears a commit conflict, refetches versions, preserves inputs, and requires re-preview', async () => {
    const user = userEvent.setup();
    let commitCall = 0;
    commitResponder = () => {
      commitCall += 1;
      return commitCall === 1
        ? jsonResponse(
            {
              error: 'Version conflict',
              message: 'One or more allocation versions are stale',
              details: { current_versions: [{ company_id: 1, current_version: 5 }] },
            },
            409
          )
        : jsonResponse({ success: true });
    };
    renderTab();
    await waitForAllocationVersions(latestFetches);
    await user.click(screen.getAllByRole('checkbox')[0]!);
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '2.00');
    await user.click(screen.getByRole('button', { name: /preview changes/i }));
    await waitFor(() => expect(previewBodies).toHaveLength(1));
    await screen.findByRole('button', { name: /commit changes/i });
    await user.type(screen.getByLabelText(/reason for reallocation/i), 'Commit conflict check');
    await user.click(screen.getByRole('button', { name: /commit changes/i }));

    await waitFor(() =>
      expect(state.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Allocations changed' })
      )
    );
    expect(screen.queryByRole('button', { name: /commit changes/i })).not.toBeInTheDocument();
    await waitFor(() => expect(latestFetches).toHaveLength(2));

    const previewButton = screen.getByRole('button', { name: /preview changes/i });
    await waitFor(() => expect(previewButton).toBeEnabled());
    await user.click(previewButton);
    await waitFor(() => expect(previewBodies).toHaveLength(2));
    await screen.findByLabelText(/reason for reallocation/i);
    expect(screen.getByLabelText(/reason for reallocation/i)).toHaveValue('Commit conflict check');
    expect(screen.getByRole('button', { name: /commit changes/i })).toBeEnabled();
  });

  it('discards the preview and blocks preview/commit while an amount field is invalid', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitForAllocationVersions(latestFetches);

    await user.click(screen.getAllByRole('checkbox')[0]!);
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '2.00');
    await user.click(screen.getByRole('button', { name: /preview changes/i }));
    await screen.findByRole('button', { name: /commit changes/i });

    await user.clear(input);
    expect(screen.queryByRole('button', { name: /commit changes/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /preview changes/i })).toBeDisabled();
    expect(screen.getByTestId('allocation-version-note')).toHaveTextContent(/valid amount/i);

    await user.type(input, '2.00');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /preview changes/i })).toBeEnabled()
    );
    expect(screen.queryByRole('button', { name: /commit changes/i })).not.toBeInTheDocument();
  });

  it('discards a late preview after an edit is reverted to identical input', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<Response>();
    previewResponder = () => deferred.promise;
    renderTab();
    await waitForAllocationVersions(latestFetches);

    await user.click(screen.getAllByRole('checkbox')[0]!);
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '2.00');
    await user.click(screen.getByRole('button', { name: /preview changes/i }));

    await user.clear(input);
    await user.type(input, '3.00');
    await user.clear(input);
    await user.type(input, '2.00');
    deferred.resolve(
      jsonResponse(
        makePreviewResponse([{ company_id: 1, planned_reserves_cents: 200, expected_version: 4 }])
      )
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /preview changes/i })).toBeEnabled()
    );
    expect(screen.queryByRole('button', { name: /commit changes/i })).not.toBeInTheDocument();
  });

  it('discards a late preview after reset and identical re-entry', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<Response>();
    let previewCall = 0;
    previewResponder = (body) => {
      previewCall += 1;
      return previewCall === 1
        ? jsonResponse(makePreviewResponse(body.proposed_allocations as ProposedAllocation[]))
        : deferred.promise;
    };
    renderTab();
    await waitForAllocationVersions(latestFetches);

    await user.click(screen.getAllByRole('checkbox')[0]!);
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '2.00');
    const previewButton = screen.getByRole('button', { name: /preview changes/i });
    await user.click(previewButton);
    await waitFor(() => expect(previewBodies).toHaveLength(1));
    await screen.findByRole('button', { name: /commit changes/i });

    await user.click(previewButton);
    await waitFor(() => expect(previewBodies).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await user.click(screen.getAllByRole('checkbox')[0]!);
    const reenteredInput = screen.getByRole('spinbutton');
    await user.clear(reenteredInput);
    await user.type(reenteredInput, '2.00');

    deferred.resolve(
      jsonResponse(
        makePreviewResponse([{ company_id: 1, planned_reserves_cents: 200, expected_version: 4 }])
      )
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /preview changes/i })).toBeEnabled()
    );
    expect(screen.queryByRole('button', { name: /commit changes/i })).not.toBeInTheDocument();
  });

  it('ignores late fund A commit and preview responses while fund B has a draft', async () => {
    const user = userEvent.setup();
    const commitDeferred = createDeferred<Response>();
    const previewDeferred = createDeferred<Response>();
    let previewCall = 0;
    previewResponder = (body) => {
      previewCall += 1;
      return previewCall === 1
        ? jsonResponse(makePreviewResponse(body.proposed_allocations as ProposedAllocation[]))
        : previewDeferred.promise;
    };
    commitResponder = () => commitDeferred.promise;
    const rendered = renderTab();
    await waitForAllocationVersions(latestFetches);

    await user.click(screen.getAllByRole('checkbox')[0]!);
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '2.00');
    await user.click(screen.getByRole('button', { name: /preview changes/i }));
    await screen.findByRole('button', { name: /commit changes/i });
    await user.type(screen.getByLabelText(/reason for reallocation/i), 'Fund A commit');
    await user.click(screen.getByRole('button', { name: /commit changes/i }));
    await waitFor(() => expect(commitBodies).toHaveLength(1));
    // A second preview on fund A is also left in flight (it will answer 409).
    await user.click(screen.getByRole('button', { name: /preview changes/i }));
    await waitFor(() => expect(previewBodies).toHaveLength(2));

    state.fundId = 2;
    rendered.rerender(
      <QueryClientProvider client={rendered.queryClient}>
        <ReallocationTab />
      </QueryClientProvider>
    );
    await waitFor(() => expect(latestFetches).toContain('/api/funds/2/allocations/latest'));
    await user.click(screen.getAllByRole('checkbox')[1]!);
    const fundBInput = screen.getByRole('spinbutton');
    await user.clear(fundBInput);
    await user.type(fundBInput, '3.00');
    // Fund A's unresolved preview and commit must not pin fund B's controls.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /preview changes/i })).toBeEnabled()
    );

    commitDeferred.resolve(
      jsonResponse({
        success: true,
        updated_count: 1,
        new_versions: [{ company_id: 1, new_version: 5 }],
        audit_ids: [{ company_id: 1, audit_id: 'audit-1' }],
        timestamp: '2026-09-25T00:00:00.000Z',
      })
    );
    previewDeferred.resolve(
      jsonResponse(
        {
          error: 'Version conflict',
          message: 'One or more allocation versions are stale',
          details: { current_versions: [{ company_id: 1, current_version: 5 }] },
        },
        409
      )
    );
    await waitFor(() => expect(latestFetches).toContain('/api/funds/1/allocations/latest'));
    // Fund B's draft survives both late fund A responses.
    expect(screen.getAllByRole('checkbox')[1]).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('spinbutton')).toHaveValue(3);
    expect(state.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Reallocation committed' })
    );
    expect(state.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Allocations changed' })
    );
    // The late fund A commit invalidated fund A's cache only: fund B's latest
    // allocations were fetched exactly once, on the switch.
    expect(latestFetches.filter((path) => path === '/api/funds/2/allocations/latest')).toHaveLength(
      1
    );
  });

  it('discards a late preview after a fund A to B to A switch', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<Response>();
    previewResponder = () => deferred.promise;
    const rendered = renderTab();
    await waitForAllocationVersions(latestFetches);

    await user.click(screen.getAllByRole('checkbox')[0]!);
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '2.00');
    await user.click(screen.getByRole('button', { name: /preview changes/i }));
    await waitFor(() => expect(previewBodies).toHaveLength(1));

    state.fundId = 2;
    rendered.rerender(
      <QueryClientProvider client={rendered.queryClient}>
        <ReallocationTab />
      </QueryClientProvider>
    );
    await waitFor(() => expect(latestFetches).toContain('/api/funds/2/allocations/latest'));
    state.fundId = 1;
    rendered.rerender(
      <QueryClientProvider client={rendered.queryClient}>
        <ReallocationTab />
      </QueryClientProvider>
    );
    // The fund switch dropped the draft; re-enter identical input on fund A.
    expect(screen.getAllByRole('checkbox')[0]).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getAllByRole('checkbox')[0]!);
    const reenteredInput = screen.getByRole('spinbutton');
    await user.clear(reenteredInput);
    await user.type(reenteredInput, '2.00');
    deferred.resolve(
      jsonResponse(
        makePreviewResponse([{ company_id: 1, planned_reserves_cents: 200, expected_version: 4 }])
      )
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /preview changes/i })).toBeEnabled()
    );
    expect(screen.queryByRole('button', { name: /commit changes/i })).not.toBeInTheDocument();
  });
});
