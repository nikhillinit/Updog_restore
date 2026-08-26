import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useApplyAllocationScenario,
  useAllocationScenarioList,
  useSyncAllocationScenario,
  useUpdateAllocationScenario,
} from '../../../client/src/components/portfolio/tabs/hooks/useAllocationScenarios';
import type {
  AllocationScenarioApplyResult,
  AllocationScenarioDetail,
  AllocationScenarioSyncResult,
} from '../../../client/src/components/portfolio/tabs/types';

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: 1 }),
}));

const scenarioId = '00000000-0000-0000-0000-000000000101';

const mockScenarioDetail: AllocationScenarioDetail = {
  id: scenarioId,
  fund_id: 1,
  name: 'Upside reserve plan',
  notes: 'Follow-on heavy scenario',
  source_allocation_version: 2,
  company_count: 2,
  total_planned_cents: 300000000,
  last_applied_at: null,
  last_applied_by: null,
  last_applied_allocation_version: null,
  last_synced_at: null,
  last_synced_by: null,
  created_at: '2026-03-30T15:00:00.000Z',
  updated_at: '2026-03-30T16:00:00.000Z',
  snapshot_items: [
    {
      company_id: 1,
      planned_reserves_cents: 200000000,
      allocation_cap_cents: null,
      allocation_reason: null,
    },
    {
      company_id: 2,
      planned_reserves_cents: 100000000,
      allocation_cap_cents: null,
      allocation_reason: null,
    },
  ],
  context: {
    scenario_notes: 'Follow-on heavy scenario',
    last_sync: null,
    last_apply: null,
  },
};

const mockSyncResult: AllocationScenarioSyncResult = {
  scenario: mockScenarioDetail,
  event: {
    id: '00000000-0000-0000-0000-000000000201',
    event_type: 'synced',
    actor_user_id: null,
    actor_label: 'analyst@example.com',
    note: 'Refresh from live',
    source_allocation_version: 1,
    resulting_allocation_version: 2,
    change_summary: {
      companies_changed: 1,
      companies_unchanged: 1,
      scenario_only_count: 0,
      live_only_count: 0,
      total_planned_delta_cents: 50000000,
      headline: 'Synced 1 company',
    },
    created_at: '2026-03-30T18:00:00.000Z',
  },
};

const mockApplyResult: AllocationScenarioApplyResult = {
  scenario: mockScenarioDetail,
  event: {
    id: '00000000-0000-0000-0000-000000000202',
    event_type: 'applied',
    actor_user_id: null,
    actor_label: 'analyst@example.com',
    note: 'Apply approved plan',
    source_allocation_version: 2,
    resulting_allocation_version: 3,
    change_summary: {
      companies_changed: 1,
      companies_unchanged: 1,
      scenario_only_count: 0,
      live_only_count: 0,
      total_planned_delta_cents: 50000000,
      headline: 'Applied 1 company',
    },
    created_at: '2026-03-30T19:00:00.000Z',
  },
  live: {
    updated_count: 1,
    resulting_allocation_version: 3,
    previous_preview_token: 'a'.repeat(64),
    current_live_token: 'b'.repeat(64),
  },
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('allocation scenario hook cache invalidation', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('invalidates the decision query after scenario update', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockScenarioDetail,
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData');

    const { result } = renderHook(() => useUpdateAllocationScenario(scenarioId), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ name: 'Renamed scenario' });
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['allocations', 'scenarios', 1],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['allocations', 'scenarios', 1, scenarioId, 'decisions'],
    });
    expect(setQueryDataSpy).toHaveBeenCalledWith(
      ['allocations', 'scenarios', 1, scenarioId],
      mockScenarioDetail
    );
  });

  it('invalidates the decision query after scenario sync', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSyncResult,
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData');

    const { result } = renderHook(() => useSyncAllocationScenario(scenarioId), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ note: 'Refresh from live' });
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['allocations', 'scenarios', 1],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['allocations', 'scenarios', 1, scenarioId, 'decisions'],
    });
    expect(setQueryDataSpy).toHaveBeenCalledWith(
      ['allocations', 'scenarios', 1, scenarioId],
      mockSyncResult.scenario
    );
  });

  it('invalidates the decision query after scenario apply', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockApplyResult,
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData');

    const { result } = renderHook(() => useApplyAllocationScenario(scenarioId), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        preview_token: 'a'.repeat(64),
        note: 'Apply approved plan',
      });
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['allocations', 'scenarios', 1],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['allocations', 'latest', 1],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['allocations', 'scenarios', 1, scenarioId, 'decisions'],
    });
    expect(setQueryDataSpy).toHaveBeenCalledWith(
      ['allocations', 'scenarios', 1, scenarioId],
      mockApplyResult.scenario
    );
  });

  it('reports HTML scenario list responses as JSON contract errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(() => useAllocationScenarioList(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });

    expect(result.current.error?.message).toMatch(/expected JSON but received text\/html/i);
  });

  it('reports HTML mutation errors as JSON contract errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      headers: new Headers({ 'content-type': 'text/html' }),
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(() => useUpdateAllocationScenario(scenarioId), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(result.current.mutateAsync({ name: 'Renamed scenario' })).rejects.toThrow(
        /expected JSON but received text\/html/i
      );
    });
  });
});
