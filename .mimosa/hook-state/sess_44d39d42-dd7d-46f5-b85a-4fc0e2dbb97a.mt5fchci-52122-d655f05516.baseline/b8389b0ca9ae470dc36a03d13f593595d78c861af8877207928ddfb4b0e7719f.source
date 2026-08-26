import type { FundDraftWriteV1 } from '@shared/contracts/fund-draft-write-v1.contract';
import { withApiBase } from '@/lib/api-url';

type DraftApiErrorBody = {
  error?: string;
  message?: string;
  code?: string;
  issues?: Array<{ path: Array<string | number>; message: string }>;
};

type DraftRecordResponse = {
  config?: FundDraftWriteV1;
};

async function readDraftApiError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => ({}) as DraftApiErrorBody)) as DraftApiErrorBody;
  const message = body.error || body.message || `${fallback} (HTTP ${response.status})`;
  return new Error(message);
}

export async function saveFundDraft(
  fundId: number,
  payload: FundDraftWriteV1
): Promise<DraftRecordResponse> {
  const response = await fetch(withApiBase(`/api/funds/${fundId}/draft`), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await readDraftApiError(response, 'Draft save failed');
  }

  return (await response.json()) as DraftRecordResponse;
}

export async function fetchFundDraft(fundId: number): Promise<FundDraftWriteV1> {
  const response = await fetch(withApiBase(`/api/funds/${fundId}/draft`), {
    credentials: 'include',
  });

  if (!response.ok) {
    throw await readDraftApiError(response, 'Draft load failed');
  }

  const body = (await response.json()) as DraftRecordResponse;
  if (!body.config) {
    throw new Error('Draft load failed: missing config payload');
  }

  return body.config;
}
