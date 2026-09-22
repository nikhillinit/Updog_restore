import type { FundDraftWriteV1 } from '@shared/contracts/fund-draft-write-v1.contract';
import { ApiError } from '@/lib/queryClient';
import { startInFlight } from '@/lib/inflight';
import { workflowRequest, type WorkflowResult } from './fund-workflow';

type DraftRecordResponse = {
  config?: FundDraftWriteV1;
  data?: { config?: FundDraftWriteV1 };
};

export interface DraftSnapshot {
  config: FundDraftWriteV1;
  /** Strong ETag of the loaded revision; echoed verbatim as If-Match. */
  etag: string | null;
}

export interface SaveDraftOptions {
  key: string;
  etag: string | null;
}

export interface SaveDraftResult extends DraftSnapshot {
  replayed: boolean;
}

/** GET /api/funds/:id/draft answered 404: the fund has no active draft. */
export function isMissingDraftError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

function draftConfigFrom(result: WorkflowResult<DraftRecordResponse | null>): FundDraftWriteV1 {
  const config = result.body?.config ?? result.body?.data?.config;
  if (!config) throw new Error('Draft response is missing the config payload');
  return config;
}

export async function saveFundDraft(
  fundId: number,
  payload: FundDraftWriteV1,
  options: SaveDraftOptions
): Promise<SaveDraftResult> {
  // Callers replaying the same command (autosave, bootstrap, workspace dialog)
  // join one request instead of colliding on the server's in-progress guard.
  const result = await startInFlight(`save_draft:${fundId}:${options.key}`, ({ signal }) =>
    workflowRequest<DraftRecordResponse | null>('PUT', `/api/funds/${fundId}/draft`, payload, {
      key: options.key,
      etag: options.etag,
      signal,
    })
  );
  return {
    config: result.body?.config ?? result.body?.data?.config ?? payload,
    etag: result.etag,
    replayed: result.replayed,
  };
}

export async function fetchFundDraft(fundId: number): Promise<DraftSnapshot> {
  const result = await workflowRequest<DraftRecordResponse | null>(
    'GET',
    `/api/funds/${fundId}/draft`,
    undefined
  );
  return { config: draftConfigFrom(result), etag: result.etag };
}
