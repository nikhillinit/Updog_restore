import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AnalysisDraftSaveRequest,
  AnalysisReferenceV1,
} from '@shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract';
import {
  QuarterlyReviewCommandReceiptResponseSchema,
  QuarterlyReviewCorruptErrorSchema,
  QuarterlyReviewCurrentBasisResponseSchema,
  QuarterlyReviewIncompleteErrorSchema,
  type QuarterlyReviewCategory,
  type QuarterlyReviewCommandResult,
  type QuarterlyReviewCurrentBasisResponse,
  type QuarterlyReviewItemMutation,
  type QuarterlyReviewWaiverMutation,
} from '@shared/contracts/internal-analysis/quarterly-review-v1.contract';
import {
  internalAnalysisDraftsQueryKey,
  internalAnalysisReferencesQueryKey,
  useRefreshInternalAnalysisDraft,
} from '@/hooks/useInternalAnalysis';

export const quarterlyReviewQueryKey = (fundId: number, draftId: number) =>
  ['quarterly-review', fundId, draftId] as const;

type QuarterlyReviewErrorDetails =
  | ReturnType<typeof QuarterlyReviewCorruptErrorSchema.parse>['details']
  | ReturnType<typeof QuarterlyReviewIncompleteErrorSchema.parse>['details']
  | undefined;

export class QuarterlyReviewClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly etag: string | null;
  readonly details: QuarterlyReviewErrorDetails;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    etag?: string | null;
    details?: QuarterlyReviewErrorDetails;
  }) {
    super(input.message);
    this.name = 'QuarterlyReviewClientError';
    this.status = input.status;
    this.code = input.code;
    this.etag = input.etag ?? null;
    this.details = input.details;
  }
}

async function quarterlyReviewRequest<T>(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  options?: { body?: unknown; headers?: Record<string, string> }
): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...(options?.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const corrupt = QuarterlyReviewCorruptErrorSchema.safeParse(body);
    if (corrupt.success) {
      throw new QuarterlyReviewClientError({
        status: response.status,
        code: corrupt.data.error,
        message: corrupt.data.message ?? 'Quarterly review roster integrity check failed.',
        etag: response.headers.get('ETag'),
        details: corrupt.data.details,
      });
    }
    const incomplete = QuarterlyReviewIncompleteErrorSchema.safeParse(body);
    if (incomplete.success) {
      throw new QuarterlyReviewClientError({
        status: response.status,
        code: incomplete.data.error,
        message: incomplete.data.message ?? 'Quarterly review is incomplete.',
        etag: response.headers.get('ETag'),
        details: incomplete.data.details,
      });
    }
    const generic = body as { error?: unknown; message?: unknown } | null;
    const code = typeof generic?.error === 'string' ? generic.error : `HTTP_${response.status}`;
    const message =
      typeof generic?.message === 'string'
        ? generic.message
        : `Quarterly review request failed (${response.status}).`;
    throw new QuarterlyReviewClientError({
      status: response.status,
      code,
      message,
      etag: response.headers.get('ETag'),
    });
  }

  return body as T;
}

export function useQuarterlyReview(fundId: number, draftId: number) {
  return useQuery<QuarterlyReviewCurrentBasisResponse, QuarterlyReviewClientError>({
    queryKey: quarterlyReviewQueryKey(fundId, draftId),
    queryFn: async () => {
      const response = await quarterlyReviewRequest<unknown>(
        'GET',
        `/api/funds/${fundId}/internal-analysis/drafts/${draftId}/quarterly-review`
      );
      return QuarterlyReviewCurrentBasisResponseSchema.parse(response);
    },
  });
}

interface CommandVariables {
  etag: string;
  idempotencyKey?: string;
}

export interface UpdateQuarterlyReviewItemVariables extends CommandVariables {
  companyId: number;
  category: QuarterlyReviewCategory;
  input: QuarterlyReviewItemMutation;
}

export interface WaiveQuarterlyReviewCompanyVariables extends CommandVariables {
  companyId: number;
  input: QuarterlyReviewWaiverMutation;
}

export interface FinalizeQuarterlyReviewVariables
  extends CommandVariables, AnalysisDraftSaveRequest {}

function commandHeaders(variables: CommandVariables): Record<string, string> {
  return {
    'If-Match': variables.etag,
    'Idempotency-Key': variables.idempotencyKey ?? crypto.randomUUID(),
  };
}

