/**
 * Unit tests for useDealDragDrop hook.
 *
 * Tests drag-and-drop state management, feature flag gating,
 * sensor configuration, and stage-change mutation dispatch.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DragEndEvent } from '@dnd-kit/core';
import type { DealOpportunity } from '@shared/schema';
import { useDealDragDrop } from '@/hooks/useDealDragDrop';

// ---- mocks ----

const mockApiRequest = vi.fn().mockResolvedValue({ id: 1, status: 'qualified' });

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
  queryClient: new (require('@tanstack/react-query').QueryClient)(),
}));

const mockUseFeatureFlag = vi.fn().mockReturnValue(false);

vi.mock('@/core/flags/flagAdapter', () => ({
  useFeatureFlag: (...args: unknown[]) => mockUseFeatureFlag(...args),
}));

// ---- helpers ----

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper() {
  const qc = createTestQueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

const mockDeal: DealOpportunity = {
  id: 1,
  companyName: 'Acme Corp',
  sector: 'SaaS',
  stage: 'Seed',
  sourceType: 'Referral',
  status: 'lead',
  priority: 'high',
  dealSize: '1000000',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as DealOpportunity;

// ---- tests ----

describe('useDealDragDrop', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(false);
    mockApiRequest.mockResolvedValue({ id: 1, status: 'qualified' });
  });

  it('returns isDndEnabled as false by default', () => {
    const { result } = renderHook(() => useDealDragDrop(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isDndEnabled).toBe(false);
    expect(mockUseFeatureFlag).toHaveBeenCalledWith('enable_pipeline_dnd');
  });

  it('returns sensors with pointer sensor configured', () => {
    const { result } = renderHook(() => useDealDragDrop(), {
      wrapper: createWrapper(),
    });

    expect(result.current.sensors).toBeDefined();
    // useSensors returns an array of sensor descriptors
    expect(Array.isArray(result.current.sensors)).toBe(true);
    expect(result.current.sensors.length).toBeGreaterThan(0);
  });

  it('activeDeal is null initially', () => {
    const { result } = renderHook(() => useDealDragDrop(), {
      wrapper: createWrapper(),
    });

    expect(result.current.activeDeal).toBeNull();
  });

  it('handleDragEnd is a no-op when no over target', () => {
    const { result } = renderHook(() => useDealDragDrop(), {
      wrapper: createWrapper(),
    });

    const event = {
      active: {
        id: '1',
        data: { current: { deal: mockDeal } },
      },
      over: null,
    } as unknown as DragEndEvent;

    act(() => {
      result.current.handleDragEnd(event);
    });

    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('handleDragEnd is a no-op when dropping on same status column', () => {
    const { result } = renderHook(() => useDealDragDrop(), {
      wrapper: createWrapper(),
    });

    const event = {
      active: {
        id: '1',
        data: { current: { deal: mockDeal } },
      },
      over: { id: 'lead' }, // same as mockDeal.status
    } as unknown as DragEndEvent;

    act(() => {
      result.current.handleDragEnd(event);
    });

    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('handleDragEnd fires mutation when dropping on different column', async () => {
    const { result } = renderHook(() => useDealDragDrop(), {
      wrapper: createWrapper(),
    });

    const event = {
      active: {
        id: '1',
        data: { current: { deal: mockDeal } },
      },
      over: { id: 'qualified' }, // different from mockDeal.status ('lead')
    } as unknown as DragEndEvent;

    act(() => {
      result.current.handleDragEnd(event);
    });

    // Wait for the mutation to fire
    await vi.waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith('POST', '/api/deals/1/stage', {
        status: 'qualified',
      });
    });
  });
});
