import { useQuery } from '@tanstack/react-query';
import {
  FinancialFactsLatestReferenceV1Schema,
  type FinancialFactsLatestReferenceV1,
} from '@shared/contracts/lp-reporting';

import { contractFetch, type LpReportingHookError } from './contract-fetch';

export interface FinancialFactsLatestReferenceResult {
  reference: FinancialFactsLatestReferenceV1;
  ifMatch: string;
}

export function financialFactsIfMatch(reference: FinancialFactsLatestReferenceV1): string {
  return reference.head === null
    ? '"financial-facts:none"'
    : `"financial-facts:${reference.head.snapshotId}:${reference.head.snapshotInputHash}"`;
}

export function useFinancialFactsLatestReference(fundId: number | null) {
  return useQuery<FinancialFactsLatestReferenceResult, LpReportingHookError>({
    queryKey: ['lp-reporting', 'financial-facts-latest-reference', fundId],
    enabled: fundId !== null,
    retry: false,
    queryFn: async () => {
      if (fundId === null) {
        const error = new Error('fundId is required') as LpReportingHookError;
        error.code = 'MISSING_FUND_ID';
        throw error;
      }
      const reference = await contractFetch(
        `/api/funds/${fundId}/financial-facts/latest-reference`,
        { method: 'GET' },
        FinancialFactsLatestReferenceV1Schema,
        'Latest financial-facts reference did not match the locked contract.'
      );
      return { reference, ifMatch: financialFactsIfMatch(reference) };
    },
  });
}
