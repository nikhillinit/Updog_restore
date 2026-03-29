import type { FundCreateV1 } from '@shared/contracts/fund-create-v1.contract';
import type { FundDraftWriteV1 } from '@shared/contracts/fund-draft-write-v1.contract';
import type {
  FundFinalizeResultV1,
  FundFinalizeV1,
} from '@shared/contracts/fund-finalize-v1.contract';

type FinalizeApiErrorBody = {
  error?: string;
  message?: string;
  code?: string;
  issues?: Array<{ path: Array<string | number>; message: string }>;
};

async function readFinalizeApiError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => ({}) as FinalizeApiErrorBody)) as FinalizeApiErrorBody;
  const message = body.error || body.message || `${fallback} (HTTP ${response.status})`;
  return new Error(message);
}

export interface FinalizeFundSetupInput {
  fundId?: number;
  create: FundCreateV1;
  draft: FundDraftWriteV1;
}

type FinalizeFundSetupResponse = {
  success: true;
  data: FundFinalizeResultV1;
  message: string;
};

export async function finalizeFundSetup(
  payload: FinalizeFundSetupInput
): Promise<FundFinalizeResultV1> {
  const requestBody: FundFinalizeV1 = {
    ...(payload.fundId != null && { fundId: payload.fundId }),
    create: payload.create,
    draft: payload.draft,
  };

  const response = await fetch('/api/funds/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw await readFinalizeApiError(response, 'Fund finalization failed');
  }

  const body = (await response.json()) as FinalizeFundSetupResponse;
  return body.data;
}
