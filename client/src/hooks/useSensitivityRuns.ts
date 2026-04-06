/**
 * Sensitivity Runs TanStack Query Hooks (Phase 1B)
 *
 * Synchronous request/response pair for one-way analyses (the engine completes
 * inside a single request) plus a paginated history query keyed on fund + kind.
 * Mirrors the deterministic sensitivity routes mounted under
 * /api/funds/:id/sensitivity/* in Phase 1A.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  OneWayAnalysisRequestV1,
  OneWayAnalysisResultV1,
  SensitivityRunV1,
  SensitivityRunKind,
} from '@shared/contracts/sensitivity-run-v1.contract';

// =====================
// SHARED TYPES
// =====================

export interface OneWayRunResponse {
  run: SensitivityRunV1;
  result: OneWayAnalysisResultV1;
}

export interface SensitivityErrorBody {
  code: string;
  message: string;
}

export interface SensitivityHistoryResponse {
  runs: SensitivityRunV1[];
}

export type SensitivityHookError = Error & {
  code?: string;
  status?: number;
};

// =====================
// FETCHERS
// =====================

async function postOneWayRun(
  fundId: number,
  body: OneWayAnalysisRequestV1
): Promise<OneWayRunResponse> {
  const res = await fetch(`/api/funds/${fundId}/sensitivity/one-way`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as Partial<SensitivityErrorBody>;
    const error = new Error(errorBody.message ?? `HTTP ${res.status}`) as SensitivityHookError;
    error.code = errorBody.code ?? 'UNKNOWN';
    error.status = res.status;
    throw error;
  }

  return (await res.json()) as OneWayRunResponse;
}

async function fetchSensitivityHistory(
  fundId: number,
  kind?: SensitivityRunKind,
  limit = 10
): Promise<SensitivityHistoryResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (kind) params.set('kind', kind);

  const res = await fetch(`/api/funds/${fundId}/sensitivity/runs?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as SensitivityHistoryResponse;
}

// =====================
// QUERY KEYS
// =====================

export const sensitivityRunsKey = (
  fundId: number | null,
  kind: SensitivityRunKind | 'all',
  limit: number
) => ['sensitivity-runs', fundId, kind, limit] as const;

// =====================
// HOOKS
// =====================

/**
 * Mutation to POST a one-way sensitivity request. Errors carry the server's
 * `code` and HTTP status so callers can branch on NO_PUBLISHED_CONFIG and
 * similar tier-2 codes without re-parsing the body.
 */
export function useOneWayRun(fundId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<OneWayRunResponse, SensitivityHookError, OneWayAnalysisRequestV1>({
    mutationFn: async (body) => {
      if (fundId === null) {
        throw new Error('fundId is required');
      }
      return postOneWayRun(fundId, body);
    },
    onSuccess: () => {
      if (fundId !== null) {
        queryClient.invalidateQueries({
          queryKey: ['sensitivity-runs', fundId, 'one_way'],
        });
      }
    },
  });
}

/**
 * Paginated history of sensitivity runs for a fund. Disabled when fundId is
 * null so no fetch is dispatched on routes that have not yet resolved a fund.
 */
export function useSensitivityHistory(
  fundId: number | null,
  kind?: SensitivityRunKind,
  limit = 10
) {
  return useQuery<SensitivityHistoryResponse>({
    queryKey: sensitivityRunsKey(fundId, kind ?? 'all', limit),
    queryFn: () => {
      if (fundId === null) {
        throw new Error('fundId is required');
      }
      return fetchSensitivityHistory(fundId, kind, limit);
    },
    enabled: fundId !== null,
    staleTime: 30_000,
  });
}
