import {
  FundDraftWriteV1Schema,
  type FundDraftWriteV1,
} from '@shared/contracts/fund-draft-write-v1.contract';
import { FundDraftETagSchema } from '@shared/contracts/fund-workflow-v1.contract';
import { ApiError } from '@/lib/queryClient';
import { startInFlight } from '@/lib/inflight';
import { FundWorkflowUncertainError, workflowRequest, type WorkflowResult } from './fund-workflow';

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

function isDraftETag(etag: string | null): etag is string {
  return FundDraftETagSchema.safeParse(etag).success;
}

function draftSnapshotFrom(result: WorkflowResult<DraftRecordResponse | null>): DraftSnapshot {
  const parsed = FundDraftWriteV1Schema.safeParse(result.body?.config ?? result.body?.data?.config);
  if (!parsed.success) throw new Error('Draft response does not match the draft contract');
  // Every later write is conditional on this revision; never hydrate without it.
  if (!isDraftETag(result.etag)) throw new Error('Draft response is missing its revision');
  return { config: parsed.data, etag: result.etag };
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
  // Committed, but without a revision the next write cannot be conditional.
  // Uncertain keeps the key, so a retry replays and returns the revision.
  if (!isDraftETag(result.etag)) {
    throw new FundWorkflowUncertainError('Draft save response is missing its revision', false);
  }
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
  return draftSnapshotFrom(result);
}
