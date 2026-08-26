import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BulkResolveRequestSchema,
  BulkResolveResponseSchema,
  CommitImportBatchRequestSchema,
  CommitImportBatchResponseSchema,
  ImportBatchStatusResponseSchema,
  ListReconciliationCasesResponseSchema,
  ResolveCaseRequestSchema,
  ReconciliationCaseResponseSchema,
  StageImportBatchRequestSchema,
  StageImportBatchReceiptSchema,
  type BulkResolveRequest,
  type BulkResolveResponse,
  type CommitImportBatchRequest,
  type CommitImportBatchResponse,
  type ImportBatchStatusResponse,
  type ListReconciliationCasesResponse,
  type ResolveCaseRequest,
  type ReconciliationCaseDto,
  type ReconciliationCaseResponse,
  type StageImportBatchRequest,
  type StageImportBatchReceipt,
} from '@shared/contracts/financial-observations/reconciliation-api.contract';

import { contractFetch } from './contract-fetch';
import type { LpReportingHookError } from './contract-fetch';

type ReconciliationCaseStatus = ReconciliationCaseDto['status'];

interface WithFundId {
  fundId: number | null;
}

export interface StageImportBatchMutationRequest {
  body: StageImportBatchRequest;
  idempotencyKey: string;
}

export interface ResolveCaseMutationRequest {
  caseId: number;
  ifMatch: string;
  body: ResolveCaseRequest;
}

export interface CommitImportBatchMutationRequest {
  batchId: number;
  ifMatch: string;
  body: CommitImportBatchRequest;
}

function requireFundId(fundId: number | null): number {
  if (fundId !== null) {
    return fundId;
  }
  const error = new Error('fundId is required') as LpReportingHookError;
  error.code = 'MISSING_FUND_ID';
  throw error;
}

function importBatchQueryKey(fundId: number | null, batchId: number | null) {
  return ['lp-reporting', 'import-batch-v2', fundId, batchId] as const;
}

function reconciliationCasesQueryKey(
  fundId: number | null,
  status: ReconciliationCaseStatus | undefined
) {
  return ['lp-reporting', 'reconciliation-cases-v2', fundId, status ?? 'all'] as const;
}

export function useStageImportBatch({ fundId }: WithFundId) {
  const queryClient = useQueryClient();

  return useMutation<
    StageImportBatchReceipt,
    LpReportingHookError,
    StageImportBatchMutationRequest
  >({
    mutationFn: async ({ body, idempotencyKey }) => {
      const scopedFundId = requireFundId(fundId);
      StageImportBatchRequestSchema.parse(body);
      return contractFetch(
        `/api/funds/${scopedFundId}/imports/batches`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify(body),
        },
        StageImportBatchReceiptSchema,
        'Import batch stage response did not match the locked contract.'
      );
    },
    onSuccess: (receipt) => {
      queryClient.invalidateQueries({ queryKey: importBatchQueryKey(fundId, receipt.batchId) });
      queryClient.invalidateQueries({ queryKey: reconciliationCasesQueryKey(fundId, 'open') });
    },
  });
}

export function useImportBatchStatus(fundId: number | null, batchId: number | null) {
  return useQuery<ImportBatchStatusResponse, LpReportingHookError>({
    queryKey: importBatchQueryKey(fundId, batchId),
    enabled: fundId !== null && batchId !== null,
    retry: false,
    queryFn: async () => {
      const scopedFundId = requireFundId(fundId);
      if (batchId === null) {
        const error = new Error('batchId is required') as LpReportingHookError;
        error.code = 'MISSING_BATCH_ID';
        throw error;
      }
      return contractFetch(
        `/api/funds/${scopedFundId}/imports/batches/${batchId}`,
        { method: 'GET' },
        ImportBatchStatusResponseSchema,
        'Import batch status response did not match the locked contract.'
      );
    },
  });
}

export function useReconciliationCases(
  fundId: number | null,
  status: ReconciliationCaseStatus | undefined
) {
  return useQuery<ListReconciliationCasesResponse, LpReportingHookError>({
    queryKey: reconciliationCasesQueryKey(fundId, status),
    enabled: fundId !== null,
    retry: false,
    queryFn: async () => {
      const scopedFundId = requireFundId(fundId);
      const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
      return contractFetch(
        `/api/funds/${scopedFundId}/reconciliation/cases${suffix}`,
        { method: 'GET' },
        ListReconciliationCasesResponseSchema,
        'Reconciliation cases response did not match the locked contract.'
      );
    },
  });
}

export function useResolveReconciliationCase({ fundId }: WithFundId) {
  const queryClient = useQueryClient();

  return useMutation<ReconciliationCaseResponse, LpReportingHookError, ResolveCaseMutationRequest>({
    mutationFn: async ({ caseId, ifMatch, body }) => {
      const scopedFundId = requireFundId(fundId);
      ResolveCaseRequestSchema.parse(body);
      return contractFetch(
        `/api/funds/${scopedFundId}/reconciliation/cases/${caseId}/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'If-Match': ifMatch },
          body: JSON.stringify(body),
        },
        ReconciliationCaseResponseSchema,
        'Resolve case response did not match the locked contract.'
      );
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: reconciliationCasesQueryKey(fundId, 'open') });
      queryClient.invalidateQueries({
        queryKey: importBatchQueryKey(fundId, response.case.importBatchId),
      });
    },
  });
}

export function useBulkResolveReconciliationCases({ fundId }: WithFundId) {
  const queryClient = useQueryClient();

  return useMutation<BulkResolveResponse, LpReportingHookError, BulkResolveRequest>({
    mutationFn: async (body) => {
      const scopedFundId = requireFundId(fundId);
      BulkResolveRequestSchema.parse(body);
      return contractFetch(
        `/api/funds/${scopedFundId}/reconciliation/cases/bulk-resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        BulkResolveResponseSchema,
        'Bulk resolve response did not match the locked contract.'
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reconciliationCasesQueryKey(fundId, 'open') });
      queryClient.invalidateQueries({ queryKey: ['lp-reporting', 'import-batch-v2', fundId] });
    },
  });
}

export function useCommitImportBatch({ fundId }: WithFundId) {
  const queryClient = useQueryClient();

  return useMutation<
    CommitImportBatchResponse,
    LpReportingHookError,
    CommitImportBatchMutationRequest
  >({
    mutationFn: async ({ batchId, ifMatch, body }) => {
      const scopedFundId = requireFundId(fundId);
      CommitImportBatchRequestSchema.parse(body);
      return contractFetch(
        `/api/funds/${scopedFundId}/imports/batches/${batchId}/commit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'If-Match': ifMatch },
          body: JSON.stringify(body),
        },
        CommitImportBatchResponseSchema,
        'Import batch commit response did not match the locked contract.'
      );
    },
    onSuccess: (response) => {
      queryClient.setQueryData(importBatchQueryKey(fundId, response.batch.batchId), response.batch);
      queryClient.invalidateQueries({ queryKey: reconciliationCasesQueryKey(fundId, 'open') });
    },
  });
}

export function reconciliationErrorEnvelope(err: LpReportingHookError) {
  return {
    title: err.code ?? 'Import request failed',
    description: err.message || 'The reconciliation request failed.',
    status: err.status ?? '',
  };
}
