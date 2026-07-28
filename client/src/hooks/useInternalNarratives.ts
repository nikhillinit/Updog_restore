/**
 * Source-linked narrative drafts and append-only notes (PLAN_61 Task 19, Wave G).
 *
 * Reads the terminal narrative and the note history for one anchor (a Task 18 draft
 * or reference), and exposes generate / regenerate / revise / append-note mutations.
 * Every mutation carries a fresh `Idempotency-Key` so a retry is a no-op. The panel
 * renders provenance through `renderNarrativeCopyBlock` in the contract -- this hook
 * only moves the structured claim data, never a pre-rendered blob.
 *
 * @module client/hooks/useInternalNarratives
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  InternalAnalysisNoteListResponse,
  InternalAnalysisNoteV1,
  InternalNarrativeDraftDetailResponse,
  InternalNarrativeDraftV1,
  NarrativeAnchor,
  NarrativeClaimInput,
} from '@shared/contracts/internal-analysis/internal-narrative-draft-v1.contract';
import { apiRequest } from '@/lib/queryClient';

function anchorQueryString(anchor: NarrativeAnchor): string {
  return anchor.kind === 'analysis_draft'
    ? `analysisDraftId=${anchor.id}`
    : `analysisReferenceId=${anchor.id}`;
}

function anchorBody(anchor: NarrativeAnchor): Record<string, number> {
  return anchor.kind === 'analysis_draft'
    ? { analysisDraftId: anchor.id }
    : { analysisReferenceId: anchor.id };
}

export const internalNarrativeQueryKey = (
  fundId: number | undefined,
  anchor: NarrativeAnchor | null
) => ['internal-narrative', fundId ?? null, anchor?.kind ?? null, anchor?.id ?? null] as const;

export const internalAnalysisNotesQueryKey = (
  fundId: number | undefined,
  anchor: NarrativeAnchor | null
) => ['internal-analysis-notes', fundId ?? null, anchor?.kind ?? null, anchor?.id ?? null] as const;

export interface UseInternalNarrativesResult {
  narrative: InternalNarrativeDraftV1 | null;
  notes: InternalAnalysisNoteV1[];
  isLoading: boolean;
  error: Error | null;
  generate: () => void;
  isGenerating: boolean;
  revise: (claims: NarrativeClaimInput[]) => void;
  isRevising: boolean;
  appendNote: (body: string, supersedesNoteId?: number) => void;
  isAppendingNote: boolean;
  mutationError: Error | null;
}

export function useInternalNarratives(
  fundId: number | undefined,
  anchor: NarrativeAnchor | null
): UseInternalNarrativesResult {
  const queryClient = useQueryClient();
  const enabled = fundId != null && anchor != null;
  const anchorParam = anchor === null ? '' : anchorQueryString(anchor);
  const anchorPayload: Record<string, number> = anchor === null ? {} : anchorBody(anchor);
  const withIdempotency = () => ({ headers: { 'Idempotency-Key': crypto.randomUUID() } });

  const narrativeQuery = useQuery<InternalNarrativeDraftDetailResponse, Error>({
    queryKey: internalNarrativeQueryKey(fundId, anchor),
    enabled,
    queryFn: () =>
      apiRequest<InternalNarrativeDraftDetailResponse>(
        'GET',
        `/api/funds/${fundId}/internal-analysis/narratives?${anchorParam}`
      ),
  });

  const notesQuery = useQuery<InternalAnalysisNoteListResponse, Error>({
    queryKey: internalAnalysisNotesQueryKey(fundId, anchor),
    enabled,
    queryFn: () =>
      apiRequest<InternalAnalysisNoteListResponse>(
        'GET',
        `/api/funds/${fundId}/internal-analysis/notes?${anchorParam}`
      ),
  });

  const invalidateNarrative = () => {
    void queryClient.invalidateQueries({ queryKey: internalNarrativeQueryKey(fundId, anchor) });
  };
  const invalidateNotes = () => {
    void queryClient.invalidateQueries({ queryKey: internalAnalysisNotesQueryKey(fundId, anchor) });
  };

  const generateMutation = useMutation<InternalNarrativeDraftDetailResponse, Error, void>({
    mutationFn: () =>
      apiRequest<InternalNarrativeDraftDetailResponse>(
        'POST',
        `/api/funds/${fundId}/internal-analysis/narratives/generate`,
        anchorPayload,
        withIdempotency()
      ),
    onSuccess: invalidateNarrative,
  });

  const reviseMutation = useMutation<
    InternalNarrativeDraftDetailResponse,
    Error,
    NarrativeClaimInput[]
  >({
    mutationFn: (claims) =>
      apiRequest<InternalNarrativeDraftDetailResponse>(
        'POST',
        `/api/funds/${fundId}/internal-analysis/narratives/revise`,
        { ...anchorPayload, claims },
        withIdempotency()
      ),
    onSuccess: invalidateNarrative,
  });

  const noteMutation = useMutation<
    { note: InternalAnalysisNoteV1 },
    Error,
    { body: string; supersedesNoteId?: number }
  >({
    mutationFn: ({ body, supersedesNoteId }) =>
      apiRequest<{ note: InternalAnalysisNoteV1 }>(
        'POST',
        `/api/funds/${fundId}/internal-analysis/notes`,
        {
          ...anchorPayload,
          body,
          ...(supersedesNoteId === undefined ? {} : { supersedesNoteId }),
        },
        withIdempotency()
      ),
    onSuccess: invalidateNotes,
  });

  return {
    narrative: narrativeQuery.data?.narrative ?? null,
    notes: notesQuery.data?.notes ?? [],
    isLoading: narrativeQuery.isLoading || notesQuery.isLoading,
    error: narrativeQuery.error ?? notesQuery.error ?? null,
    generate: () => generateMutation.mutate(),
    isGenerating: generateMutation.isPending,
    revise: (claims) => reviseMutation.mutate(claims),
    isRevising: reviseMutation.isPending,
    appendNote: (body, supersedesNoteId) =>
      noteMutation.mutate({
        body,
        ...(supersedesNoteId === undefined ? {} : { supersedesNoteId }),
      }),
    isAppendingNote: noteMutation.isPending,
    mutationError: generateMutation.error ?? reviseMutation.error ?? noteMutation.error ?? null,
  };
}
