import type { ReportPackageJsonExportBlocker } from '@shared/contracts/lp-reporting';

export interface DryRunErrorBody {
  code?: string;
  error?: string;
  message?: string;
}

export type LpReportingHookError = Error & {
  code?: string;
  status?: number;
  blockers?: ReportPackageJsonExportBlocker[];
  storedContentHash?: string;
  currentContentHash?: string;
};

export interface ContractResponseSchema<TResponse> {
  safeParse(raw: unknown): { success: true; data: TResponse } | { success: false };
}

export function buildHookError(
  status: number,
  body: Partial<DryRunErrorBody>,
  fallback: string
): LpReportingHookError {
  const error = new Error(body.message ?? fallback) as LpReportingHookError;
  error.code = body.code ?? body.error ?? 'UNKNOWN';
  error.status = status;
  return error;
}

export async function readContractResponse<TResponse>(
  res: Response,
  schema: ContractResponseSchema<TResponse>,
  contractErrorMessage: string
): Promise<TResponse> {
  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as Partial<DryRunErrorBody>;
    throw buildHookError(res.status, errorBody, `HTTP ${res.status}`);
  }

  const raw = (await res.json()) as unknown;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const error = new Error(contractErrorMessage) as LpReportingHookError;
    error.code = 'CONTRACT_PARSE_ERROR';
    error.status = res.status;
    throw error;
  }

  return parsed.data;
}

export async function contractFetch<TResponse>(
  url: string,
  init: RequestInit,
  schema: ContractResponseSchema<TResponse>,
  contractErrorMessage: string
): Promise<TResponse> {
  const res = await fetch(url, init);
  return readContractResponse(res, schema, contractErrorMessage);
}
