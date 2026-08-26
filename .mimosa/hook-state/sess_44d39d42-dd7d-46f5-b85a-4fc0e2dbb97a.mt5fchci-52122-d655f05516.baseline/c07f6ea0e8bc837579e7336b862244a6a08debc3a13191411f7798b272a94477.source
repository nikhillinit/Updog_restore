/**
 * useDealDragDrop -- drag-and-drop logic for the deal pipeline Kanban view.
 *
 * Encapsulates @dnd-kit sensor config, drag state, optimistic cache updates,
 * and the stage-change mutation so pipeline.tsx stays declarative.
 */

import { useState, useCallback } from 'react';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFeatureFlag } from '@/core/flags/flagAdapter';
import type { FlagKey } from '@/core/flags/flagAdapter';
import type { DealOpportunity } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';

// ---- constants ----

const VALID_STATUSES = [
  'lead',
  'qualified',
  'pitch',
  'dd',
  'committee',
  'term_sheet',
  'closed',
  'passed',
] as const;

type PipelineStatus = (typeof VALID_STATUSES)[number];

const DEALS_QUERY_PREFIX = '/api/deals/opportunities' as const;

const DND_FLAG: FlagKey = 'enable_pipeline_dnd';

// ---- response type (mirrors pipeline.tsx) ----

interface DealsResponse {
  success: boolean;
  data: DealOpportunity[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    count: number;
  };
}

// ---- hook ----

export function useDealDragDrop() {
  const queryClient = useQueryClient();
  const isDndEnabled = useFeatureFlag(DND_FLAG);

  // Pointer sensor with a 5 px activation distance so regular clicks on
  // DealCard are not swallowed by the drag handler.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  // Currently-dragged deal (rendered inside DragOverlay by the consumer).
  const [activeDeal, setActiveDeal] = useState<DealOpportunity | null>(null);

  // ---- mutation ----

  const stageMoveMutation = useMutation<
    DealOpportunity,
    Error,
    { dealId: number; status: string; notes?: string },
    { previousEntries: Array<[readonly unknown[], DealsResponse | undefined]> }
  >({
    mutationFn: ({ dealId, status, notes }) => {
      const body: { status: string; notes?: string } = { status };
      if (notes != null) {
        body.notes = notes;
      }
      return apiRequest<DealOpportunity>('POST', `/api/deals/${dealId}/stage`, body);
    },

    // Optimistic update: snapshot every matching cache entry, then patch.
    onMutate: async ({ dealId, status }) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic data.
      await queryClient.cancelQueries({ queryKey: [DEALS_QUERY_PREFIX] });

      // getQueriesData returns entries for every key that starts with the
      // prefix, regardless of filter segments that follow.
      const entries = queryClient.getQueriesData<DealsResponse>({
        queryKey: [DEALS_QUERY_PREFIX],
      });

      const previousEntries: Array<[readonly unknown[], DealsResponse | undefined]> = [];

      for (const [key, data] of entries) {
        previousEntries.push([key, data]);
        if (!data) continue;

        queryClient.setQueryData<DealsResponse>(key, {
          ...data,
          data: data.data.map((deal) => (deal.id === dealId ? { ...deal, status } : deal)),
        });
      }

      return { previousEntries };
    },

    // Rollback on error.
    onError: (_err, _vars, context) => {
      if (!context) return;
      for (const [key, snapshot] of context.previousEntries) {
        queryClient.setQueryData(key, snapshot);
      }
    },

    // Always refetch to ensure server state is authoritative.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [DEALS_QUERY_PREFIX] });
    },
  });

  // ---- handlers ----

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const deal = event.active.data.current?.['deal'] as DealOpportunity | undefined;
    setActiveDeal(deal ?? null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDeal(null);

      const { over, active } = event;

      // Guard: dropped outside a droppable or no active deal data.
      if (!over) return;

      const deal = active.data.current?.['deal'] as DealOpportunity | undefined;
      if (!deal) return;

      const newStatus = String(over.id);

      // Guard: same column -- nothing to do.
      if (newStatus === deal.status) return;

      // Guard: validate target status.
      if (!isValidStatus(newStatus)) return;

      stageMoveMutation.mutate({
        dealId: deal.id,
        status: newStatus,
      });
    },
    [stageMoveMutation]
  );

  return {
    sensors,
    activeDeal,
    isDndEnabled,
    stageMoveMutation,
    handleDragStart,
    handleDragEnd,
  } as const;
}

// ---- helpers ----

function isValidStatus(value: string): value is PipelineStatus {
  return (VALID_STATUSES as readonly string[]).includes(value);
}