export function useQuarterlyReviewCommands(fundId: number, draftId: number) {
  const queryClient = useQueryClient();
  const refresh = useRefreshInternalAnalysisDraft(fundId, draftId);

  const invalidateCanonical = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: internalAnalysisDraftsQueryKey(fundId) }),
      queryClient.invalidateQueries({ queryKey: quarterlyReviewQueryKey(fundId, draftId) }),
    ]);
  };
  const rollbackOnStale = async (error: QuarterlyReviewClientError) => {
    if (error.status === 412) {
      await invalidateCanonical();
    }
  };

  const updateItem = useMutation<
    QuarterlyReviewCommandResult,
    QuarterlyReviewClientError,
    UpdateQuarterlyReviewItemVariables,
    { previous: QuarterlyReviewCurrentBasisResponse | undefined }
  >({
    mutationFn: async (variables) => {
      const response = await quarterlyReviewRequest<unknown>(
        'PATCH',
        `/api/funds/${fundId}/internal-analysis/drafts/${draftId}/quarterly-review/companies/${variables.companyId}/items/${variables.category}`,
        { body: variables.input, headers: commandHeaders(variables) }
      );
      return QuarterlyReviewCommandReceiptResponseSchema.parse(response).result;
    },
    onMutate: async (variables) => {
      const queryKey = quarterlyReviewQueryKey(fundId, draftId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<QuarterlyReviewCurrentBasisResponse>(queryKey);
      queryClient.setQueryData<QuarterlyReviewCurrentBasisResponse>(queryKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          companies: current.companies.map((company) =>
            company.id !== variables.companyId
              ? company
              : {
                  ...company,
                  items: company.items.map((item) =>
                    item.category !== variables.category
                      ? item
                      : variables.input.state === 'changed'
                        ? {
                            ...item,
                            state: 'changed' as const,
                            note: variables.input.note,
                            reviewedBy: item.reviewedBy ?? 0,
                            reviewedAt: item.reviewedAt ?? new Date().toISOString(),
                            changeReference: variables.input.changeReference,
                            followUp:
                              variables.input.followUpTaskId === undefined
                                ? null
                                : {
                                    availability: 'linked' as const,
                                    target: {
                                      kind: 'task' as const,
                                      id: variables.input.followUpTaskId,
                                    },
                                  },
                          }
                        : {
                            ...item,
                            state: 'reviewed_no_change' as const,
                            note: variables.input.note,
                            reviewedBy: item.reviewedBy ?? 0,
                            reviewedAt: item.reviewedAt ?? new Date().toISOString(),
                            changeReference: null,
                            followUp: null,
                          }
                  ),
                }
          ),
        };
      });
      return { previous };
    },
    onSuccess: invalidateCanonical,
    onError: async (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(quarterlyReviewQueryKey(fundId, draftId), context.previous);
      }
      await rollbackOnStale(error);
    },
  });

  const waiveCompany = useMutation<
    QuarterlyReviewCommandResult,
    QuarterlyReviewClientError,
    WaiveQuarterlyReviewCompanyVariables,
    { previous: QuarterlyReviewCurrentBasisResponse | undefined }
  >({
    mutationFn: async (variables) => {
      const response = await quarterlyReviewRequest<unknown>(
        'POST',
        `/api/funds/${fundId}/internal-analysis/drafts/${draftId}/quarterly-review/companies/${variables.companyId}/waiver`,
        { body: variables.input, headers: commandHeaders(variables) }
      );
      return QuarterlyReviewCommandReceiptResponseSchema.parse(response).result;
    },
    onMutate: async (variables) => {
      const queryKey = quarterlyReviewQueryKey(fundId, draftId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<QuarterlyReviewCurrentBasisResponse>(queryKey);
      queryClient.setQueryData<QuarterlyReviewCurrentBasisResponse>(queryKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          companies: current.companies.map((company) =>
            company.id === variables.companyId
              ? {
                  ...company,
                  waivedAt: new Date().toISOString(),
                  waivedBy: null,
                  waiverReason: variables.input.reason,
                }
              : company
          ),
        };
      });
      return { previous };
    },
    onSuccess: invalidateCanonical,
    onError: async (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(quarterlyReviewQueryKey(fundId, draftId), context.previous);
      }
      await rollbackOnStale(error);
    },
  });

  const finalize = useMutation<
    { reference: AnalysisReferenceV1 },
    QuarterlyReviewClientError,
    FinalizeQuarterlyReviewVariables
  >({
    mutationFn: ({ etag, idempotencyKey, acknowledgeMixedBasis }) =>
      quarterlyReviewRequest(
        'POST',
        `/api/funds/${fundId}/internal-analysis/drafts/${draftId}/save`,
        {
          body: { acknowledgeMixedBasis },
          headers: commandHeaders({
            etag,
            ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
          }),
        }
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: internalAnalysisReferencesQueryKey(fundId, false),
        }),
        queryClient.invalidateQueries({
          queryKey: internalAnalysisReferencesQueryKey(fundId, true),
        }),
        invalidateCanonical(),
      ]);
    },
    onError: rollbackOnStale,
  });

  return { updateItem, waiveCompany, refresh, finalize };
}
